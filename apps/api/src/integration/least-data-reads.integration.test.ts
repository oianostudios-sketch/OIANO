import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// Two reads handed whole rows to callers who need a few fields. GET /engineers and
// GET /engineers/:id gave the rate a studio pays each engineer to any signed-in account
// that named the studio. GET /bookings gave a producer the artist's whole row (their
// account id included), the artist's booking notes, the payment record and the studio's
// internals for every session on the producer's project; GET /bookings/:id did the same
// apart from the artist's email. Each response now lists its fields.

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

test('engineer and producer booking reads carry only what their callers use', async (t) => {
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
  const get = async (path: string, userId: string, role: string) => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { authorization: `Bearer ${jwt.sign({ sub: userId, role, ver: 0 }, process.env.JWT_SECRET!)}` },
    });
    return { status: response.status, body: await response.json() as any };
  };

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = (label: string) => `least-${label}-${runId}@example.test`;
  const secret = `PRIVATE-${runId}`;

  const studio = await prisma.studio.create({ data: {
    slug: `least-${runId}`, name: 'Least Studio', address: '1 Least Way',
    stripe_account_id: `acct_${secret}`, platform_fee_bps: 1234, phone: `+1-${secret}`, email: email('studio-contact'),
  } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Room L', hourly_rate: 55 } });
  const service = await prisma.serviceOffering.create({ data: {
    studio_id: studio.id, category: 'RECORDING', name: 'Tracking', min_price_usd: 60, max_price_usd: 90, unit: 'hour',
  } });
  const engineerUser = await prisma.user.create({ data: { email: email('engineer'), role: 'ENGINEER' } });
  const engineer = await prisma.engineer.create({ data: {
    studio_id: studio.id, user_id: engineerUser.id, name: 'Lee Engineer', specialties: ['Mixing'], bio: 'Mixes', hourly_rate_usd: 42,
  } });
  const owner = await prisma.user.create({ data: { email: email('owner'), role: 'STUDIO_ADMIN', active_studio_id: studio.id } });
  await prisma.studioStaff.create({ data: { user_id: owner.id, studio_id: studio.id, role: 'STUDIO_ADMIN', capabilities: [] } });

  const artistUser = await prisma.user.create({ data: { email: email('artist'), role: 'ARTIST', artist: { create: { name: 'Least Artist', alias: 'LA' } } }, include: { artist: true } });
  const producerUser = await prisma.user.create({ data: { email: email('producer'), role: 'PRODUCER', producer: { create: { name: 'Least Producer' } } }, include: { producer: true } });
  const project = await prisma.project.create({ data: { producer_id: producerUser.producer!.id, artist_id: artistUser.artist!.id, title: 'Least Record' } });
  const starts = new Date(Date.now() + 2 * 86_400_000);
  const booking = await prisma.booking.create({ data: {
    studio_id: studio.id, artist_id: artistUser.artist!.id, room_id: room.id, service_id: service.id, engineer_id: engineer.id, project_id: project.id,
    starts_at: starts, ends_at: new Date(starts.getTime() + 3_600_000),
    total_usd: 60, status: 'CONFIRMED', notes: `Artist booking notes ${secret}`,
  } });
  await prisma.payment.create({ data: {
    booking_id: booking.id, provider: 'stripe', provider_ref: `cs_${secret}`, payment_intent_id: `pi_${secret}`, amount_usd: 60, status: 'PAID',
  } });
  await prisma.sessionLog.create({ data: {
    booking_id: booking.id, artist_id: artistUser.artist!.id, notes: 'Tracked vocals', tracks_worked: ['https://example.test/take1.wav'],
    artist_rating: 5, artist_testimonial: `Testimonial ${secret}`, quality_rating: 4,
  } });
  await prisma.deliverable.create({ data: { booking_id: booking.id, title: 'Rough mix', created_by: owner.id } });

  const engineerForbidden = ['hourly_rate_usd', 'user_id', 'studio_id', 'credits'];
  const assertEngineerProfile = (e: any, label: string) =>
    assert.deepEqual([e.id, e.name, e.specialties, e.bio, e.avatar_url], [engineer.id, 'Lee Engineer', ['Mixing'], 'Mixes', null], label);

  await t.test('GET /engineers and /engineers/:id give an artist or producer the public profile only', async () => {
    for (const [userId, role] of [[artistUser.id, 'ARTIST'], [producerUser.id, 'PRODUCER']] as const) {
      const list = await get(`/engineers?studio_id=${studio.id}`, userId, role);
      assert.equal(list.status, 200, role);
      assert.equal(list.body.length, 1, role);
      assertEngineerProfile(list.body[0], `${role} list`);
      assertNoKeys(list.body, engineerForbidden, `${role} /engineers`);

      const one = await get(`/engineers/${engineer.id}?studio_id=${studio.id}`, userId, role);
      assert.equal(one.status, 200, role);
      assertEngineerProfile(one.body, `${role} one`);
      assertNoKeys(one.body, engineerForbidden, `${role} /engineers/:id`);
    }
  });

  await t.test('GET /engineers still gives the studio\'s own staff the rate it pays', async () => {
    const list = await get('/engineers', owner.id, 'STUDIO_ADMIN');
    assert.equal(list.status, 200);
    assertEngineerProfile(list.body[0], 'staff list');
    assert.equal(Number(list.body[0].hourly_rate_usd), 42);
    const one = await get(`/engineers/${engineer.id}`, owner.id, 'STUDIO_ADMIN');
    assert.equal(Number(one.body.hourly_rate_usd), 42);
    assertNoKeys([list.body, one.body], ['user_id'], 'staff /engineers');
  });

  // Keys a producer never reads: the artist's and engineer's accounts, the studio's
  // internals, the payment record's provider fields, and the session's private ratings.
  const producerForbidden = ['user_id', 'email', 'wallet', 'onboarding_completed_at', 'hourly_rate_usd', 'stripe_account_id',
    'platform_fee_bps', 'phone', 'passport_seq', 'mint_letter', 'max_price_usd', 'min_price_usd', 'hourly_rate',
    'provider', 'provider_ref', 'payment_intent_id', 'amount_usd', 'refunded_usd', 'refund_ref', 'paid_at',
    'artist_rating', 'artist_testimonial', 'quality_rating', 'ai_summary', 'preferred_engineer_id'];

  const assertProducerSession = (b: any, label: string) => {
    assert.deepEqual(
      [b.id, b.status, b.room_id, b.studio.name, b.studio.timezone, b.room.name, b.engineer.name, b.service.name, b.artist.name, b.artist.alias, b.project.title],
      [booking.id, 'CONFIRMED', room.id, 'Least Studio', studio.timezone, 'Room L', 'Lee Engineer', 'Tracking', 'Least Artist', 'LA', 'Least Record'],
      label,
    );
    assert.equal(new Date(b.starts_at).getTime(), booking.starts_at.getTime(), label);
    assert.equal(new Date(b.ends_at).getTime(), booking.ends_at.getTime(), label);
  };

  await t.test('GET /bookings for a producer carries the calendar\'s fields, not the artist\'s or the payment\'s', async () => {
    const { status, body } = await get('/bookings', producerUser.id, 'PRODUCER');
    assert.equal(status, 200);
    assert.equal(body.total, 1);
    assertProducerSession(body.data[0], 'producer list');
    assertNoKeys(body, [...producerForbidden, 'notes', 'total_usd', 'payment', 'session_log'], 'producer /bookings');
    assert.ok(!JSON.stringify(body).includes(secret), 'no private value appears anywhere');
  });

  await t.test('GET /bookings/:id for a producer adds only what the session page shows', async () => {
    const { status, body } = await get(`/bookings/${booking.id}`, producerUser.id, 'PRODUCER');
    assert.equal(status, 200);
    assertProducerSession(body, 'producer one');
    // BookingDetailPage shows every viewer the total and the payment status.
    assert.equal(Number(body.total_usd), 60);
    assert.deepEqual(body.payment, { status: 'PAID' });
    assert.deepEqual(body.session_log, { notes: 'Tracked vocals', tracks_worked: ['https://example.test/take1.wav'] });
    assert.equal(body.project.producer.name, 'Least Producer');
    assert.equal(body.deliverables.length, 1);
    assert.equal(body.notes, undefined, 'the artist\'s booking notes stay with the artist and studio');
    assertNoKeys(body, producerForbidden, 'producer /bookings/:id');
    assert.ok(!JSON.stringify(body).includes(secret), 'no private value appears anywhere');
  });

  await t.test('the artist and the studio still read their own booking in full', async () => {
    const artistList = await get('/bookings', artistUser.id, 'ARTIST');
    const own = artistList.body.data.find((b: any) => b.id === booking.id);
    assert.equal(own.notes, `Artist booking notes ${secret}`);
    assert.equal(own.payment.status, 'PAID');
    const staffOne = await get(`/bookings/${booking.id}`, owner.id, 'STUDIO_ADMIN');
    assert.equal(staffOne.status, 200);
    assert.equal(staffOne.body.notes, `Artist booking notes ${secret}`);
    assert.equal(staffOne.body.artist.user.email, email('artist'));
  });
});
