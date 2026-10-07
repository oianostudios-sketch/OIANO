import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// One room, one session at a time. Every path that writes a booking's room and time
// (an artist booking, a recurring booking, a reschedule, a staff walk-in) answers an
// overlap with 409 and writes nothing. Two sessions overlap when each starts before the
// other ends, so a new session that wholly contains an existing one overlaps it too;
// the check used to test only whether the new start or end fell inside an existing
// session, and missed that case.
test('a room is never booked for two sessions at once', async (t) => {
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
  const studio = await prisma.studio.create({ data: { slug: `room-overlap-${runId}`, name: 'Room Overlap Studio' } });
  const service = await prisma.serviceOffering.create({ data: { studio_id: studio.id, category: 'RECORDING', name: 'Session', min_price_usd: 10, max_price_usd: 10, unit: 'hour' } });
  const adminUser = await prisma.user.create({ data: { email: `room-overlap-admin-${runId}@example.test`, role: 'STUDIO_ADMIN' } });
  await prisma.studioStaff.create({ data: { user_id: adminUser.id, studio_id: studio.id, role: 'STUDIO_ADMIN' } });
  const admin = tokenFor(adminUser);

  let roomCount = 0;
  const room = () => prisma.room.create({ data: { studio_id: studio.id, name: `Room ${roomCount++} ${runId}` } });
  // Each artist books under their own rate limit and pays from their own wallet.
  let artistCount = 0;
  const artist = async () => {
    const user = await prisma.user.create({
      data: { email: `room-overlap-artist-${artistCount++}-${runId}@example.test`, role: 'ARTIST', artist: { create: { name: 'Overlap Artist', wallet: { create: { balance_usd: 10_000 } } } } },
      include: { artist: { include: { wallet: true } } },
    });
    return { token: tokenFor(user), artist: user.artist!, walletId: user.artist!.wallet!.id };
  };
  const balance = async (walletId: string) => Number((await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance_usd);

  // Hours on one day in 2030.
  const day = new Date(Date.UTC(2030, 6, 9));
  const at = (hour: number) => new Date(day.getTime() + hour * 3_600_000);
  const existing = async (roomId: string, from: number, to: number, status: 'CONFIRMED' | 'PENDING' | 'CANCELLED' | 'NO_SHOW' = 'CONFIRMED') => {
    const owner = await artist();
    return prisma.booking.create({ data: {
      studio_id: studio.id, artist_id: owner.artist.id, room_id: roomId, service_id: service.id,
      starts_at: at(from), ends_at: at(to), total_usd: 10, status,
    } });
  };
  const book = (token: string, roomId: string, from: number, to: number, extra: Record<string, unknown> = {}) => send('POST', '/bookings', token, {
    studio_id: studio.id, room_id: roomId, service_id: service.id, starts_at: at(from).toISOString(), ends_at: at(to).toISOString(), ...extra,
  });
  const bookingsIn = (roomId: string) => prisma.booking.count({ where: { room_id: roomId, status: { notIn: ['CANCELLED', 'NO_SHOW'] } } });

  await t.test('a booking that contains an existing session is refused and charges nothing', async () => {
    const r = await room();
    await existing(r.id, 14, 15);
    const booker = await artist();
    const around = await book(booker.token, r.id, 13, 16);
    assert.equal(around.status, 409, JSON.stringify(around.body));
    // Refused by the check, which names the day, not left to the database constraint.
    assert.match(around.body.error, /not available on/);
    assert.equal(await bookingsIn(r.id), 1);
    assert.equal(await balance(booker.walletId), 10_000);
  });

  await t.test('the room check itself finds containing, contained and crossing sessions, and nothing else', async () => {
    const { findRoomClash } = await import('../lib/roomSchedule');
    const r = await room();
    const held = await existing(r.id, 14, 15);
    await existing(r.id, 9, 12, 'CANCELLED');
    await existing(r.id, 9, 12, 'NO_SHOW');
    const clash = (from: number, to: number, exceptBookingId?: string) => prisma.$transaction((tx) => findRoomClash(tx, { roomId: r.id, slots: [{ startsAt: at(from), endsAt: at(to) }], exceptBookingId }));
    for (const [from, to] of [[13, 16], [14.25, 14.75], [13.5, 14.5], [14.5, 15.5], [14, 15]]) {
      assert.equal((await clash(from, to))?.id, held.id, `${from}-${to} overlaps 14-15`);
    }
    for (const [from, to] of [[13, 14], [15, 16], [9, 12]]) {
      assert.equal(await clash(from, to), null, `${from}-${to} does not overlap`);
    }
    assert.equal(await clash(13, 16, held.id), null, 'a booking does not clash with itself');
  });

  await t.test('a booking inside an existing session, or across either edge, is refused', async () => {
    const r = await room();
    await existing(r.id, 14, 16);
    const booker = await artist();
    for (const [from, to] of [[14.25, 15.75], [13, 14.5], [15.5, 17], [14, 16]]) {
      const response = await book(booker.token, r.id, from, to);
      assert.equal(response.status, 409, `${from}-${to}: ${JSON.stringify(response.body)}`);
    }
    assert.equal(await bookingsIn(r.id), 1);
  });

  await t.test('back-to-back sessions are not an overlap', async () => {
    const r = await room();
    await existing(r.id, 14, 15);
    const booker = await artist();
    assert.equal((await book(booker.token, r.id, 15, 16)).status, 201, 'starts as the other ends');
    assert.equal((await book(booker.token, r.id, 13, 14)).status, 201, 'ends as the other starts');
    assert.equal(await bookingsIn(r.id), 3);
  });

  await t.test('a cancelled or no-show session holds no time', async () => {
    const r = await room();
    await existing(r.id, 14, 15, 'CANCELLED');
    await existing(r.id, 14, 15, 'NO_SHOW');
    const booker = await artist();
    const response = await book(booker.token, r.id, 13, 16);
    assert.equal(response.status, 201, JSON.stringify(response.body));
  });

  await t.test('a recurring booking whose later week contains an existing session is refused whole', async () => {
    const r = await room();
    const weekLater = 7 * 24;
    await existing(r.id, weekLater + 14, weekLater + 15);
    const booker = await artist();
    const response = await book(booker.token, r.id, 13, 16, { repeat_weeks: 3 });
    assert.equal(response.status, 409, JSON.stringify(response.body));
    assert.equal(await bookingsIn(r.id), 1);
    assert.equal(await balance(booker.walletId), 10_000);
  });

  await t.test('a reschedule into a range that contains another session is refused', async () => {
    const r = await room();
    await existing(r.id, 14, 15);
    const booker = await artist();
    const made = await book(booker.token, r.id, 8, 11);
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const clash = await send('PATCH', `/bookings/${made.body.id}/reschedule`, booker.token, { starts_at: at(13).toISOString(), ends_at: at(16).toISOString() });
    assert.equal(clash.status, 409, JSON.stringify(clash.body));
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: made.body.id } });
    assert.equal(stored.starts_at.getTime(), at(8).getTime(), 'the refused reschedule changed nothing');
    const backToBack = await send('PATCH', `/bookings/${made.body.id}/reschedule`, booker.token, { starts_at: at(15).toISOString(), ends_at: at(18).toISOString() });
    assert.equal(backToBack.status, 200, JSON.stringify(backToBack.body));
  });

  await t.test('a walk-in that contains an existing session is refused and leaves no guest behind', async () => {
    const r = await room();
    await existing(r.id, 14, 15);
    const guestsBefore = await prisma.user.count({ where: { email: { endsWith: `@${studio.slug}.walkin` } } });
    const around = await send('POST', '/admin/walkin', admin, { name: 'Walk-in guest', room_id: r.id, starts_at: at(13).toISOString(), duration_minutes: 180 });
    assert.equal(around.status, 409, JSON.stringify(around.body));
    assert.equal(await prisma.user.count({ where: { email: { endsWith: `@${studio.slug}.walkin` } } }), guestsBefore);
    const after = await send('POST', '/admin/walkin', admin, { name: 'Walk-in guest', room_id: r.id, starts_at: at(15).toISOString(), duration_minutes: 60 });
    assert.equal(after.status, 201, JSON.stringify(after.body));
  });

  await t.test('bookings arriving together for one slot place one session and refuse the rest cleanly', async () => {
    for (let round = 0; round < 3; round += 1) {
      const r = await room();
      const bookers = await Promise.all([0, 1, 2, 3, 4].map(() => artist()));
      // Nested ranges, so the containing requests can only be stopped by a correct test.
      const ranges: Array<[number, number]> = [[14, 15], [13, 16], [12, 17], [14.25, 14.75], [11, 18]];
      const results = await Promise.all(bookers.map((b, n) => book(b.token, r.id, ranges[n][0], ranges[n][1])));
      assert.deepEqual(results.map((x) => x.status).sort(), [201, 409, 409, 409, 409], `round ${round}: ${JSON.stringify(results.map((x) => x.body))}`);
      assert.equal(await bookingsIn(r.id), 1, `round ${round}`);
      const charged = (await Promise.all(bookers.map((b) => balance(b.walletId)))).filter((v) => v !== 10_000);
      assert.equal(charged.length, 1, `round ${round}: only the placed booking is charged`);
    }
  });
});
