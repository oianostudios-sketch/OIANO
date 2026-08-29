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
// Usage:
//   TARGET_URL=https://oiano-staging.onrender.com \
//   ARTIST_EMAIL=... ARTIST_PASSWORD=... \
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... \
//   STUDIO_ID=studio-dreamz ROOM_ID=room-studio-a SERVICE_ID=svc-recording \
//   CONCURRENCY=200 DURATION_SEC=30 \
//   node scripts/load-test.js

const autocannon = require('autocannon');
const http = require('http');
const https = require('https');

const TARGET_URL = process.env.TARGET_URL;
// Defaults sized to the real target: 4,000 expected peak concurrent
// attendees. Running 4,000 held-open connections requires enough local file
// descriptors/ephemeral ports on the machine driving the test — if this
// script is run from a laptop rather than a cloud VM, raise the OS's open-
// file limit first (`ulimit -n`) or it'll hit a local ceiling before the
// server does, producing a false negative.
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4000);
const DURATION_SEC = Number(process.env.DURATION_SEC ?? 30);
const SSE_CONNECTIONS = Number(process.env.SSE_CONNECTIONS ?? CONCURRENCY);

if (!TARGET_URL) {
  console.error('TARGET_URL is required — point this at a disposable staging deploy, never a shared dev server or production.');
  process.exit(1);
}
if (/localhost|127\.0\.0\.1/.test(TARGET_URL)) {
  console.error(`Refusing to run against ${TARGET_URL} — this looks like a local dev server. See the Phase 1 finding: a burst here degraded a shared dev server's DB pool. Point TARGET_URL at disposable staging instead.`);
  process.exit(1);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name}. See the usage comment at the top of this script.`);
    process.exit(1);
  }
  return value;
}

async function login(email, password) {
  const res = await fetch(`${TARGET_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);
  return data.token;
}

function runAutocannon(opts) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(opts, (err, result) => (err ? reject(err) : resolve(result)));
    autocannon.track(instance, { renderProgressBar: true });
  });
}

// autocannon is built for high-throughput short requests, not long-held
// streaming connections — SSE needs its own holder. This just opens N
// connections and keeps them alive for the test duration; the thing being
// measured (memory/file-descriptor ceiling, whether they silently drop) is
// read off the Render dashboard during the run, not from this script's output.
function holdSseConnections(url, token, count, durationMs) {
  const client = url.startsWith('https') ? https : http;
  return new Promise((resolve) => {
    let opened = 0, closed = 0, errored = 0;
    const reqs = [];
    for (let i = 0; i < count; i++) {
      const req = client.get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
        opened++;
        res.on('data', () => {}); // drain, don't buffer
      });
      req.on('error', () => { errored++; });
      reqs.push(req);
    }
    setTimeout(() => {
      reqs.forEach((r) => r.destroy());
      closed = count;
      resolve({ requested: count, opened, errored, closed });
    }, durationMs);
  });
}

async function checkHealthRecovery(maxWaitSec = 30, intervalSec = 2) {
  const started = Date.now();
  for (let elapsed = 0; elapsed <= maxWaitSec; elapsed += intervalSec) {
    const res = await fetch(`${TARGET_URL}/health`);
    const data = await res.json();
    if (data.status === 'ok') {
      return { recovered: true, afterMs: Date.now() - started };
    }
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
  }
  return { recovered: false, afterMs: Date.now() - started };
}

async function main() {
  const artistEmail = requireEnv('ARTIST_EMAIL');
  const artistPassword = requireEnv('ARTIST_PASSWORD');
  const adminEmail = requireEnv('ADMIN_EMAIL');
  const adminPassword = requireEnv('ADMIN_PASSWORD');
  const studioId = requireEnv('STUDIO_ID');
  const roomId = requireEnv('ROOM_ID');
  const serviceId = requireEnv('SERVICE_ID');

  console.log(`Target: ${TARGET_URL} | concurrency: ${CONCURRENCY} | duration: ${DURATION_SEC}s`);
  console.log('Logging in test accounts...');
  const artistToken = await login(artistEmail, artistPassword);
  const adminToken = await login(adminEmail, adminPassword);

  console.log('\n=== 1. Concurrent POST /api/bookings ===');
  let slot = 0;
  const bookingsResult = await runAutocannon({
    url: `${TARGET_URL}/api/bookings`,
    connections: CONCURRENCY,
    duration: DURATION_SEC,
    method: 'POST',
    headers: { Authorization: `Bearer ${artistToken}`, 'Content-Type': 'application/json' },
    setupRequest: (request) => {
      // Spread bookings across distinct hour slots so most don't collide on
      // the room/time exclusion constraint — this is measuring write
      // throughput and rate-limit behavior, not just constraint-rejection.
      const hourOffset = (slot++ % 200) + 1;
      const startsAt = new Date(Date.now() + hourOffset * 3_600_000);
      const endsAt = new Date(startsAt.getTime() + 3_600_000);
      request.body = JSON.stringify({
        room_id: roomId,
        studio_id: studioId,
        service_id: serviceId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      });
      return request;
    },
  });
  console.log(`2xx: ${bookingsResult['2xx']} | 429: ${bookingsResult['4xx']} (includes valid rejections + rate limits) | 5xx: ${bookingsResult['5xx']} | p99: ${bookingsResult.latency.p99}ms`);

  console.log(`\n=== 2. ${SSE_CONNECTIONS} concurrent SSE connections, held for ${DURATION_SEC}s ===`);
  const sseResult = await holdSseConnections(
    `${TARGET_URL}/api/notifications/stream`,
    artistToken,
    SSE_CONNECTIONS,
    DURATION_SEC * 1000,
  );
  console.log(`Requested: ${sseResult.requested} | opened: ${sseResult.opened} | errored: ${sseResult.errored}`);
  console.log('(Watch Render dashboard memory/CPU during this phase — that\'s the real signal, not this count.)');

  console.log('\n=== 3. Concurrent GET /api/studio/pulse ===');
  const pulseResult = await runAutocannon({
    url: `${TARGET_URL}/api/studio/pulse`,
    connections: CONCURRENCY,
    duration: DURATION_SEC,
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`2xx: ${pulseResult['2xx']} | 5xx: ${pulseResult['5xx']} | p50: ${pulseResult.latency.p50}ms | p99: ${pulseResult.latency.p99}ms`);
  console.log('If p99 is far above the 60s-cache steady-state latency, the cache may not be serializing concurrent misses (cache stampede).');

  console.log('\n=== 4. Post-burst /health recovery check ===');
  const recovery = await checkHealthRecovery();
  if (recovery.recovered) {
    console.log(`Recovered after ${recovery.afterMs}ms.`);
  } else {
    console.error(`DID NOT RECOVER within the check window. This reproduces the Phase 1 finding — treat as a hard blocker, not a known risk.`);
  }

  console.log('\n=== Summary — compare against Phase 4\'s hard-blocker list ===');
  console.log(JSON.stringify({
    bookings: { ok2xx: bookingsResult['2xx'], err5xx: bookingsResult['5xx'], p99ms: bookingsResult.latency.p99 },
    sse: sseResult,
    pulse: { ok2xx: pulseResult['2xx'], err5xx: pulseResult['5xx'], p99ms: pulseResult.latency.p99 },
    healthRecovery: recovery,
  }, null, 2));
}

main().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
