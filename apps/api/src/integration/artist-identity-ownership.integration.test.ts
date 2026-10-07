import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// Identity is issued by OIANO, never by a studio (AGENTS.md): no studio route removes an
// artist from the network, whether or not the artist ever booked that studio.
test('a studio cannot delete an artist', async (t) => {
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
  const studio = await prisma.studio.create({ data: { slug: `ownership-${runId}`, name: 'Ownership Studio' } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Room' } });
  const service = await prisma.serviceOffering.create({ data: { studio_id: studio.id, category: 'RECORDING', name: 'Session', min_price_usd: 10, max_price_usd: 10, unit: 'hour' } });
  const admin = await prisma.user.create({ data: { email: `ownership-admin-${runId}@example.test`, role: 'STUDIO_ADMIN' } });
  await prisma.studioStaff.create({ data: { user_id: admin.id, studio_id: studio.id, role: 'STUDIO_ADMIN' } });
  const token = jwt.sign({ sub: admin.id, role: admin.role, ver: 0 }, process.env.JWT_SECRET!);

  const artist = (label: string) => prisma.user.create({
    data: { email: `ownership-${label}-${runId}@example.test`, role: 'ARTIST', artist: { create: { name: `Ownership ${label}` } } },
    include: { artist: true },
  });
  const booked = await artist('booked');
  const starts = new Date(Date.UTC(2031, 0, 5, 12));
  await prisma.booking.create({ data: {
    studio_id: studio.id, artist_id: booked.artist!.id, room_id: room.id, service_id: service.id,
    starts_at: starts, ends_at: new Date(starts.getTime() + 3_600_000), total_usd: 10, status: 'COMPLETED',
  } });
  const stranger = await artist('stranger');

  for (const subject of [booked, stranger]) {
    const response = await fetch(`${baseUrl}/artists/${subject.artist!.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 404, 'there is no route that deletes an artist');
    assert.ok(await prisma.artist.findUnique({ where: { id: subject.artist!.id } }), 'the artist is untouched');
    assert.ok(await prisma.user.findUnique({ where: { id: subject.id } }), 'and so is their account');
  }
});
