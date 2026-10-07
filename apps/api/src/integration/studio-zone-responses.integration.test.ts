import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// The web app reads a session's times in its studio's zone, wherever the viewer is (C29).
// It can only do that when the responses it formats carry the zone: the booking list, the
// artist profile's sessions and the studio clock. Each carries the studio's id, name and
// zone, and nothing more of the studio row.
test("booking responses carry their studio's time zone", async (t) => {
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
  const get = async (path: string, token: string) => {
    const response = await fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${token}` } });
    return { status: response.status, body: (await response.json()) as any };
  };

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const artistUser = await prisma.user.create({
    data: { email: `zone-artist-${runId}@example.test`, role: 'ARTIST', artist: { create: { name: 'Zone Artist' } } },
    include: { artist: true },
  });
  const studio = await prisma.studio.create({ data: { slug: `zone-${runId}`, name: 'Zone Studio', timezone: 'Pacific/Auckland' } });
  const admin = await prisma.user.create({ data: { email: `zone-admin-${runId}@example.test`, role: 'STUDIO_ADMIN' } });
  await prisma.studioStaff.create({ data: { user_id: admin.id, studio_id: studio.id, role: 'STUDIO_ADMIN' } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Zone Room' } });
  const service = await prisma.serviceOffering.create({ data: { studio_id: studio.id, category: 'RECORDING', name: 'Session', min_price_usd: 10, max_price_usd: 10, unit: 'hour' } });
  const booking = await prisma.booking.create({ data: {
    studio_id: studio.id, artist_id: artistUser.artist!.id, room_id: room.id, service_id: service.id,
    starts_at: new Date('2029-04-02T02:00:00Z'), ends_at: new Date('2029-04-02T05:00:00Z'), total_usd: 10, status: 'CONFIRMED',
  } });
  const expected = { id: studio.id, name: 'Zone Studio', timezone: 'Pacific/Auckland' };

  await t.test('the booking list, for the artist and for the studio', async () => {
    for (const token of [tokenFor(artistUser), tokenFor(admin)]) {
      const response = await get('/bookings?limit=100', token);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      const listed = (response.body.data as any[]).find((b) => b.id === booking.id);
      assert.deepEqual(listed?.studio, expected);
    }
  });

  await t.test("the artist profile's sessions, for a studio admin", async () => {
    const response = await get(`/artists/${artistUser.artist!.id}`, tokenFor(admin));
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const listed = (response.body.bookings as any[]).find((b) => b.id === booking.id);
    assert.deepEqual(listed?.studio, expected);
  });

  await t.test('the studio clock names the zone its dial is drawn in', async () => {
    const response = await get('/studio-clock', tokenFor(admin));
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.timezone, 'Pacific/Auckland');
  });
});
