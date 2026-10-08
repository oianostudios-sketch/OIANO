#!/usr/bin/env node
// apps/api/scripts/load-test.js
//
// Empirical load test for SCALE_READINESS_ROADMAP.md-adjacent launch-day
// readiness (see the "OIANO — Safe Execution Plan to Launch-Day Readiness"
// plan). Exercises the three risk points identified for a live-event launch:
//   1. Concurrent SSE connections held open against the notifications stream,
//      for the whole of the request mix below, the way an audience holds them
//      while it uses the app.
//   2. Concurrent POST /api/bookings — the busiest write path.
//   3. Concurrent GET /api/studio/pulse polling, against its 60s cache.
// While the streams are held it publishes studio announcements ("probes") and
// times their arrival on every stream, so the run says whether a live update
// reaches the whole audience under load and how long it takes. Then it checks
// whether /health recovers promptly after the burst — a burst that degrades the
// DB pool and doesn't self-heal is worse than the burst itself (see the Phase 1
// finding: a dev-server burst left the Prisma pool reporting `database:
// unreachable` for longer than expected).
//
// TARGET: the default is http://localhost:4000, which must be `npm run
// dev:local` (this checkout's own database). Never run it against `npm run dev`
// or `oiano-dev`: those use the database in .env, which is shared, and a burst
// there is the Phase 1 finding. Any other host needs --allow-remote, and a host
// whose name contains "prod" also needs --i-know-this-is-production. Point a
// remote run at a disposable staging deploy, seeded with real data. Test-account
// credentials come from env vars so nothing is hardcoded to any environment.
//
// RATE LIMITS: the limiters key on the caller (src/lib/rateLimitKey.ts): the
// account when the request carries a token, the client IP when it does not. So
// each account has 600 requests a minute through the global limiter and 20
// booking attempts a minute, and the stream requests themselves, which carry
// only a ticket, share one 600 a minute budget for this machine. Read the
// responses by status, not the totals. See docs/OIANO_RATE_LIMIT_PROPOSAL.md.
//
// PROBES are real announcements: they are saved and shown to the studio's staff
// and the artists who have booked there. They reach only those people (A01), so
// a stream account that is neither will miss every probe; the report names such
// accounts. Book once as each artist at the studio before the run.
//
// Usage:
//   ARTIST_ACCOUNTS_FILE=/outside/the/repo/artists.json \
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... \
//   STUDIO_ID=... ROOM_ID=... SERVICE_ID=... \
//   CONCURRENCY=200 DURATION_SEC=30 SSE_CONNECTIONS=200 \
//   node scripts/load-test.js [--target=https://oiano-staging.onrender.com --allow-remote]
//
// TARGET_URL works in place of --target. ARTIST_ACCOUNTS_FILE holds a JSON
// array of {"email": "...", "password": "..."} for ARTIST accounts whose wallets
// can pay for the service. Bookings and streams take the accounts in turn.
// ARTIST_EMAIL and ARTIST_PASSWORD still work for a single account. ADMIN_EMAIL
// is a STUDIO_ADMIN of the studio, for the pulse phase and the probes;
// PROBE_EMAIL and PROBE_PASSWORD name a second one to send the probes, so they
// are not held up behind the pulse phase's rate limit.

const autocannon = require('autocannon');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');

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
// A probe goes out this often while the request mix runs, and once more after it.
const SSE_PROBE_INTERVAL_SEC = Number(process.env.SSE_PROBE_INTERVAL_SEC ?? 10);
// How long a probe may take to reach the streams before it counts as missed.
const SSE_PROBE_WAIT_MS = Number(process.env.SSE_PROBE_WAIT_MS ?? 5_000);
// A request not answered by then counts as a network error.
const RESPONSE_TIMEOUT_MS = 30_000;
const PROBE_TITLE = 'load-test probe ';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name}. See the usage comment at the top of this script.`);
    process.exit(1);
  }
  return value;
}

// Throws rather than exiting so the rules can be tested. localhost is the
// default; anything else must be asked for, and production must be asked for twice.
function resolveTarget(argv, env) {
  const flag = argv.find((arg) => arg.startsWith('--target='));
  const raw = flag ? flag.slice('--target='.length) : env.TARGET_URL || 'http://localhost:4000';
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${raw} is not a URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`${raw} is not an http(s) URL.`);
  const host = url.hostname.toLowerCase();
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host) || host.endsWith('.localhost');
  if (!local && !argv.includes('--allow-remote')) {
    throw new Error(`Refusing to run against ${url.origin} without --allow-remote. Only a disposable staging deploy should take this load, never a shared dev server or production.`);
  }
  if (host.includes('prod') && !argv.includes('--i-know-this-is-production')) {
    throw new Error(`Refusing to run against ${url.origin}: the host looks like production. Pass --i-know-this-is-production only if real users will not be on it.`);
  }
  return url.origin;
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

// Reads a text/event-stream in whatever chunks it arrives in. Each complete
// event's data lines go to onEvent, parsed as JSON when they are JSON;
// comment lines (the server's heartbeat) are not events.
function createSseParser(onEvent) {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop();
    for (const block of blocks) {
      const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).replace(/^ /, ''));
      if (data.length === 0) continue;
      const text = data.join('\n');
      let event;
      try {
        event = JSON.parse(text);
      } catch {
        event = text;
      }
      onEvent(event);
    }
  };
}

// Nearest-rank percentile, so every figure reported is one that was measured.
function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

const roundMs = (ms) => (ms === null ? null : Math.round(ms * 10) / 10);
const latencySummary = (values) => ({
  p50: roundMs(percentile(values, 50)),
  p95: roundMs(percentile(values, 95)),
  max: roundMs(percentile(values, 100)),
});

// The stream accepts only a ticket from POST /api/notifications/stream-ticket,
// passed as ?ticket=; a Bearer header gets a 401. A ticket lasts 60 seconds and
// is checked when the stream opens, so each connection fetches its own just
// before opening. Only a 200 counts as opened, and time to first event runs from
// the stream request to the server's `connected` event. Holding thousands of
// streams is what this phase is for, and autocannon is built for short
// requests, so the streams are held here; memory and file descriptors are read
// off the Render dashboard during the run. Resolves once every stream has been
// tried, and leaves the opened ones held until close().
async function openSseStreams({ baseUrl, tokens, count, openConcurrency }) {
  const client = baseUrl.startsWith('https') ? https : http;
  const failures = { ticketStatus: {}, streamStatus: {}, networkErrors: 0 };
  const tally = (counts, status) => { counts[status] = (counts[status] ?? 0) + 1; };
  const streams = [];
  let stopping = false;

  async function openOne(i) {
    let ticket;
    try {
      const res = await fetch(`${baseUrl}/api/notifications/stream-ticket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens[i % tokens.length]}` },
        signal: AbortSignal.timeout(RESPONSE_TIMEOUT_MS),
      });
      tally(failures.ticketStatus, res.status);
      if (res.status !== 200) {
        await res.text();
        return;
      }
      ({ ticket } = await res.json());
    } catch {
      failures.networkErrors++;
      return;
    }

    await new Promise((resolve) => {
      let answered = false;
      const requestedAt = performance.now();
      const req = client.get(`${baseUrl}/api/notifications/stream?ticket=${encodeURIComponent(ticket)}`, (res) => {
        answered = true;
        clearTimeout(timer);
        tally(failures.streamStatus, res.statusCode);
        if (res.statusCode !== 200) {
          res.resume();
          resolve();
          return;
        }
        const stream = { account: i % tokens.length, req, requestedAt, openedAt: performance.now(), firstEventAt: null, closedAt: null, probes: {} };
        streams.push(stream);
        res.setEncoding('utf8');
        res.on('data', createSseParser((event) => {
          const at = performance.now();
          if (stream.firstEventAt === null) stream.firstEventAt = at;
          const title = event?.type === 'studio_announcement' ? event.announcement?.title : undefined;
          if (typeof title === 'string' && title.startsWith(PROBE_TITLE)) stream.probes[title.slice(PROBE_TITLE.length)] ??= at;
        }));
        res.on('error', () => {});
        res.on('close', () => {
          if (!stopping) stream.closedAt = performance.now();
        });
        resolve();
      });
      const timer = setTimeout(() => req.destroy(new Error('No response')), RESPONSE_TIMEOUT_MS);
      req.on('error', () => {
        clearTimeout(timer);
        if (!answered && !stopping) failures.networkErrors++;
        resolve();
      });
    });
  }

  let next = 0;
  const startedAt = performance.now();
  await Promise.all(Array.from({ length: Math.min(openConcurrency, count) }, async () => {
    while (next < count) await openOne(next++);
  }));
  const openMs = Math.round(performance.now() - startedAt);

  return {
    streams,
    failures,
    openMs,
    close() {
      stopping = true;
      for (const stream of streams) stream.req.destroy();
    },
  };
}

// Publishes one studio announcement whose title carries the probe's id, and
// records when the accepted request went out; delivery is timed from then. The
// limiter counts the probe account's own requests, so when the pulse phase uses
// the same account its budget is spent; a 429 waits out the window (reported as
// rateLimitedMs) rather than losing the probe. PROBE_EMAIL keeps probes off it.
async function publishProbe(baseUrl, adminToken, id) {
  let rateLimitedMs = 0;
  for (;;) {
    const sentAt = performance.now();
    try {
      const res = await fetch(`${baseUrl}/api/admin/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ title: `${PROBE_TITLE}${id}`, body: 'Sent by apps/api/scripts/load-test.js to time live updates. Ignore it.' }),
        signal: AbortSignal.timeout(RESPONSE_TIMEOUT_MS),
      });
      await res.text();
      if (res.status === 429 && rateLimitedMs < 2 * 60_000) {
        const resetInMs = Number(res.headers.get('x-ratelimit-reset')) * 1000 - Date.now();
        const waitMs = Math.min(Math.max(resetInMs + 500, 1000), 61_000);
        rateLimitedMs += waitMs;
        await sleep(waitMs);
        continue;
      }
      return { id, sentAt, status: res.status, rateLimitedMs };
    } catch {
      return { id, sentAt, status: 'network error', rateLimitedMs };
    }
  }
}

// The report. A stream is owed a probe when it was open when the probe went
// out and did not close before the probe's wait was over; one that dropped
// after the probe went out without receiving it counts as missed, since the
// audience member did not hear it. A probe the server did not accept (not a
// 201) is listed but owes nothing.
function summarizeStreams({ requested, streams, failures, openMs, probes, accounts = [], probeWaitMs = SSE_PROBE_WAIT_MS }) {
  const established = streams.length;
  const deliveries = [];
  const perProbe = [];
  const heardSomething = new Set();
  const owedSomething = new Set();
  for (const probe of probes) {
    if (probe.status !== 201) {
      perProbe.push({ id: probe.id, status: probe.status, owed: 0, reached: 0, rateLimitedMs: probe.rateLimitedMs ?? 0 });
      continue;
    }
    let owed = 0;
    let reached = 0;
    for (const stream of streams) {
      if (stream.openedAt > probe.sentAt) continue;
      const at = stream.probes[probe.id];
      if (at === undefined && stream.closedAt !== null && stream.closedAt < probe.sentAt) continue;
      owed++;
      owedSomething.add(stream.account);
      if (at !== undefined && at - probe.sentAt <= probeWaitMs) {
        reached++;
        heardSomething.add(stream.account);
        deliveries.push(at - probe.sentAt);
      }
    }
    perProbe.push({ id: probe.id, status: probe.status, owed, reached, rateLimitedMs: probe.rateLimitedMs ?? 0 });
  }
  const accepted = perProbe.filter((probe) => probe.status === 201);
  const owed = accepted.reduce((sum, probe) => sum + probe.owed, 0);
  return {
    connections: {
      requested,
      established,
      failed: requested - established,
      droppedBeforeEnd: streams.filter((stream) => stream.closedAt !== null).length,
      heldToEnd: streams.filter((stream) => stream.closedAt === null).length,
      ticketStatus: failures.ticketStatus,
      streamStatus: failures.streamStatus,
      networkErrors: failures.networkErrors,
      openMs,
    },
    timeToFirstEventMs: {
      ...latencySummary(streams.filter((stream) => stream.firstEventAt !== null).map((stream) => stream.firstEventAt - stream.requestedAt)),
      noEvent: streams.filter((stream) => stream.firstEventAt === null).length,
    },
    probes: {
      published: probes.length,
      accepted: accepted.length,
      owed,
      delivered: deliveries.length,
      missed: owed - deliveries.length,
      reachedEveryHeldStream: accepted.length > 0 && owed > 0 && deliveries.length === owed,
      latencyMs: latencySummary(deliveries),
      perProbe,
      accountsThatHeardNothing: [...owedSomething].filter((account) => !heardSomething.has(account)).map((account) => accounts[account] ?? account),
    },
  };
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
  let targetUrl;
  try {
    targetUrl = resolveTarget(process.argv.slice(2), process.env);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const artistAccounts = readArtistAccounts();
  const adminEmail = requireEnv('ADMIN_EMAIL');
  const adminPassword = requireEnv('ADMIN_PASSWORD');
  const studioId = requireEnv('STUDIO_ID');
  const roomId = requireEnv('ROOM_ID');
  const serviceId = requireEnv('SERVICE_ID');

  console.log(`Target: ${targetUrl} | concurrency: ${CONCURRENCY} | duration: ${DURATION_SEC}s | streams: ${SSE_CONNECTIONS} | artist accounts: ${artistAccounts.length}`);
  console.log('Logging in test accounts...');
  const artistTokens = [];
  for (const account of artistAccounts) artistTokens.push(await login(targetUrl, account));
  const adminToken = await login(targetUrl, { email: adminEmail, password: adminPassword });
  const probeToken = process.env.PROBE_EMAIL
    ? await login(targetUrl, { email: process.env.PROBE_EMAIL, password: requireEnv('PROBE_PASSWORD') })
    : adminToken;

  console.log(`\n=== 1. Opening ${SSE_CONNECTIONS} SSE connections, held through phases 2 and 3 ===`);
  const held = await openSseStreams({
    baseUrl: targetUrl,
    tokens: artistTokens,
    count: SSE_CONNECTIONS,
    openConcurrency: SSE_OPEN_CONCURRENCY,
  });
  console.log(`Opened (200): ${held.streams.length} of ${SSE_CONNECTIONS} in ${held.openMs}ms | ticket responses: ${JSON.stringify(held.failures.ticketStatus)} | stream responses: ${JSON.stringify(held.failures.streamStatus)} | network errors: ${held.failures.networkErrors}`);

  const sending = [];
  const probe = () => sending.push(publishProbe(targetUrl, probeToken, String(sending.length + 1)));
  const probeTimer = SSE_PROBE_INTERVAL_SEC > 0 ? setInterval(probe, SSE_PROBE_INTERVAL_SEC * 1000) : null;

  console.log('\n=== 2. Concurrent POST /api/bookings ===');
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

  // One probe after the mix, so even a short run measures delivery, then time
  // for every probe to arrive before the streams are let go.
  if (probeTimer) clearInterval(probeTimer);
  probe();
  const probes = await Promise.all(sending);
  await sleep(SSE_PROBE_WAIT_MS);
  held.close();

  console.log('\n=== 4. Held streams and live-update delivery ===');
  const sse = summarizeStreams({
    requested: SSE_CONNECTIONS,
    streams: held.streams,
    failures: held.failures,
    openMs: held.openMs,
    probes,
    accounts: artistAccounts.map((account) => account.email),
  });
  const { connections, timeToFirstEventMs, probes: delivery } = sse;
  console.log(`Established: ${connections.established} | failed: ${connections.failed} | dropped before the end: ${connections.droppedBeforeEnd} | held to the end: ${connections.heldToEnd}`);
  console.log(`Time to first event: p50 ${timeToFirstEventMs.p50}ms | p95 ${timeToFirstEventMs.p95}ms | max ${timeToFirstEventMs.max}ms | streams with no event: ${timeToFirstEventMs.noEvent}`);
  console.log(`Probes accepted: ${delivery.accepted} of ${delivery.published} | delivered ${delivery.delivered} of ${delivery.owed} owed | latency p50 ${delivery.latencyMs.p50}ms | p95 ${delivery.latencyMs.p95}ms | max ${delivery.latencyMs.max}ms`);
  console.log(delivery.reachedEveryHeldStream ? 'Every probe reached every stream held when it went out.' : 'NOT every held stream heard every probe; see probes.perProbe below.');
  if (delivery.accountsThatHeardNothing.length) console.log(`Accounts whose streams heard no probe (are they staff, or booked at the studio?): ${delivery.accountsThatHeardNothing.join(', ')}`);
  console.log('(Watch Render dashboard memory/CPU during phases 2 and 3 — that\'s the real signal, not these counts.)');

  console.log('\n=== 5. Post-burst /health recovery check ===');
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
    sse,
    pulse: { status: pulseStatus, p99ms: pulseResult.latency.p99 },
    healthRecovery: recovery,
  }, null, 2));
}

// Exported so the request building and the report can be exercised without
// pointing anything at a real server.
module.exports = {
  bookingBurstOptions, checkHealthRecovery, createSseParser, login, openSseStreams, percentile, publishProbe, resolveTarget, summarizeStreams,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('Load test failed:', err);
    process.exit(1);
  });
}
