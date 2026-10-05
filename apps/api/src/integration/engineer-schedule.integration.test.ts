import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// One engineer, one session at a time (C28). The database keeps a room to one booking at a
// time; these hold the same for the engineer, on assignment and on reschedule, including
// when requests arrive together.
test('an engineer is never on two sessions at once', async (t) => {
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
  const tokenFor = (user: { id: string; role: string }) => jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!);
  const send = async (method: string, path: string, token: string, body: unknown) => {
    const response = await fetch(`${baseUrl}${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    return { status: response.status, body: (await response.json()) as any };
  };

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const studio = await prisma.studio.create({ data: { slug: `schedule-${runId}`, name: 'Schedule Studio' } });
  const service = await prisma.serviceOffering.create({ data: { studio_id: studio.id, category: 'RECORDING', name: 'Session', min_price_usd: 10, max_price_usd: 10, unit: 'hour' } });
  const rooms = await Promise.all(Array.from({ length: 10 }, (_, n) => prisma.room.create({ data: { studio_id: studio.id, name: `Room ${n}` } })));
  const adminUser = await prisma.user.create({ data: { email: `schedule-admin-${runId}@example.test`, role: 'STUDIO_ADMIN' } });
  await prisma.studioStaff.create({ data: { user_id: adminUser.id, studio_id: studio.id, role: 'STUDIO_ADMIN' } });
  const admin = tokenFor(adminUser);
  const artistUser = await prisma.user.create({ data: { email: `schedule-artist-${runId}@example.test`, role: 'ARTIST', artist: { create: { name: 'Schedule Artist' } } }, include: { artist: true } });
  const artist = tokenFor(artistUser);
  const engineer = (name: string) => prisma.engineer.create({ data: { studio_id: studio.id, name: `${name} ${runId}`, specialties: [] } });

  // Hours on one day in 2030, each in its own room so only the engineer can clash.
  let roomIndex = 0;
  const day = new Date(Date.UTC(2030, 5, 3));
  const at = (hour: number) => new Date(day.getTime() + hour * 3_600_000);
  const booking = (from: number, to: number, status: 'CONFIRMED' | 'PENDING' = 'CONFIRMED') => prisma.booking.create({ data: {
    studio_id: studio.id, artist_id: artistUser.artist!.id, room_id: rooms[roomIndex++ % rooms.length].id, service_id: service.id,
    starts_at: at(from), ends_at: at(to), total_usd: 10, status,
  } });
  const assign = (bookingId: string, engineerId: string | null) => send('PATCH', `/bookings/${bookingId}/engineer`, admin, { engineer_id: engineerId });

  await t.test('assignment refuses an overlap, including a session wholly inside another', async () => {
    const ada = await engineer('Ada');
    const morning = await booking(10, 12);
    assert.equal((await assign(morning.id, ada.id)).status, 200);
    const overlapping = await booking(11, 13);
    assert.equal((await assign(overlapping.id, ada.id)).status, 409);
    const inside = await booking(10.5, 11.5);
    assert.equal((await assign(inside.id, ada.id)).status, 409);
    const around = await booking(9.5, 12.5);
    assert.equal((await assign(around.id, ada.id)).status, 409, 'a session that contains another overlaps it');
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: overlapping.id } })).engineer_id, null);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: inside.id } })).engineer_id, null);
  });

  await t.test('back-to-back sessions are not an overlap, and reassigning the same engineer is', async () => {
    const kofi = await engineer('Kofi');
    const first = await booking(14, 15);
    const second = await booking(15, 16);
    assert.equal((await assign(first.id, kofi.id)).status, 200);
    assert.equal((await assign(second.id, kofi.id)).status, 200, 'one ends as the other starts');
    assert.equal((await assign(first.id, kofi.id)).status, 200, 'a session does not clash with itself');
  });

  await t.test('a cancelled session holds no time', async () => {
    const esi = await engineer('Esi');
    const cancelled = await booking(17, 18);
    assert.equal((await assign(cancelled.id, esi.id)).status, 200);
    await prisma.booking.update({ where: { id: cancelled.id }, data: { status: 'CANCELLED' } });
    const replacement = await booking(17, 18);
    assert.equal((await assign(replacement.id, esi.id)).status, 200);
  });

  await t.test('a reschedule cannot move a session onto its engineer\'s other session', async () => {
    const yaw = await engineer('Yaw');
    const fixed = await booking(8, 9);
    const moving = await booking(6, 7);
    assert.equal((await assign(fixed.id, yaw.id)).status, 200);
    assert.equal((await assign(moving.id, yaw.id)).status, 200);
    const clash = await send('PATCH', `/bookings/${moving.id}/reschedule`, artist, { starts_at: at(8.5).toISOString(), ends_at: at(9.5).toISOString() });
    assert.equal(clash.status, 409, JSON.stringify(clash.body));
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: moving.id } });
    assert.equal(stored.starts_at.getTime(), at(6).getTime(), 'the refused reschedule changed nothing');
    const free = await send('PATCH', `/bookings/${moving.id}/reschedule`, artist, { starts_at: at(20).toISOString(), ends_at: at(21).toISOString() });
    assert.equal(free.status, 200, JSON.stringify(free.body));
  });

  await t.test('assignments arriving together place the engineer on one session', async () => {
    for (let round = 0; round < 4; round += 1) {
      const abena = await engineer(`Abena ${round}`);
      const sessions = await Promise.all([0, 1, 2, 3, 4, 5].map(() => booking(22 + round * 2, 23 + round * 2)));
      const results = await Promise.all(sessions.map((s) => assign(s.id, abena.id)));
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409, 409, 409, 409], `round ${round}`);
      assert.equal(await prisma.booking.count({ where: { engineer_id: abena.id } }), 1, `round ${round}`);
    }
  });
});
