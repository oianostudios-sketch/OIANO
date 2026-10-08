import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// What the API tells an artist about a session names it on the studio's clock. The
// room-clash refusal and the booking-status notification used to format the date in
// the server's own zone, so an Auckland session on the morning of 15 October read as
// 14 October from a server in UTC or anywhere west. 20:00Z on 14 October 2030 is 09:00
// on 15 October in Auckland (NZDT, UTC+13 since 29 September).
test('session dates the API states are in the studio time zone', async (t) => {
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
  const sign = (user: { id: string; role: string }) => jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!);

  const studio = await prisma.studio.create({ data: { slug: `conflict-zone-${runId}`, name: 'Conflict Zone Studio', timezone: 'Pacific/Auckland' } });
  const service = await prisma.serviceOffering.create({ data: { studio_id: studio.id, category: 'RECORDING', name: 'Session', min_price_usd: 10, max_price_usd: 10, unit: 'hour' } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: `Room A ${runId}` } });
  const held = await prisma.booking.create({ data: {
    studio_id: studio.id, artist_id: artistUser.artist!.id, room_id: room.id, service_id: service.id,
    starts_at: new Date('2030-10-14T20:00:00Z'), ends_at: new Date('2030-10-14T22:00:00Z'), total_usd: 10, status: 'PENDING',
  } });

  await t.test('a room clash is refused with the clash on the studio clock', async () => {
    const response = await fetch(`${baseUrl}/bookings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${sign(artistUser)}` },
      body: JSON.stringify({ studio_id: studio.id, room_id: room.id, service_id: service.id, starts_at: '2030-10-14T21:00:00Z', ends_at: '2030-10-14T23:00:00Z' }),
    });
    const body = (await response.json()) as { error?: string };
    assert.equal(response.status, 409, JSON.stringify(body));
    assert.equal(body.error, 'Time slot not available on 2030-10-15, 09:00–11:00 (Pacific/Auckland)');
  });

  await t.test('the artist is notified of a confirmed session on the studio clock', async () => {
    const admin = await prisma.user.create({ data: { email: `conflict-zone-admin-${runId}@example.test`, role: 'STUDIO_ADMIN' } });
    await prisma.studioStaff.create({ data: { user_id: admin.id, studio_id: studio.id, role: 'STUDIO_ADMIN' } });
    const response = await fetch(`${baseUrl}/bookings/${held.id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${sign(admin)}` },
      body: JSON.stringify({ status: 'CONFIRMED' }),
    });
    assert.equal(response.status, 200, await response.text());
    // The notification is written after the response; wait for it.
    let notification = null;
    for (let attempt = 0; attempt < 50 && !notification; attempt += 1) {
      notification = await prisma.notification.findFirst({ where: { user_id: artistUser.id, type: 'booking_confirmed' } });
      if (!notification) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(notification, 'the artist is notified');
    assert.equal(notification.body, 'Your session on Tue, Oct 15, 09:00 (Pacific/Auckland) is confirmed. See you in the studio.');
  });
});
