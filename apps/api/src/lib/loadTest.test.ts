import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

// The load test's live-stream report (C36). The script is plain JS run by node,
// so it is loaded with require; nothing here reaches a real server.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const loadTest = require('../../scripts/load-test.js');

test('the target defaults to localhost and needs a flag for any other host', () => {
  const { resolveTarget } = loadTest;
  assert.equal(resolveTarget([], {}), 'http://localhost:4000');
  assert.equal(resolveTarget([], { TARGET_URL: 'http://127.0.0.1:4100/' }), 'http://127.0.0.1:4100');
  assert.equal(resolveTarget(['--target=http://api.oiano.localhost:4000'], {}), 'http://api.oiano.localhost:4000');
  assert.throws(() => resolveTarget([], { TARGET_URL: 'https://oiano-staging.onrender.com' }), /--allow-remote/);
  assert.equal(resolveTarget(['--allow-remote'], { TARGET_URL: 'https://oiano-staging.onrender.com' }), 'https://oiano-staging.onrender.com');
  // A flag wins over the environment, so TARGET_URL cannot quietly redirect a local run.
  assert.throws(() => resolveTarget(['--target=https://staging.example.com'], { TARGET_URL: 'http://localhost:4000' }), /--allow-remote/);
  assert.throws(() => resolveTarget(['--allow-remote', '--target=https://api-prod.example.com'], {}), /production/);
  assert.throws(() => resolveTarget(['--allow-remote', '--target=https://PROD.example.com'], {}), /production/);
  assert.equal(resolveTarget(['--allow-remote', '--i-know-this-is-production', '--target=https://api-prod.example.com'], {}), 'https://api-prod.example.com');
  assert.throws(() => resolveTarget(['--target=ftp://localhost'], {}), /http/);
  assert.throws(() => resolveTarget(['--target=not a url'], {}), /not a URL/);
});

test('the stream parser reassembles events split across chunks and skips heartbeats', () => {
  const events: unknown[] = [];
  const push = loadTest.createSseParser((event: unknown) => events.push(event));
  push('data: {"type":"conn');
  push('ected"}\n\n: heartbeat\n\n');
  push('data: plain text\r\n\r\ndata: {"type":"studio_announcement",');
  assert.deepEqual(events, [{ type: 'connected' }, 'plain text']);
  push('"announcement":{"title":"x"}}\n\n');
  assert.deepEqual(events[2], { type: 'studio_announcement', announcement: { title: 'x' } });
  assert.equal(events.length, 3);
});

test('percentiles are nearest-rank values that were measured', () => {
  const { percentile } = loadTest;
  const values = Array.from({ length: 20 }, (_, i) => 20 - i); // 20..1, unsorted on purpose
  assert.equal(percentile(values, 50), 10);
  assert.equal(percentile(values, 95), 19);
  assert.equal(percentile(values, 100), 20);
  assert.equal(percentile([7], 95), 7);
  assert.equal(percentile([], 50), null);
});

test('the report owes a probe only to streams held when it went out', () => {
  const stream = (account: number, openedAt: number, firstEventAt: number | null, closedAt: number | null, probes: Record<string, number>) => (
    { account, requestedAt: openedAt - 5, openedAt, firstEventAt, closedAt, probes }
  );
  const streams = [
    stream(0, 10, 12, null, { 1: 110, 2: 230 }), // held throughout, heard both
    stream(1, 10, 14, null, { 1: 140 }), // held throughout, missed probe 2
    stream(0, 10, 18, 50, {}), // dropped before probe 1: owed nothing
    stream(1, 10, 13, 205, {}), // dropped after probe 2 went out without hearing it: missed
    stream(0, 150, null, null, { 2: 220 }), // opened after probe 1, heard probe 2, never saw `connected`
    stream(1, 10, 15, null, { 1: 9_000 }), // heard probe 1 too late to count
  ];
  const probes = [
    { id: '1', sentAt: 100, status: 201 },
    { id: '2', sentAt: 200, status: 201, rateLimitedMs: 61_000 },
    { id: '3', sentAt: 300, status: 429 },
  ];
  const report = loadTest.summarizeStreams({
    requested: 8, streams, openMs: 40, probes, accounts: ['a@test', 'b@test'], probeWaitMs: 5_000,
    failures: { ticketStatus: { 200: 7, 429: 1 }, streamStatus: { 200: 6, 401: 1 }, networkErrors: 0 },
  });

  assert.deepEqual(report.connections, {
    requested: 8, established: 6, failed: 2, droppedBeforeEnd: 2, heldToEnd: 4,
    ticketStatus: { 200: 7, 429: 1 }, streamStatus: { 200: 6, 401: 1 }, networkErrors: 0, openMs: 40,
  });
  // Five streams saw an event: 7, 9, 13, 8 and 10ms after their requests.
  assert.deepEqual(report.timeToFirstEventMs, { p50: 9, p95: 13, max: 13, noEvent: 1 });
  assert.deepEqual(report.probes.perProbe, [
    { id: '1', status: 201, owed: 4, reached: 2, rateLimitedMs: 0 },
    { id: '2', status: 201, owed: 5, reached: 2, rateLimitedMs: 61_000 },
    { id: '3', status: 429, owed: 0, reached: 0, rateLimitedMs: 0 },
  ]);
  assert.equal(report.probes.owed, 9);
  assert.equal(report.probes.delivered, 4);
  assert.equal(report.probes.missed, 5);
  assert.equal(report.probes.reachedEveryHeldStream, false);
  // Deliveries: 10, 40, 30, 20ms.
  assert.deepEqual(report.probes.latencyMs, { p50: 20, p95: 40, max: 40 });
  assert.deepEqual(report.probes.accountsThatHeardNothing, []);

  const perfect = loadTest.summarizeStreams({
    requested: 1, streams: [stream(0, 10, 12, null, { 1: 101 })], openMs: 1, probes: [probes[0]], accounts: ['a@test'],
    failures: { ticketStatus: {}, streamStatus: {}, networkErrors: 0 },
  });
  assert.equal(perfect.probes.reachedEveryHeldStream, true);
  const deaf = loadTest.summarizeStreams({
    requested: 1, streams: [stream(1, 10, 12, null, {})], openMs: 1, probes: [probes[0]], accounts: ['a@test', 'b@test'],
    failures: { ticketStatus: {}, streamStatus: {}, networkErrors: 0 },
  });
  assert.equal(deaf.probes.reachedEveryHeldStream, false);
  assert.deepEqual(deaf.probes.accountsThatHeardNothing, ['b@test']);
  // No probe accepted is not a pass.
  const unpublished = loadTest.summarizeStreams({
    requested: 1, streams: [stream(0, 10, 12, null, {})], openMs: 1, probes: [probes[2]],
    failures: { ticketStatus: {}, streamStatus: {}, networkErrors: 0 },
  });
  assert.equal(unpublished.probes.reachedEveryHeldStream, false);
});

test('held streams record their first event and the probes they hear, against a stub server', async (t) => {
  const open = new Set<http.ServerResponse>();
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/notifications/stream-ticket') {
      const ticket = req.headers.authorization === 'Bearer good' ? 'ok' : null;
      res.writeHead(ticket ? 200 : 401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ticket }));
      return;
    }
    if (req.url === '/api/notifications/stream?ticket=ok') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"type":"connected"}\n\n');
      open.add(res);
      req.on('close', () => open.delete(res));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const held = await loadTest.openSseStreams({ baseUrl, tokens: ['good', 'good', 'bad'], count: 6, openConcurrency: 3 });
  assert.equal(held.streams.length, 4);
  assert.deepEqual(held.failures.ticketStatus, { 200: 4, 401: 2 });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(held.streams.every((stream: { firstEventAt: number | null }) => stream.firstEventAt !== null));

  const [first, ...rest] = [...open];
  first.destroy(); // one listener drops before the probe
  await new Promise((resolve) => setTimeout(resolve, 50));
  const sentAt = performance.now();
  for (const res of rest) res.write('data: {"type":"studio_announcement","announcement":{"title":"load-test probe 1"}}\n\n');
  await new Promise((resolve) => setTimeout(resolve, 50));
  held.close();
  for (const res of open) res.destroy();

  const report = loadTest.summarizeStreams({
    requested: 6, streams: held.streams, failures: held.failures, openMs: held.openMs, probes: [{ id: '1', sentAt, status: 201 }],
  });
  assert.equal(report.connections.established, 4);
  assert.equal(report.connections.failed, 2);
  assert.equal(report.connections.droppedBeforeEnd, 1);
  assert.equal(report.connections.heldToEnd, 3);
  assert.equal(report.timeToFirstEventMs.noEvent, 0);
  assert.deepEqual(report.probes.perProbe, [{ id: '1', status: 201, owed: 3, reached: 3, rateLimitedMs: 0 }]);
  assert.equal(report.probes.reachedEveryHeldStream, true);
});
