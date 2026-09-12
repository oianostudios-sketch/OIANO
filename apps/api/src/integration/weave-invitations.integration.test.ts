import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// Stabilization Session 3: invitation expiry and the Weave invariants a schema
// migration relies on. Known defects are todo tests that name their finding in
// docs/ARCHITECTURE_AUDIT_2026_09_06.md; fixing them is separate work.
test('invitations expire, and the Weave backfill is exact and idempotent', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);

  const [{ app }, { prisma }, { syncConnectionFromBooking }, { backfillWeave }] = await Promise.all([
    import('../app'), import('../lib/prisma'), import('../lib/weave/sync'), import('../lib/weave/backfill'),
  ]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await prisma.$disconnect();
  });

  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    });
    return { status: response.status, body: (await response.json()) as any };
  };
  const auth = (user: { id: string; role: string }) => ({
    authorization: `Bearer ${jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!)}`,
  });

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const artist = (label: string) => prisma.user.create({
    data: { email: `${label}-${runId}@example.test`, role: 'ARTIST', artist: { create: { name: `Weave ${label}` } } },
    include: { artist: true },
  });

  await t.test('an expired invitation cannot be claimed and records nothing', async () => {
    const inviter = await artist('inviter');
    const invitee = await artist('invitee');
    const created = await request('/invitations', {
      method: 'POST', headers: auth(inviter),
      body: JSON.stringify({ email: `expired-${runId}@example.test` }),
    });
    assert.equal(created.status, 201);
    const token = decodeURIComponent(created.body.invite_url.split('invite=')[1]);

    await prisma.creatorInvitation.update({
      where: { id: created.body.id },
      data: { expires_at: new Date(Date.now() - 60_000) },
    });

    const claim = await request('/invitations/accept', {
      method: 'POST', headers: auth(invitee), body: JSON.stringify({ token }),
    });
    assert.equal(claim.status, 410, 'an expired link is no longer valid');

    const stored = await prisma.creatorInvitation.findUniqueOrThrow({ where: { id: created.body.id } });
    assert.equal(stored.status, 'PENDING', 'an expired claim changes nothing');
    assert.equal(stored.accepted_by, null);
    assert.equal(stored.accepted_at, null);
  });

  const studio = await prisma.studio.create({ data: { slug: `weave-${runId}`, name: 'Weave Studio' } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Weave Room' } });
  const service = await prisma.serviceOffering.create({ data: {
    studio_id: studio.id, category: 'RECORDING', name: 'Weave Session', min_price_usd: 50, max_price_usd: 50, unit: 'hour',
  } });
  // The bookings table forbids overlapping sessions in one room, so every
  // fixture gets its own two-hour slot on top of its day.
  let slot = 0;
  const book = (artistId: string, status: 'COMPLETED' | 'CANCELLED' | 'PENDING', daysAgo: number) => {
    slot += 1;
    const starts_at = new Date(Date.now() - daysAgo * 86_400_000 + slot * 2 * 3_600_000);
    return prisma.booking.create({ data: {
      studio_id: studio.id, artist_id: artistId, room_id: room.id, service_id: service.id,
      starts_at, ends_at: new Date(starts_at.getTime() + 3_600_000), total_usd: 50, status,
    } });
  };

  await t.test('the backfill records one piece of evidence per completed booking, and a second run changes nothing', async () => {
    const worker = await artist('worker');
    const floating = await artist('floating');
    const workerId = worker.artist!.id;
    const floatingId = floating.artist!.id;
    const completed = [
      await book(workerId, 'COMPLETED', 30),
      await book(workerId, 'COMPLETED', 20),
      await book(workerId, 'COMPLETED', 10),
    ];
    const cancelled = await book(workerId, 'CANCELLED', 5);
    const pending = await book(workerId, 'PENDING', 2);

    const snapshot = async () => {
      const nodes = await prisma.weaveNode.findMany({ where: { id: { in: [workerId, floatingId, studio.id] } } });
      const connections = await prisma.weaveConnection.findMany({
        where: { source_node_id: { in: [workerId, floatingId] } },
        include: { evidence: true },
      });
      return {
        nodes: nodes.map((node) => `${node.type}:${node.id}`).sort(),
        connections: connections.map((connection) => ({
          source: connection.source_node_id,
          target: connection.target_node_id,
          type: connection.type,
          activity_count: connection.activity_count,
          first: connection.first_activity_at.toISOString(),
          last: connection.last_activity_at.toISOString(),
          evidence: connection.evidence.map((row) => row.booking_id).sort(),
        })),
      };
    };

    await backfillWeave(prisma);
    const first = await snapshot();

    assert.equal(first.nodes.length, 3, 'every artist and studio gets a node, including one with no work');
    assert.equal(first.connections.length, 1, 'an artist with no completed work has a node but no connection');
    const [connection] = first.connections;
    assert.equal(connection.source, workerId);
    assert.equal(connection.target, studio.id);
    assert.deepEqual(connection.evidence, completed.map((booking) => booking.id).sort(),
      'evidence is exactly the completed bookings — not the cancelled or pending ones');
    assert.ok(!connection.evidence.includes(cancelled.id) && !connection.evidence.includes(pending.id));
    assert.equal(connection.activity_count, completed.length, 'activity_count equals the completed bookings behind it');

    await backfillWeave(prisma);
    assert.deepEqual(await snapshot(), first, 'a second backfill changes nothing');
  });

  // Built after the backfill above has run, so the backfill cannot sync these in
  // the right order first and hide the defect the next test is about.
  const late = await artist('a08');
  const olderAt = new Date(Date.now() - 20 * 86_400_000);
  const newerAt = new Date(Date.now() - 10 * 86_400_000);
  const older = await book(late.artist!.id, 'COMPLETED', 20);
  const newer = await book(late.artist!.id, 'COMPLETED', 10);
  await prisma.booking.update({ where: { id: older.id }, data: { updated_at: olderAt } });
  await prisma.booking.update({ where: { id: newer.id }, data: { updated_at: newerAt } });
  // The fixture must hold on its own, or the todo below could hide a broken setup.
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: older.id } })).updated_at.toISOString(), olderAt.toISOString());
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: newer.id } })).updated_at.toISOString(), newerAt.toISOString());

  await t.test('syncing an older booking does not move last activity backwards',
    { todo: 'A08: last_activity_at follows whichever booking synced last' },
    async () => {
      await syncConnectionFromBooking(newer.id);
      await syncConnectionFromBooking(older.id);
      const connection = await prisma.weaveConnection.findFirstOrThrow({
        where: { source_node_id: late.artist!.id, target_node_id: studio.id },
      });
      assert.equal(connection.last_activity_at.toISOString(), newerAt.toISOString(), 'last activity is the newest work, whatever the sync order');
      assert.equal(connection.first_activity_at.toISOString(), olderAt.toISOString(), 'first activity is the oldest work');
    });
});
