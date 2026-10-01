import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// A studio that registered itself had no way to add a room or a service, and a booking
// needs one of each, so it could never be booked (C06). This follows one such studio
// from registration to its first booking, and holds who may change what it offers.
test('a self-registered studio sets up its rooms and services and takes its first booking', async (t) => {
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
  const request = async (path: string, init: RequestInit & { token?: string } = {}) => {
    const { token, ...rest } = init;
    const response = await fetch(`${baseUrl}${path}`, {
      ...rest,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(rest.headers || {}) },
    });
    return { status: response.status, body: (await response.json()) as any };
  };
  const tokenFor = (user: { id: string; role: string }) => jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!);
  const send = (method: string, path: string, token: string, body?: unknown) =>
    request(path, { method, token, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = (label: string) => `${label}-${runId}@example.test`;

  const signup = await request('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email: email('owner'), password: 'SetupPass123!', name: 'Setup Owner', role: 'STUDIO_ADMIN', studio_name: `Setup Rooms ${runId}`, studio_timezone: 'Europe/London' }),
  });
  assert.equal(signup.status, 201);
  const owner = signup.body.token as string;
  const studio = await prisma.studio.findFirstOrThrow({ where: { name: `Setup Rooms ${runId}` } });

  const artistUser = await prisma.user.create({
    data: { email: email('artist'), role: 'ARTIST', artist: { create: { name: 'Setup Artist', wallet: { create: { balance_usd: 500 } } } } },
    include: { artist: true },
  });
  const artist = tokenFor(artistUser);
  let day = 20;
  const book = (roomId: string, serviceId: string, hours: number) => {
    day += 1;
    const starts = new Date(Date.UTC(2030, 0, day, 12));
    return send('POST', '/bookings', artist, {
      studio_id: studio.id, room_id: roomId, service_id: serviceId,
      starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + hours * 3_600_000).toISOString(),
    });
  };

  let roomId = '';
  let serviceId = '';
  let bookingId = '';

  await t.test('a new studio has nothing to book, and says so', async () => {
    const setup = await send('GET', '/studio-setup', owner);
    assert.equal(setup.status, 200);
    assert.equal(setup.body.can_manage, true, 'the owner who registered the studio manages it');
    assert.equal(setup.body.bookable, false);
    assert.deepEqual([setup.body.rooms, setup.body.services], [[], []]);
  });

  await t.test('the owner adds a room and an hourly service, and an artist books them at that price', async () => {
    const room = await send('POST', '/studio-setup/rooms', owner, { name: 'Live Room', capacity: 6, description: 'Drum kit and two booths' });
    assert.equal(room.status, 201, JSON.stringify(room.body));
    const service = await send('POST', '/studio-setup/services', owner, { name: 'Recording', category: 'RECORDING', unit: 'hour', min_price_usd: 40 });
    assert.equal(service.status, 201, JSON.stringify(service.body));
    assert.equal(service.body.max_price_usd, 40, 'with no upper figure, the upper figure is the price');
    roomId = room.body.id; serviceId = service.body.id;

    assert.equal((await send('GET', '/studio-setup', owner)).body.bookable, true);
    const listed = await request(`/studio/${studio.id}`);
    assert.ok(listed.body.rooms.some((r: any) => r.id === roomId) && listed.body.services.some((s: any) => s.id === serviceId), 'the booking page sees them');

    const booking = await book(roomId, serviceId, 2);
    assert.equal(booking.status, 201, JSON.stringify(booking.body));
    bookingId = booking.body.id;
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    assert.equal(Number(stored.total_usd), 80, 'two hours at the studio\'s own price');
  });

  await t.test('a new price applies to the next booking, never to one already made', async () => {
    const repriced = await send('PATCH', `/studio-setup/services/${serviceId}`, owner, { min_price_usd: 60 });
    assert.equal(repriced.status, 200);
    assert.equal(repriced.body.max_price_usd, 60, 'the upper figure is raised to the new price');
    assert.equal(Number((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).total_usd), 80);
    const next = await book(roomId, serviceId, 1);
    assert.equal(next.status, 201);
    assert.equal(Number((await prisma.booking.findUniqueOrThrow({ where: { id: next.body.id } })).total_usd), 60);
    const audit = await prisma.adminAuditLog.findFirst({ where: { action: 'studio.service.updated', metadata: { path: ['service_id'], equals: serviceId } } });
    assert.equal((audit?.metadata as any)?.price_usd_from, 40);
    assert.equal((audit?.metadata as any)?.price_usd_to, 60);
  });

  await t.test('what has been booked stays on the record; what has not can be removed', async () => {
    assert.equal((await send('DELETE', `/studio-setup/rooms/${roomId}`, owner)).status, 409);
    assert.equal((await send('DELETE', `/studio-setup/services/${serviceId}`, owner)).status, 409);
    assert.ok(await prisma.room.findUnique({ where: { id: roomId } }));
    const spare = await send('POST', '/studio-setup/rooms', owner, { name: 'Booth B' });
    assert.equal((await send('DELETE', `/studio-setup/rooms/${spare.body.id}`, owner)).status, 200);
    assert.equal(await prisma.room.count({ where: { id: spare.body.id } }), 0);
  });

  await t.test('names are unique within the studio, and prices are checked', async () => {
    assert.equal((await send('POST', '/studio-setup/rooms', owner, { name: 'live room' })).status, 409);
    assert.equal((await send('POST', '/studio-setup/services', owner, { name: 'Mixing', category: 'MIX_MASTER', unit: 'track', min_price_usd: 100, max_price_usd: 50 })).status, 400);
    assert.equal((await send('POST', '/studio-setup/services', owner, { name: 'Mixing', category: 'MIX_MASTER', unit: 'track', min_price_usd: 99.999 })).status, 400);
    assert.equal((await send('POST', '/studio-setup/services', owner, { name: 'Mixing', category: 'MIX_MASTER', unit: 'fortnight', min_price_usd: 100 })).status, 400);
    assert.equal(await prisma.serviceOffering.count({ where: { studio_id: studio.id, name: 'Mixing' } }), 0);
  });

  await t.test('only staff who manage the studio\'s standards change it; other staff only read it', async () => {
    const staff = async (label: string, role: 'STUDIO_ADMIN' | 'ENGINEER', capabilities: string[]) => {
      const user = await prisma.user.create({ data: { email: email(label), role } });
      await prisma.studioStaff.create({ data: { user_id: user.id, studio_id: studio.id, role, position: label.toUpperCase(), capabilities } });
      return tokenFor(user);
    };
    const reception = await staff('reception', 'STUDIO_ADMIN', ['VIEW_CALENDAR', 'MANAGE_CALENDAR', 'MANAGE_BOOKINGS']);
    const manager = await staff('manager', 'STUDIO_ADMIN', ['MANAGE_BOOKINGS', 'MANAGE_POLICIES']);
    const engineer = await staff('engineer', 'ENGINEER', ['VIEW_CALENDAR']);

    for (const [who, token] of [['reception', reception], ['engineer', engineer]] as const) {
      const view = await send('GET', '/studio-setup', token);
      assert.equal(view.status, 200, `${who} reads the studio's setup`);
      assert.equal(view.body.can_manage, false);
      assert.equal((await send('POST', '/studio-setup/rooms', token, { name: `${who} room` })).status, 403);
      assert.equal((await send('PATCH', `/studio-setup/services/${serviceId}`, token, { min_price_usd: 1 })).status, 403);
    }
    assert.equal(Number((await prisma.serviceOffering.findUniqueOrThrow({ where: { id: serviceId } })).min_price_usd), 60, 'no refused request changed the price');
    assert.equal((await send('POST', '/studio-setup/rooms', manager, { name: 'Control Room' })).status, 201, 'a manager with the standards permission may');

    assert.equal((await send('GET', '/studio-setup', artist)).status, 403, 'an artist is not staff');
  });

  await t.test('one studio cannot touch another\'s rooms or services', async () => {
    const other = await request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email: email('other-owner'), password: 'SetupPass123!', name: 'Other Owner', role: 'STUDIO_ADMIN', studio_name: `Other Rooms ${runId}`, studio_timezone: 'Europe/London' }),
    });
    assert.equal(other.status, 201);
    const token = other.body.token as string;
    assert.equal((await send('PATCH', `/studio-setup/rooms/${roomId}`, token, { name: 'Taken' })).status, 404);
    assert.equal((await send('PATCH', `/studio-setup/services/${serviceId}`, token, { min_price_usd: 1 })).status, 404);
    assert.equal((await send('DELETE', `/studio-setup/rooms/${roomId}`, token)).status, 404);
    assert.equal((await prisma.room.findUniqueOrThrow({ where: { id: roomId } })).name, 'Live Room');
  });
});
