import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// Stabilization Session 3: invitation expiry and the Weave invariants a schema
// migration relies on. A08 from docs/ARCHITECTURE_AUDIT_2026_09_06.md began here
// as a todo test; it is fixed now, and the tests below hold it fixed.
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
    assert.equal(connection.first, completed[0].starts_at.toISOString(), 'first activity is the earliest completed session');
    assert.equal(connection.last, completed[completed.length - 1].starts_at.toISOString(), 'last activity is the latest completed session, not a later cancelled or pending one');

    await backfillWeave(prisma);
    assert.deepEqual(await snapshot(), first, 'a second backfill changes nothing');
  });

  // A08, fixed: a connection's count and dates are derived from its evidence.
  // Each fixture below is built after the backfill above has run, so the backfill
  // cannot sync it in the right order first and hide what the test is about.
  const connectionOf = (artistId: string) => prisma.weaveConnection.findFirstOrThrow({
    where: { source_node_id: artistId, target_node_id: studio.id },
    include: { evidence: true },
  });

  await t.test('syncing an older booking does not move last activity backwards', async () => {
    const late = await artist('a08');
    const older = await book(late.artist!.id, 'COMPLETED', 20);
    const newer = await book(late.artist!.id, 'COMPLETED', 10);
    // updated_at says when a booking was last edited, not when the work happened.
    await prisma.booking.update({ where: { id: older.id }, data: { notes: 'Edited long after the session' } });
    const edited = await prisma.booking.findUniqueOrThrow({ where: { id: older.id } });
    assert.ok(edited.updated_at > newer.updated_at, 'the fixture holds: the older booking was edited most recently');

    await syncConnectionFromBooking(newer.id);
    await syncConnectionFromBooking(older.id);
    const connection = await connectionOf(late.artist!.id);
    assert.equal(connection.last_activity_at.toISOString(), newer.starts_at.toISOString(), 'last activity is the newest work, whatever the sync order');
    assert.equal(connection.first_activity_at.toISOString(), older.starts_at.toISOString(), 'first activity is the oldest work');
    assert.equal(connection.activity_count, 2);
  });

  await t.test('a wrong count or date is corrected by the next sync', async () => {
    const regular = await artist('a08-repair');
    const sessions = [await book(regular.artist!.id, 'COMPLETED', 60), await book(regular.artist!.id, 'COMPLETED', 50)];
    for (const session of sessions) await syncConnectionFromBooking(session.id);
    const { id } = await connectionOf(regular.artist!.id);
    await prisma.weaveConnection.update({ where: { id }, data: { activity_count: 99, first_activity_at: new Date(0), last_activity_at: new Date() } });

    await syncConnectionFromBooking(sessions[0].id);
    const repaired = await connectionOf(regular.artist!.id);
    assert.equal(repaired.activity_count, 2, 'the count is the evidence behind it, not what was stored');
    assert.equal(repaired.evidence.length, 2, 'repairing adds no evidence');
    assert.equal(repaired.first_activity_at.toISOString(), sessions[0].starts_at.toISOString());
    assert.equal(repaired.last_activity_at.toISOString(), sessions[1].starts_at.toISOString());
  });

  await t.test('bookings synced at the same moment are all counted', async () => {
    const busy = await artist('a08-concurrent');
    let daysAgo = 400;
    const session = () => book(busy.artist!.id, 'COMPLETED', daysAgo--);
    const first = await session();
    // The connection exists first, so this is about counting, not about creating it.
    await syncConnectionFromBooking(first.id);

    // A count is lost only when two syncs overlap, and timing decides that, so
    // the syncs get several chances to collide.
    let latest = first;
    for (let round = 1; round <= 8; round += 1) {
      const batch: typeof first[] = [];
      for (let i = 0; i < 6; i += 1) batch.push(await session());
      await Promise.all(batch.map((booking) => syncConnectionFromBooking(booking.id)));
      latest = batch[batch.length - 1];
      const connection = await connectionOf(busy.artist!.id);
      assert.equal(connection.activity_count, connection.evidence.length, `round ${round}: no sync running alongside another drops its booking from the count`);
    }

    const connection = await connectionOf(busy.artist!.id);
    assert.equal(connection.evidence.length, 1 + 8 * 6);
    assert.equal(connection.first_activity_at.toISOString(), first.starts_at.toISOString());
    assert.equal(connection.last_activity_at.toISOString(), latest.starts_at.toISOString());
  });
});
