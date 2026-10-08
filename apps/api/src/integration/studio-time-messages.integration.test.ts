// What the API tells an artist about a session is on the session's studio clock. The
// completion screen's notification formatted the session's date in the server's own
// zone and named no zone, and the artist's yearly stats put each session in the
// server's month. The server here is put in Los Angeles, so the old behaviour shows
// whatever zone the host itself is in.
process.env.TZ = 'America/Los_Angeles';

import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { studioDate, studioLocalToInstant } from '../lib/studioClock';

const ZONE = 'Pacific/Auckland';

test('session times the API states to an artist are on the studio clock', async (t) => {
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
  const sign = (user: { id: string; role: string }) => jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!);

  const artistUser = await prisma.user.create({
    data: { email: `studio-time-artist-${runId}@example.test`, role: 'ARTIST', artist: { create: { name: 'Studio Time Artist' } } },
    include: { artist: true },
  });
  const studio = await prisma.studio.create({ data: { slug: `studio-time-${runId}`, name: 'Studio Time Studio', timezone: ZONE } });
  const admin = await prisma.user.create({ data: { email: `studio-time-admin-${runId}@example.test`, role: 'STUDIO_ADMIN' } });
  await prisma.studioStaff.create({ data: { user_id: admin.id, studio_id: studio.id, role: 'STUDIO_ADMIN' } });
  const service = await prisma.serviceOffering.create({ data: { studio_id: studio.id, category: 'RECORDING', name: 'Session', min_price_usd: 10, max_price_usd: 10, unit: 'hour' } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: `Room A ${runId}` } });

  await t.test('the session-complete notification names the studio day, time and zone', async () => {
    // 20:00Z on 14 October 2030 is 09:00 on Tuesday 15 October in Auckland (NZDT, UTC+13).
    const booking = await prisma.booking.create({ data: {
      studio_id: studio.id, artist_id: artistUser.artist!.id, room_id: room.id, service_id: service.id,
      starts_at: new Date('2030-10-14T20:00:00Z'), ends_at: new Date('2030-10-14T22:00:00Z'), total_usd: 10, status: 'CONFIRMED',
    } });
    const response = await fetch(`${baseUrl}/bookings/${booking.id}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${sign(admin)}`, 'idempotency-key': `studio-time-${runId}` },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 200, await response.text());

    // The notification is written after the response; wait for it.
    let notification = null;
    for (let attempt = 0; attempt < 50 && !notification; attempt += 1) {
      notification = await prisma.notification.findFirst({ where: { user_id: artistUser.id, type: 'booking_completed' } });
      if (!notification) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(notification, 'the artist is notified');
    assert.equal(notification.body, 'Your session on Tue, Oct 15, 09:00 (Pacific/Auckland) is marked complete. Check your profile.');
  });

  await t.test('the yearly stats count a session in its studio\'s month', async () => {
    // 00:30 on 1 March in Auckland, this year there, is still February in UTC and
    // in Los Angeles.
    const year = Number(studioDate(new Date(), ZONE).slice(0, 4));
    const startsAt = studioLocalToInstant({ year, month: 3, day: 1, hour: 0, minute: 30 }, ZONE);
    await prisma.booking.create({ data: {
      studio_id: studio.id, artist_id: artistUser.artist!.id, room_id: room.id, service_id: service.id,
      starts_at: startsAt, ends_at: new Date(startsAt.getTime() + 2 * 3_600_000), total_usd: 10, status: 'COMPLETED',
    } });
    const response = await fetch(`${baseUrl}/passport/stats`, { headers: { authorization: `Bearer ${sign(artistUser)}` } });
    const body = (await response.json()) as { monthly: Array<{ month: number; sessions: number }> };
    assert.equal(response.status, 200, JSON.stringify(body));
    const sessions = (month: number) => body.monthly.find((entry) => entry.month === month)?.sessions;
    assert.equal(sessions(2), 1, 'March, the studio\'s month');
    assert.equal(sessions(1), 0, 'not February, the server\'s month');
  });
});
