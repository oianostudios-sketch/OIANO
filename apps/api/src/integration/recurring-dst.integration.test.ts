import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// A weekly series stays at the same studio-local time across a clock change. Each
// occurrence used to be the first one's instant plus 7 × 24 hours, so a weekly 18:00
// session in London became 19:00 after the clocks went back. Every instant below is
// worked by hand: London leaves BST at 01:00Z on 27 October 2030; New York enters EDT
// at 02:00 local on 10 March 2030.
test('a weekly booking keeps its studio-local time across daylight-saving changes', async (t) => {
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
  const artistUser = await prisma.user.create({
    data: {
      email: `recurring-artist-${runId}@example.test`, role: 'ARTIST',
      artist: { create: { name: 'Recurring Artist', wallet: { create: { balance_usd: 1000 } } } },
    },
    include: { artist: true },
  });
  const token = jwt.sign({ sub: artistUser.id, role: artistUser.role, ver: 0 }, process.env.JWT_SECRET!);

  const studioIn = async (label: string, timezone: string) => {
    const studio = await prisma.studio.create({ data: { slug: `recurring-${label}-${runId}`, name: `Recurring ${label}`, timezone } });
    const service = await prisma.serviceOffering.create({ data: { studio_id: studio.id, category: 'RECORDING', name: 'Session', min_price_usd: 10, max_price_usd: 10, unit: 'hour' } });
    const room = async () => (await prisma.room.create({ data: { studio_id: studio.id, name: `${label} room ${Math.random().toString(16).slice(2)}` } })).id;
    const bookWeekly = async (roomId: string, starts: string, ends: string, weeks: number) => {
      const response = await fetch(`${baseUrl}/bookings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ studio_id: studio.id, room_id: roomId, service_id: service.id, starts_at: starts, ends_at: ends, repeat_weeks: weeks }),
      });
      return { status: response.status, body: (await response.json()) as any };
    };
    const sessionsIn = async (roomId: string) => (await prisma.booking.findMany({ where: { room_id: roomId, artist_id: artistUser.artist!.id }, orderBy: { starts_at: 'asc' } }))
      .map((b) => `${b.starts_at.toISOString()} ${b.ends_at.toISOString()}`);
    return { studio, service, room, bookWeekly, sessionsIn };
  };

  await t.test('London, over the October change: 18:00 BST, then 18:00 GMT', async () => {
    const london = await studioIn('london', 'Europe/London');
    const roomId = await london.room();
    const created = await london.bookWeekly(roomId, '2030-10-17T17:00:00Z', '2030-10-17T19:00:00Z', 4);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.total_created, 4);
    assert.deepEqual(await london.sessionsIn(roomId), [
      '2030-10-17T17:00:00.000Z 2030-10-17T19:00:00.000Z',
      '2030-10-24T17:00:00.000Z 2030-10-24T19:00:00.000Z',
      '2030-10-31T18:00:00.000Z 2030-10-31T20:00:00.000Z',
      '2030-11-07T18:00:00.000Z 2030-11-07T20:00:00.000Z',
    ]);
  });

  await t.test('the conflict check runs on each occurrence where it really falls', async () => {
    const london = await studioIn('london-busy', 'Europe/London');
    const roomId = await london.room();
    // 19:00 to 20:00 GMT on 31 October: clear of 17:00Z to 19:00Z, where the old
    // arithmetic put the third session, but inside 18:00 to 20:00 GMT.
    await prisma.booking.create({ data: {
      studio_id: london.studio.id, artist_id: artistUser.artist!.id, room_id: roomId, service_id: london.service.id,
      starts_at: new Date('2030-10-31T19:00:00Z'), ends_at: new Date('2030-10-31T20:00:00Z'), total_usd: 10, status: 'CONFIRMED',
    } });
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { artist_id: artistUser.artist!.id } });
    const attempt = await london.bookWeekly(roomId, '2030-10-17T17:00:00Z', '2030-10-17T19:00:00Z', 4);
    assert.equal(attempt.status, 409, JSON.stringify(attempt.body));
    assert.deepEqual(await london.sessionsIn(roomId), ['2030-10-31T19:00:00.000Z 2030-10-31T20:00:00.000Z'], 'no session of the series is created');
    const after = await prisma.wallet.findUniqueOrThrow({ where: { artist_id: artistUser.artist!.id } });
    assert.equal(Number(after.balance_usd), Number(wallet.balance_usd), 'the wallet is not charged');
  });

  await t.test('New York, over the March change: 18:00 EST, then 18:00 EDT', async () => {
    const newYork = await studioIn('new-york', 'America/New_York');
    const roomId = await newYork.room();
    const created = await newYork.bookWeekly(roomId, '2030-03-07T23:00:00Z', '2030-03-08T01:00:00Z', 2);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.deepEqual(await newYork.sessionsIn(roomId), [
      '2030-03-07T23:00:00.000Z 2030-03-08T01:00:00.000Z',
      '2030-03-14T22:00:00.000Z 2030-03-15T00:00:00.000Z',
    ]);
  });
});
