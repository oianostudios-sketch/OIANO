import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// Responses that left whole rows to Prisma published whatever the row held. GET /studio/:id
// and the passport are unauthenticated and /studio/current answers any artist who has booked
// there, so each engineer's login and pay rate, the studio's Connect account, private contact
// details and passport counter went to anyone. /studio-circle/current-work handed every studio
// a project had booked the producer's private notes. Each response now lists its fields.

// Every key anywhere in a JSON value, however deeply nested.
function keysAtAnyDepth(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => keysAtAnyDepth(item, into));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) { into.add(key); keysAtAnyDepth(child, into); }
  }
  return into;
}

function assertNoKeys(body: unknown, forbidden: string[], label: string) {
  const present = keysAtAnyDepth(body);
  const leaked = forbidden.filter((key) => present.has(key));
  assert.deepEqual(leaked, [], `${label} must not carry ${leaked.join(', ')}`);
}

test('public studio and Circle responses carry only what their screens render', async (t) => {
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
  const get = async (path: string, userId?: string, role?: string) => {
    const response = await fetch(`${baseUrl}${path}`, userId ? {
      headers: { authorization: `Bearer ${jwt.sign({ sub: userId, role, ver: 0 }, process.env.JWT_SECRET!)}` },
    } : undefined);
    return { status: response.status, body: await response.json() as any };
  };

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = (label: string) => `fields-${label}-${runId}@example.test`;
  const secret = `PRIVATE-${runId}`;

  const studio = await prisma.studio.create({ data: {
    slug: `fields-${runId}`, name: 'Fields Studio', address: '1 Public Way',
    stripe_account_id: `acct_${secret}`, platform_fee_bps: 1234, phone: `+1-${secret}`, email: email('studio-contact'),
    hero_image_url: 'https://example.test/hero.jpg',
  } });
  const room = await prisma.room.create({ data: {
    studio_id: studio.id, name: 'Room A', capacity: 4, description: 'Live room', amenities: ['Piano'], hourly_rate: 55,
  } });
  const service = await prisma.serviceOffering.create({ data: {
    studio_id: studio.id, category: 'RECORDING', name: 'Tracking', description: 'Record', min_price_usd: 60, max_price_usd: 90, unit: 'hour',
  } });
  const engineerUser = await prisma.user.create({ data: { email: email('engineer'), role: 'ENGINEER' } });
  const engineer = await prisma.engineer.create({ data: {
    studio_id: studio.id, user_id: engineerUser.id, name: 'Ada Engineer', specialties: ['Mixing'], bio: 'Mixes', hourly_rate_usd: 42,
  } });
  const owner = await prisma.user.create({ data: { email: email('owner'), role: 'STUDIO_ADMIN', active_studio_id: studio.id } });
  await prisma.studioStaff.create({ data: { user_id: owner.id, studio_id: studio.id, role: 'STUDIO_ADMIN', capabilities: [] } });

  const artistUser = await prisma.user.create({ data: { email: email('artist'), role: 'ARTIST', artist: { create: { name: 'Fields Artist' } } }, include: { artist: true } });
  const producerUser = await prisma.user.create({ data: { email: email('producer'), role: 'PRODUCER', producer: { create: { name: 'Fields Producer' } } }, include: { producer: true } });
  const project = await prisma.project.create({ data: {
    producer_id: producerUser.producer!.id, artist_id: artistUser.artist!.id, title: 'Fields Record', notes: `Producer notes ${secret}`,
  } });
  const starts = new Date(Date.now() + 2 * 86_400_000);
  const booking = (project_id: string | null, offsetHours: number) => prisma.booking.create({ data: {
    studio_id: studio.id, artist_id: artistUser.artist!.id, room_id: room.id, service_id: service.id, engineer_id: engineer.id, project_id,
    starts_at: new Date(starts.getTime() + offsetHours * 3_600_000), ends_at: new Date(starts.getTime() + (offsetHours + 1) * 3_600_000),
    total_usd: 60, status: 'CONFIRMED', notes: `Booking notes ${secret}`,
  } });
  const linked = await booking(project.id, 0);
  const unlinked = await booking(null, 3);

  // Studio-level internals, plus every row-level field no public screen reads.
  const studioForbidden = ['stripe_account_id', 'platform_fee_bps', 'passport_seq', 'mint_letter', 'phone', 'email',
    'user_id', 'hourly_rate_usd', 'studio_id', 'max_price_usd', 'created_at'];

  const assertBookingPageFields = (body: any, label: string) => {
    assert.equal(body.name, 'Fields Studio', label);
    assert.equal(body.address, '1 Public Way', label);
    assert.equal(body.image_url, 'https://example.test/hero.jpg', label);
    assert.equal(body.timezone, studio.timezone, label);
    assert.deepEqual(body.rooms.map((r: any) => [r.id, r.name, r.capacity, r.description, r.amenities, Number(r.hourly_rate), r.image_url]),
      [[room.id, 'Room A', 4, 'Live room', ['Piano'], 55, null]], `${label}: rooms`);
    assert.deepEqual(body.services.map((s: any) => [s.id, s.name, s.category, s.description, Number(s.min_price_usd), s.unit]),
      [[service.id, 'Tracking', 'RECORDING', 'Record', 60, 'hour']], `${label}: services`);
    assert.deepEqual(body.engineers.map((e: any) => [e.id, e.name, e.specialties, e.bio, e.avatar_url]),
      [[engineer.id, 'Ada Engineer', ['Mixing'], 'Mixes', null]], `${label}: engineers`);
  };

  await t.test('GET /studio/:id, unauthenticated, carries the booking page and nothing internal', async () => {
    const { status, body } = await get(`/studio/${studio.id}`);
    assert.equal(status, 200);
    assertBookingPageFields(body, '/studio/:id');
    assertNoKeys(body, studioForbidden, '/studio/:id');
    assert.ok(!JSON.stringify(body).includes(secret), 'no private value appears anywhere');
  });

  await t.test('GET /studio/passport/:slug, unauthenticated, carries the passport and nothing internal', async () => {
    const { status, body } = await get(`/studio/passport/${studio.slug}`);
    assert.equal(status, 200);
    assertBookingPageFields(body, 'passport');
    assert.ok(body.proof && Array.isArray(body.circle), 'passport keeps proof and circle');
    assertNoKeys(body, [...studioForbidden, 'circle_members'], 'passport');
    assert.ok(!JSON.stringify(body).includes(secret));
  });

  await t.test('GET /studio/current for an artist carries the same public shape', async () => {
    const { status, body } = await get('/studio/current', artistUser.id, 'ARTIST');
    assert.equal(status, 200);
    assertBookingPageFields(body, 'artist /current');
    assertNoKeys(body, studioForbidden, 'artist /current');
    assert.ok(!JSON.stringify(body).includes(secret));
  });

  await t.test('GET /studio/current for the studio\'s own operator adds only its fee', async () => {
    const { status, body } = await get('/studio/current', owner.id, 'STUDIO_ADMIN');
    assert.equal(status, 200);
    assert.equal(body.platform_fee_bps, 1234, 'a studio must see the rate it is charged');
    assertBookingPageFields(body, 'operator /current');
    assertNoKeys(body, studioForbidden.filter((key) => key !== 'platform_fee_bps'), 'operator /current');
    assert.ok(!JSON.stringify(body).includes(secret));
  });

  await t.test('GET /studio-circle/current-work carries the Circle screen, not the producer\'s notes', async () => {
    const { status, body } = await get('/studio-circle/current-work', owner.id, 'STUDIO_ADMIN');
    assert.equal(status, 200);
    const card = body.projects.find((p: any) => p.id === project.id);
    assert.ok(card, 'the project appears');
    assert.deepEqual([card.title, card.phase, card.artist.name, card.producer.name, card.bookings[0].id, card.bookings[0].room.name],
      ['Fields Record', 'PRE_PRODUCTION', 'Fields Artist', 'Fields Producer', linked.id, 'Room A']);
    const session = body.sessions.find((s: any) => s.id === unlinked.id);
    assert.ok(session, 'the unlinked session appears');
    assert.deepEqual([session.status, session.artist.name, session.service.name, session.room.name, session.engineer.name, session.source],
      ['CONFIRMED', 'Fields Artist', 'Tracking', 'Room A', 'Ada Engineer', 'SESSION']);
    assert.ok(typeof session.starts_at === 'string' && typeof card.bookings[0].starts_at === 'string');
    assertNoKeys(body, ['notes', 'user_id', 'producer_id', 'artist_id', 'total_usd', 'is_public'], 'current-work');
    assert.ok(!JSON.stringify(body).includes(secret));
  });
});
