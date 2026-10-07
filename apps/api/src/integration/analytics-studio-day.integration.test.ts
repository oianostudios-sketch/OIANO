import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// A studio's analytics count its own days (C29). The admin analytics bucketed bookings
// and payments by the UTC day, and the pulse cut "today" and "this week" at the server's
// midnight, so a 23:15 session west of UTC counted on the next day and a 00:15 session
// east of UTC on the day before. The test runs against the real clock, so it places each
// session by hand around the studio's own midnight; local times become instants through
// Intl alone, never through lib/studioClock.ts, which the code under test uses.
test("studio analytics bucket bookings and revenue by the studio's own day", async (t) => {
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
  const get = async (path: string, token: string) => {
    const response = await fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${token}` } });
    return { status: response.status, body: (await response.json()) as any };
  };

  // The zone's local date at an instant, as YYYY-MM-DD.
  const localDate = (moment: Date, timeZone: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment);
  // How far ahead of UTC the zone is at an instant, in minutes, read from Intl's "GMT-07:00".
  const offsetMinutes = (moment: Date, timeZone: string) => {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(moment).find((part) => part.type === 'timeZoneName')!.value;
    const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
    return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
  };
  // The instant a local wall-clock time names in the zone. None of the times used here
  // is near a 02:00 clock change, so one correction settles the offset.
  const at = (date: string, hour: number, minute: number, timeZone: string) => {
    const [y, m, d] = date.split('-').map(Number);
    const wall = Date.UTC(y, m - 1, d, hour, minute);
    const guess = wall - offsetMinutes(new Date(wall), timeZone) * 60_000;
    return new Date(wall - offsetMinutes(new Date(guess), timeZone) * 60_000);
  };
  const shift = (date: string, days: number) => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  };

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const artistUser = await prisma.user.create({
    data: { email: `analytics-day-artist-${runId}@example.test`, role: 'ARTIST', artist: { create: { name: 'Analytics Day Artist' } } },
    include: { artist: true },
  });

  for (const timeZone of ['America/Los_Angeles', 'Asia/Tokyo']) {
    await t.test(`a studio in ${timeZone}`, async () => {
      const label = timeZone.split('/')[1].toLowerCase();
      const studio = await prisma.studio.create({ data: { slug: `analytics-day-${label}-${runId}`, name: `Analytics ${label}`, timezone: timeZone } });
      const service = await prisma.serviceOffering.create({ data: { studio_id: studio.id, category: 'RECORDING', name: 'Session', min_price_usd: 1, max_price_usd: 1000, unit: 'hour' } });
      const admin = await prisma.user.create({ data: { email: `analytics-day-${label}-admin-${runId}@example.test`, role: 'STUDIO_ADMIN' } });
      await prisma.studioStaff.create({ data: { user_id: admin.id, studio_id: studio.id, role: 'STUDIO_ADMIN' } });
      const token = jwt.sign({ sub: admin.id, role: 'STUDIO_ADMIN', ver: 0 }, process.env.JWT_SECRET!);

      const today = localDate(new Date(), timeZone);
      const yesterday = shift(today, -1);
      const tomorrow = shift(today, 1);

      // Half-hour sessions just either side of the studio's two midnights, each in its own
      // room, each a different amount so any wrong bucket shows in the totals. Every one
      // but the last is paid, at the moment it starts.
      const book = async (name: string, starts: Date, total: number, paid: boolean) => {
        const room = await prisma.room.create({ data: { studio_id: studio.id, name: `${name} room` } });
        const booking = await prisma.booking.create({ data: {
          studio_id: studio.id, artist_id: artistUser.artist!.id, room_id: room.id, service_id: service.id,
          starts_at: starts, ends_at: new Date(starts.getTime() + 30 * 60_000), total_usd: total, status: 'CONFIRMED',
        } });
        if (paid) {
          await prisma.payment.create({ data: { booking_id: booking.id, provider: 'cash', amount_usd: total, status: 'PAID', paid_at: starts } });
        }
        return { id: booking.id, starts, total, paid };
      };
      const lastNight = await book('last night', at(yesterday, 23, 15, timeZone), 1, true);
      const earlyToday = await book('early today', at(today, 0, 15, timeZone), 10, true);
      const lateToday = await book('late today', at(today, 23, 15, timeZone), 100, true);
      const earlyTomorrow = await book('early tomorrow', at(tomorrow, 0, 15, timeZone), 1000, false);
      const all = [lastNight, earlyToday, lateToday, earlyTomorrow];

      const analytics = await get('/admin/analytics', token);
      assert.equal(analytics.status, 200, JSON.stringify(analytics.body));
      assert.deepEqual(analytics.body.todays_bookings.map((b: any) => b.id), [earlyToday.id, lateToday.id],
        "today's sessions are the two inside the studio's own midnights");
      const days = analytics.body.weekly_days;
      assert.equal(days.length, 7);
      assert.deepEqual(days.map((d: any) => d.date), Array.from({ length: 7 }, (_, i) => shift(today, i - 6)),
        "the sparkline is labelled with the studio's dates, ending today");
      assert.deepEqual(days[6], { date: today, revenue_usd: 110, booking_count: 2 });
      assert.deepEqual(days[5], { date: yesterday, revenue_usd: 1, booking_count: 1 });
      assert.equal(analytics.body.week_revenue_usd, 111, "the week's revenue is the seven studio days");
      assert.equal(analytics.body.week_sessions, 3);
      assert.equal(analytics.body.prev_week_revenue_usd, 0);
      assert.equal(analytics.body.prev_week_sessions, 0);

      const pulse = await get('/studio/pulse', token);
      assert.equal(pulse.status, 200, JSON.stringify(pulse.body));
      assert.equal(pulse.body.utilization.today_booked_hours, 1, "today's booked hours are the two half hours of the studio's day");
      assert.equal(pulse.body.finance.today_booked_usd, 110);
      // The week starts on the studio's Sunday. Only when today is that Sunday does last
      // night fall in the week before.
      const sunday = new Date(`${today}T00:00:00Z`).getUTCDay() === 0;
      const inWeek = all.filter((b) => !sunday || b !== lastNight);
      assert.equal(pulse.body.utilization.week_sessions, inWeek.length);
      assert.equal(pulse.body.finance.week_collected_usd, inWeek.filter((b) => b.paid).reduce((sum, b) => sum + b.total, 0));
    });
  }
});
