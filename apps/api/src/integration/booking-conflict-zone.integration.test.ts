import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// A booking refused because the room is taken names the clash on the studio's clock.
// It used to name the date in the server's own zone, so an Auckland session on the
// morning of 15 October read as 14 October to an artist booking it from a server in
// UTC or anywhere west. 20:00Z on 14 October 2030 is 09:00 on 15 October in Auckland
// (NZDT, UTC+13 since 29 September).
test('a room clash is reported in the studio time zone', async (t) => {
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
      email: `conflict-zone-artist-${runId}@example.test`, role: 'ARTIST',
      artist: { create: { name: 'Conflict Zone Artist', wallet: { create: { balance_usd: 1000 } } } },
    },
    include: { artist: true },
  });
  const token = jwt.sign({ sub: artistUser.id, role: artistUser.role, ver: 0 }, process.env.JWT_SECRET!);

  const studio = await prisma.studio.create({ data: { slug: `conflict-zone-${runId}`, name: 'Conflict Zone Studio', timezone: 'Pacific/Auckland' } });
  const service = await prisma.serviceOffering.create({ data: { studio_id: studio.id, category: 'RECORDING', name: 'Session', min_price_usd: 10, max_price_usd: 10, unit: 'hour' } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: `Room A ${runId}` } });
  await prisma.booking.create({ data: {
    studio_id: studio.id, artist_id: artistUser.artist!.id, room_id: room.id, service_id: service.id,
    starts_at: new Date('2030-10-14T20:00:00Z'), ends_at: new Date('2030-10-14T22:00:00Z'), total_usd: 10, status: 'CONFIRMED',
  } });

  const response = await fetch(`${baseUrl}/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ studio_id: studio.id, room_id: room.id, service_id: service.id, starts_at: '2030-10-14T21:00:00Z', ends_at: '2030-10-14T23:00:00Z' }),
  });
  const body = (await response.json()) as { error?: string };
  assert.equal(response.status, 409, JSON.stringify(body));
  assert.equal(body.error, 'Time slot not available on 2030-10-15, 09:00–11:00 (Pacific/Auckland)');
});
