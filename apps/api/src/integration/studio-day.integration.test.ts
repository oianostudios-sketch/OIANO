import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// A day at a studio is the studio's own day, in its own time zone (C29). Availability used
// to answer for the UTC day and the runsheets for the server's day, and both counted only
// sessions starting that day, so a session carried over from the night before vanished.
// Every instant below is written out in UTC, worked by hand from the zone's offset, so the
// expectations do not lean on the code under test.
test("availability and the runsheets answer for the studio's own day", async (t) => {
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
  const get = async (path: string, token?: string) => {
    const response = await fetch(`${baseUrl}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    return { status: response.status, body: (await response.json()) as any };
  };

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const artistUser = await prisma.user.create({
    data: { email: `day-artist-${runId}@example.test`, role: 'ARTIST', artist: { create: { name: 'Day Artist' } } },
    include: { artist: true },
  });

  // A studio with one room per session, so the database's one-booking-per-room rule never
  // decides which sessions exist, and staff to read its runsheets.
  const studioIn = async (label: string, timezone: string) => {
    const studio = await prisma.studio.create({ data: { slug: `day-${label}-${runId}`, name: `Day ${label}`, timezone } });
    const service = await prisma.serviceOffering.create({ data: { studio_id: studio.id, category: 'RECORDING', name: 'Session', min_price_usd: 10, max_price_usd: 10, unit: 'hour' } });
    const staff = async (role: 'STUDIO_ADMIN' | 'ENGINEER') => {
      const user = await prisma.user.create({ data: { email: `day-${label}-${role.toLowerCase()}-${runId}@example.test`, role } });
      await prisma.studioStaff.create({ data: { user_id: user.id, studio_id: studio.id, role } });
      return tokenFor(user);
    };
    const roomLabels = new Map<string, string>();
    const bookingLabels = new Map<string, string>();
    const book = async (name: string, starts: string, ends: string, status: 'CONFIRMED' | 'PENDING' | 'CANCELLED' = 'CONFIRMED') => {
      const room = await prisma.room.create({ data: { studio_id: studio.id, name: `${name} room` } });
      const booking = await prisma.booking.create({ data: {
        studio_id: studio.id, artist_id: artistUser.artist!.id, room_id: room.id, service_id: service.id,
        starts_at: new Date(starts), ends_at: new Date(ends), total_usd: 10, status,
      } });
      roomLabels.set(room.id, name);
      bookingLabels.set(booking.id, name);
      return room.id;
    };
    const availability = async (date: string, roomId?: string) => {
      const response = await get(`/availability?date=${date}&studio_id=${studio.id}${roomId ? `&room_id=${roomId}` : ''}`);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      return (response.body.bookings as any[]).map((b) => roomLabels.get(b.room_id)).sort();
    };
    const runsheet = async (path: string, token: string) => {
      const response = await get(path, token);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      return { date: response.body.date as string, timezone: response.body.timezone as string, sessions: (response.body.bookings as any[]).map((b) => bookingLabels.get(b.id)).sort() };
    };
    return { studio, book, availability, runsheet, admin: await staff('STUDIO_ADMIN'), engineer: await staff('ENGINEER') };
  };

  await t.test('Auckland, on the day its clocks go forward', async () => {
    // 29 September 2030: Auckland is on NZST (UTC+12) at midnight and moves to NZDT
    // (UTC+13) at 02:00, so the day runs 2030-09-28T12:00Z to 2030-09-29T11:00Z, 23 hours.
    const auckland = await studioIn('auckland', 'Pacific/Auckland');
    await auckland.book('overnight in', '2030-09-28T10:00:00Z', '2030-09-28T13:00:00Z'); // 22:00 on the 28th to 01:00
    await auckland.book('morning', '2030-09-28T20:00:00Z', '2030-09-28T22:00:00Z'); // 09:00 to 11:00, still the 28th in UTC
    await auckland.book('late', '2030-09-29T09:00:00Z', '2030-09-29T10:00:00Z', 'PENDING'); // 22:00 to 23:00
    await auckland.book('ends at midnight', '2030-09-28T09:00:00Z', '2030-09-28T12:00:00Z'); // 21:00 to midnight the night before
    await auckland.book('next day', '2030-09-29T11:30:00Z', '2030-09-29T13:00:00Z'); // 00:30 on the 30th; a 24-hour day would keep it
    await auckland.book('cancelled', '2030-09-29T01:00:00Z', '2030-09-29T02:00:00Z', 'CANCELLED');
    const expected = ['late', 'morning', 'overnight in'];

    assert.deepEqual(await auckland.availability('2030-09-29'), expected);
    assert.deepEqual(await auckland.availability('2030-09-28'), ['ends at midnight', 'overnight in'], 'the overnight session is on both days it touches');
    assert.deepEqual(await auckland.availability('2030-09-30'), ['next day']);

    for (const [path, token] of [['/engineers/runsheet?date=2030-09-29', auckland.engineer], ['/admin/runsheet?date=2030-09-29', auckland.admin]] as const) {
      const sheet = await auckland.runsheet(path, token);
      assert.deepEqual(sheet.sessions, expected, path);
      assert.equal(sheet.date, '2030-09-29', path);
      assert.equal(sheet.timezone, 'Pacific/Auckland', `${path} names the zone its times are read in`);
    }
  });

  await t.test('Los Angeles, on the day its clocks go back', async () => {
    // 3 November 2030: Los Angeles is on PDT (UTC-7) at midnight and returns to PST
    // (UTC-8) at 02:00, so the day runs 2030-11-03T07:00Z to 2030-11-04T08:00Z, 25 hours.
    const losAngeles = await studioIn('los-angeles', 'America/Los_Angeles');
    const overnightRoom = await losAngeles.book('overnight in', '2030-11-03T06:00:00Z', '2030-11-03T08:00:00Z'); // 23:00 on the 2nd to 01:00
    await losAngeles.book('last hour', '2030-11-04T07:30:00Z', '2030-11-04T08:30:00Z'); // 23:30 to 00:30; a 24-hour day would drop it
    await losAngeles.book('previous evening', '2030-11-03T01:00:00Z', '2030-11-03T03:00:00Z'); // 18:00 on the 2nd, already the 3rd in UTC
    await losAngeles.book('next day', '2030-11-04T08:30:00Z', '2030-11-04T10:00:00Z'); // 00:30 on the 4th
    const expected = ['last hour', 'overnight in'];

    assert.deepEqual(await losAngeles.availability('2030-11-03'), expected);
    assert.deepEqual(await losAngeles.availability('2030-11-03', overnightRoom), ['overnight in'], 'a room filter narrows the same day');
    assert.deepEqual(await losAngeles.availability('2030-11-04'), ['last hour', 'next day']);

    for (const [path, token] of [['/engineers/runsheet?date=2030-11-03', losAngeles.engineer], ['/admin/runsheet?date=2030-11-03', losAngeles.admin]] as const) {
      const sheet = await losAngeles.runsheet(path, token);
      assert.deepEqual(sheet.sessions, expected, path);
      assert.equal(sheet.date, '2030-11-03', path);
    }
  });

  await t.test("with no date named, a runsheet is today at the studio, not on the server", async () => {
    // Kiritimati (UTC+14) and Pago Pago (UTC-11) are 25 hours apart, so at any moment their
    // dates differ, and no single server day can be today at both.
    const now = Date.now();
    const todayIn = (timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
    for (const timeZone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      const studio = await studioIn(timeZone.split('/')[1].toLowerCase(), timeZone);
      await studio.book('now', new Date(now - 30 * 60_000).toISOString(), new Date(now + 30 * 60_000).toISOString());
      for (const [path, token] of [['/engineers/runsheet', studio.engineer], ['/admin/runsheet', studio.admin]] as const) {
        const sheet = await studio.runsheet(path, token);
        assert.equal(sheet.date, todayIn(timeZone), `${path} at ${timeZone}`);
        assert.deepEqual(sheet.sessions, ['now'], `${path} at ${timeZone}`);
      }
    }
  });

  await t.test('a date must still be named for availability, and a studio', async () => {
    const auckland = await prisma.studio.findFirstOrThrow({ where: { slug: `day-auckland-${runId}` } });
    assert.equal((await get(`/availability?studio_id=${auckland.id}`)).status, 400);
    assert.equal((await get('/availability?date=2030-09-29')).status, 400);
  });
});
