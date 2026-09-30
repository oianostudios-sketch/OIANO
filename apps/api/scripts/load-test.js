#!/usr/bin/env node
// apps/api/scripts/load-test.js
//
// Empirical load test for SCALE_READINESS_ROADMAP.md-adjacent launch-day
// readiness (see the "OIANO — Safe Execution Plan to Launch-Day Readiness"
// plan). Exercises the three risk points identified for a live-event launch:
//   1. Concurrent POST /api/bookings — the busiest write path.
//   2. Concurrent SSE connections held open against the notifications stream.
//   3. Concurrent GET /api/studio/pulse polling, against its 60s cache.
// Then checks whether /health recovers promptly after the burst — a burst
// that degrades the DB pool and doesn't self-heal is worse than the burst
// itself (see the Phase 1 finding: a dev-server burst left the Prisma pool
// reporting `database: unreachable` for longer than expected).
//
// SAFETY: never point this at a shared dev server or production. Run it
// only against a disposable staging deploy, seeded with real data. Reads
// its target and test-account credentials from env vars so nothing is
// hardcoded to any specific environment.
//
// RATE LIMITS: while the limiters key on the client IP
// (src/middleware/rateLimit.middleware.ts), everything this machine sends
// shares one budget per limiter however many accounts it uses: 300 requests
// a minute through the global limiter and 20 booking attempts a minute
// through the booking limiter. Read the responses by status, not the totals.
// See docs/OIANO_RATE_LIMIT_PROPOSAL.md.
//
// Usage:
//   TARGET_URL=https://oiano-staging.onrender.com \
//   ARTIST_ACCOUNTS_FILE=/outside/the/repo/artists.json \
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... \
//   STUDIO_ID=... ROOM_ID=... SERVICE_ID=... \
//   CONCURRENCY=200 DURATION_SEC=30 \
//   node scripts/load-test.js
//
// ARTIST_ACCOUNTS_FILE holds a JSON array of {"email": "...", "password": "..."}
// for ARTIST accounts whose wallets can pay for the service. Bookings and
// streams take the accounts in turn. ARTIST_EMAIL and ARTIST_PASSWORD still
// work for a single account. ADMIN_EMAIL is a STUDIO_ADMIN of the studio, for
// the pulse phase.

const autocannon = require('autocannon');
const fs = require('fs');
const http = require('http');
const https = require('https');

// Defaults sized to the real target: 4,000 expected peak concurrent
// attendees. Running 4,000 held-open connections requires enough local file
// descriptors/ephemeral ports on the machine driving the test — if this
// script is run from a laptop rather than a cloud VM, raise the OS's open-
// file limit first (`ulimit -n`) or it'll hit a local ceiling before the
// server does, producing a false negative.
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4000);
const DURATION_SEC = Number(process.env.DURATION_SEC ?? 30);
const SSE_CONNECTIONS = Number(process.env.SSE_CONNECTIONS ?? CONCURRENCY);
// Streams being set up at the same moment. Set it to SSE_CONNECTIONS to have
// every connection arrive at once.
const SSE_OPEN_CONCURRENCY = Number(process.env.SSE_OPEN_CONCURRENCY ?? 100);
// A request not answered by then counts as a network error.
const RESPONSE_TIMEOUT_MS = 30_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name}. See the usage comment at the top of this script.`);
    process.exit(1);
  }
  return value;
}

function readArtistAccounts() {
  const file = process.env.ARTIST_ACCOUNTS_FILE;
  if (!file) return [{ email: requireEnv('ARTIST_EMAIL'), password: requireEnv('ARTIST_PASSWORD') }];
  const accounts = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(accounts) || accounts.length === 0 || accounts.some((account) => !account?.email || !account?.password)) {
    console.error(`${file} must hold a non-empty JSON array of {"email", "password"} objects.`);
    process.exit(1);
  }
  return accounts;
}

// Every /api/auth route shares one limiter of 10 requests a minute, so logging
// in more than ten accounts waits out the window instead of failing.
async function login(baseUrl, { email, password }) {
  for (let rateLimited = 0; ; rateLimited++) {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(RESPONSE_TIMEOUT_MS),
    });
    if (res.status === 429 && rateLimited < 3) {
      const waitSec = Number(res.headers.get('retry-after')) || 60;
      await res.text();
      console.log(`  Login rate limited; retrying ${email} in ${waitSec}s`);
      await sleep(waitSec * 1000);
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (data.mfa_required) throw new Error(`${email} must pass MFA to sign in; use an account without it`);
    if (!data.token) throw new Error(`Login failed for ${email} (${res.status}): ${JSON.stringify(data)}`);
    return data.token;
  }
}

function runAutocannon(opts) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(opts, (err, result) => (err ? reject(err) : resolve(result)));
    autocannon.track(instance, { renderProgressBar: true });
  });
}

// { "201": 12, "429": 3000 }
function countsByStatus(result) {
  return Object.fromEntries(Object.entries(result.statusCodeStats).map(([status, { count }]) => [status, count]));
}

// Each booking goes out as the next account in turn and asks for the next hour
// slot, so the burst is neither one wallet draining nor one slot colliding.
// autocannon calls setupRequest only on an entry of `requests`. Passed at the
// top level, as this script used to, it is ignored and every booking goes out
// without a body.
function bookingBurstOptions({ baseUrl, tokens, studioId, roomId, serviceId, connections, durationSec, slots = 200 }) {
  let sent = 0;
  return {
    url: `${baseUrl}/api/bookings`,
    connections,
    duration: durationSec,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    requests: [{
      setupRequest: (request) => {
        const n = sent++;
        const startsAt = new Date(Date.now() + ((n % slots) + 1) * 3_600_000);
        const endsAt = new Date(startsAt.getTime() + 3_600_000);
        return {
          ...request,
          headers: { ...request.headers, Authorization: `Bearer ${tokens[n % tokens.length]}` },
          body: JSON.stringify({
            room_id: roomId,
            studio_id: studioId,
            service_id: serviceId,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
          }),
        };
      },
    }],
  };
}

// The stream accepts only a ticket from POST /api/notifications/stream-ticket,
// passed as ?ticket=; a Bearer header gets a 401. A ticket lasts 60 seconds and
// is checked when the stream opens, so each connection fetches its own just
// before opening. Only a 200 counts as opened. Holding thousands of streams is
// what this phase is for, and autocannon is built for short requests, so the
// streams are held here; memory and file descriptors are read off the Render
// dashboard during the run.
async function holdSseConnections({ baseUrl, tokens, count, durationMs, openConcurrency }) {
  const client = baseUrl.startsWith('https') ? https : http;
  const result = { requested: count, opened: 0, stillOpen: 0, droppedEarly: 0, errored: 0, openMs: 0, ticketStatus: {}, streamStatus: {} };
  const tally = (counts, status) => { counts[status] = (counts[status] ?? 0) + 1; };
  const open = new Set();
  let stopping = false;

  async function openOne(i) {
    let ticket;
    try {
      const res = await fetch(`${baseUrl}/api/notifications/stream-ticket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens[i % tokens.length]}` },
        signal: AbortSignal.timeout(RESPONSE_TIMEOUT_MS),
      });
      tally(result.ticketStatus, res.status);
      if (res.status !== 200) {
        await res.text();
        return;
      }
      ({ ticket } = await res.json());
    } catch {
      result.errored++;
      return;
    }

    await new Promise((resolve) => {
      let answered = false;
      const req = client.get(`${baseUrl}/api/notifications/stream?ticket=${encodeURIComponent(ticket)}`, (res) => {
        answered = true;
        clearTimeout(timer);
        tally(result.streamStatus, res.statusCode);
        if (res.statusCode === 200) {
          result.opened++;
          open.add(req);
          res.on('close', () => {
            open.delete(req);
            if (!stopping) result.droppedEarly++;
          });
        }
        res.resume(); // drain, don't buffer
        resolve();
      });
      const timer = setTimeout(() => req.destroy(new Error('No response')), RESPONSE_TIMEOUT_MS);
      req.on('error', () => {
        clearTimeout(timer);
        if (!answered && !stopping) result.errored++;
        resolve();
      });
    });
  }

  let next = 0;
  const startedAt = Date.now();
  await Promise.all(Array.from({ length: Math.min(openConcurrency, count) }, async () => {
    while (next < count) await openOne(next++);
  }));
  result.openMs = Date.now() - startedAt;

  await sleep(durationMs);
  result.stillOpen = open.size;
  stopping = true;
  for (const req of open) req.destroy();
  return result;
}

// /health sits behind the global limiter, and the burst has usually spent this
// machine's budget for the minute. A 429 says nothing about the database, so
// the window is waited out rather than counted against recovery.
async function checkHealthRecovery(baseUrl, maxWaitSec = 30, intervalSec = 2) {
  const started = Date.now();
  let rateLimitedMs = 0;
  for (;;) {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(RESPONSE_TIMEOUT_MS) }).catch(() => null);
    if (res?.status === 429 && rateLimitedMs < 5 * 60_000) {
      const resetInMs = Number(res.headers.get('x-ratelimit-reset')) * 1000 - Date.now();
      const waitMs = Math.min(Math.max(resetInMs + 500, 1000), 61_000);
      await res.text();
      rateLimitedMs += waitMs;
      await sleep(waitMs);
      continue;
    }
    const data = res ? await res.json().catch(() => ({})) : {};
    const afterMs = Date.now() - started - rateLimitedMs;
    if (data.status === 'ok') return { recovered: true, afterMs, rateLimitedMs };
    if (afterMs >= maxWaitSec * 1000) return { recovered: false, afterMs, rateLimitedMs };
    await sleep(intervalSec * 1000);
  }
}

async function main() {
  const targetUrl = process.env.TARGET_URL;
  if (!targetUrl) {
    console.error('TARGET_URL is required — point this at a disposable staging deploy, never a shared dev server or production.');
    process.exit(1);
  }
  if (/localhost|127\.0\.0\.1/.test(targetUrl)) {
    console.error(`Refusing to run against ${targetUrl} — this looks like a local dev server. See the Phase 1 finding: a burst here degraded a shared dev server's DB pool. Point TARGET_URL at disposable staging instead.`);
    process.exit(1);
  }

  const artistAccounts = readArtistAccounts();
  const adminEmail = requireEnv('ADMIN_EMAIL');
  const adminPassword = requireEnv('ADMIN_PASSWORD');
  const studioId = requireEnv('STUDIO_ID');
  const roomId = requireEnv('ROOM_ID');
  const serviceId = requireEnv('SERVICE_ID');

  console.log(`Target: ${targetUrl} | concurrency: ${CONCURRENCY} | duration: ${DURATION_SEC}s | artist accounts: ${artistAccounts.length}`);
  console.log('Logging in test accounts...');
  const artistTokens = [];
  for (const account of artistAccounts) artistTokens.push(await login(targetUrl, account));
  const adminToken = await login(targetUrl, { email: adminEmail, password: adminPassword });

  console.log('\n=== 1. Concurrent POST /api/bookings ===');
  const bookingsResult = await runAutocannon(bookingBurstOptions({
    baseUrl: targetUrl,
    tokens: artistTokens,
    studioId,
    roomId,
    serviceId,
    connections: CONCURRENCY,
    durationSec: DURATION_SEC,
  }));
  const bookingStatus = countsByStatus(bookingsResult);
  console.log(`Responses by status: ${JSON.stringify(bookingStatus)} | p99 of 2xx: ${bookingsResult.latency.p99}ms`);
  console.log('201 booked | 400 invalid body | 402 wallet short | 409 slot taken | 429 rate limited');

  console.log(`\n=== 2. ${SSE_CONNECTIONS} concurrent SSE connections, held for ${DURATION_SEC}s ===`);
  const sseResult = await holdSseConnections({
    baseUrl: targetUrl,
    tokens: artistTokens,
    count: SSE_CONNECTIONS,
    durationMs: DURATION_SEC * 1000,
    openConcurrency: SSE_OPEN_CONCURRENCY,
  });
  console.log(`Requested: ${sseResult.requested} | opened (200): ${sseResult.opened} | still open at the end: ${sseResult.stillOpen} | dropped early: ${sseResult.droppedEarly} | network errors: ${sseResult.errored}`);
  console.log(`Ticket responses: ${JSON.stringify(sseResult.ticketStatus)} | stream responses: ${JSON.stringify(sseResult.streamStatus)} | opening took ${sseResult.openMs}ms`);
  console.log('(Watch Render dashboard memory/CPU during this phase — that\'s the real signal, not this count.)');

  console.log('\n=== 3. Concurrent GET /api/studio/pulse ===');
  const pulseResult = await runAutocannon({
    url: `${targetUrl}/api/studio/pulse`,
    connections: CONCURRENCY,
    duration: DURATION_SEC,
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const pulseStatus = countsByStatus(pulseResult);
  console.log(`Responses by status: ${JSON.stringify(pulseStatus)} | p50 of 2xx: ${pulseResult.latency.p50}ms | p99 of 2xx: ${pulseResult.latency.p99}ms`);
  console.log('If p99 is far above the 60s-cache steady-state latency, the cache may not be serializing concurrent misses (cache stampede).');

  console.log('\n=== 4. Post-burst /health recovery check ===');
  const recovery = await checkHealthRecovery(targetUrl);
  const waited = recovery.rateLimitedMs ? `, after ${recovery.rateLimitedMs}ms waiting out this machine's rate limit` : '';
  if (recovery.recovered) {
    console.log(`Recovered after ${recovery.afterMs}ms${waited}.`);
  } else {
    console.error(`DID NOT RECOVER within the check window${waited}. This reproduces the Phase 1 finding — treat as a hard blocker, not a known risk.`);
  }

  console.log('\n=== Summary — compare against Phase 4\'s hard-blocker list ===');
  console.log(JSON.stringify({
    bookings: { status: bookingStatus, p99ms: bookingsResult.latency.p99 },
    sse: sseResult,
    pulse: { status: pulseStatus, p99ms: pulseResult.latency.p99 },
    healthRecovery: recovery,
  }, null, 2));
}

// Exported so the request building can be exercised against a stub server
// without pointing the test at anything real.
module.exports = { bookingBurstOptions, checkHealthRecovery, holdSseConnections, login };

if (require.main === module) {
  main().catch((err) => {
    console.error('Load test failed:', err);
    process.exit(1);
  });
}
