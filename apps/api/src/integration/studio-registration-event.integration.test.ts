import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';

// Registering a studio records a studio.registered event, and the registration answers only
// once that event is written. It used to be written without waiting, so a client reading it
// straight after the answer could find nothing; that failed CI intermittently. Here the
// event table is held locked while the registration runs, which makes the old behaviour
// fail every time instead of now and then.
test('a studio registration answers only after its event is recorded', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);

  const [{ app }, { prisma }] = await Promise.all([import('../app'), import('../lib/prisma')]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await prisma.$disconnect();
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const studioName = `Event Rooms ${runId}`;

  let response: { status: number } | undefined;
  // Hold the event table for half a second while the registration runs.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('LOCK TABLE activity_events IN EXCLUSIVE MODE');
    const registering = fetch(`${baseUrl}/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `event-owner-${runId}@example.test`, password: 'EventPass123!', name: 'Owner', role: 'STUDIO_ADMIN', studio_name: studioName, studio_timezone: 'Europe/London' }),
    }).then((r) => { response = { status: r.status }; });
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(response, undefined, 'the registration waits for its event to be written');
    void registering;
  }, { timeout: 10_000 });

  // The lock is released; the registration can now finish.
  for (let i = 0; i < 100 && !response; i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(response?.status, 201);
  const studio = await prisma.studio.findFirstOrThrow({ where: { name: studioName } });
  const event = await prisma.activityEvent.findFirst({ where: { type: 'studio.registered', subject_type: 'STUDIO', subject_id: studio.id } });
  assert.ok(event, 'the event exists the moment the registration has answered');
});
