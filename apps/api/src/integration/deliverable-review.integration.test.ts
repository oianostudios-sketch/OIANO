import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// Delivered files are one Deliverable per booking, each delivery a numbered,
// immutable version, and the artist's answer belongs to one version. These hold
// that record true when deliveries and reviews arrive together.
test('delivery versions and reviews stay attributable under concurrency', async (t) => {
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
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    });
    return { status: response.status, body: (await response.json()) as any };
  };
  const auth = (user: { id: string; role: string }) => ({
    authorization: `Bearer ${jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!)}`,
  });

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = (label: string) => `${label}-${runId}@example.test`;
  const studio = await prisma.studio.create({ data: { slug: `delivery-${runId}`, name: 'Delivery Studio' } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Delivery Room' } });
  const service = await prisma.serviceOffering.create({ data: {
    studio_id: studio.id, category: 'RECORDING', name: 'Delivery Session', min_price_usd: 50, max_price_usd: 50, unit: 'hour',
  } });
  const admin = await prisma.user.create({ data: { email: email('admin'), role: 'STUDIO_ADMIN' } });
  await prisma.studioStaff.create({ data: { user_id: admin.id, studio_id: studio.id, role: 'STUDIO_ADMIN' } });
  const artistUser = (label: string) => prisma.user.create({
    data: { email: email(label), role: 'ARTIST', artist: { create: { name: `Delivery ${label}` } } },
    include: { artist: true },
  });
  const artist = await artistUser('artist');
  const stranger = await artistUser('stranger');

  let slot = 0;
  const booking = () => {
    slot += 1;
    const starts_at = new Date(Date.now() - slot * 3 * 3_600_000);
    return prisma.booking.create({ data: {
      studio_id: studio.id, artist_id: artist.artist!.id, room_id: room.id, service_id: service.id,
      starts_at, ends_at: new Date(starts_at.getTime() + 3_600_000), total_usd: 50, status: 'CONFIRMED',
    } });
  };
  const deliver = (bookingId: string, file: string) => request(`/bookings/${bookingId}/deliver`, {
    method: 'POST', headers: auth(admin), body: JSON.stringify({ file_urls: [`https://files.example.test/${file}`] }),
  });
  const review = (bookingId: string, deliverableId: string, body: Record<string, unknown>, user = artist) =>
    request(`/bookings/${bookingId}/deliverables/${deliverableId}/review`, { method: 'PATCH', headers: auth(user), body: JSON.stringify(body) });
  const stored = (bookingId: string) => prisma.deliverable.findMany({
    where: { booking_id: bookingId },
    include: { versions: { orderBy: { version_number: 'asc' } }, reviews: true },
  });

  await t.test('deliveries arriving together become one deliverable with consecutive versions', async () => {
    const session = await booking();
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => deliver(session.id, `take-${n}.wav`)));
    assert.deepEqual(results.map((result) => result.status), [200, 200, 200, 200, 200, 200], JSON.stringify(results.map((r) => r.body)));
    const deliverables = await stored(session.id);
    assert.equal(deliverables.length, 1, 'one booking, one deliverable');
    assert.deepEqual(deliverables[0].versions.map((version) => version.version_number), [1, 2, 3, 4, 5, 6]);
    assert.equal(deliverables[0].current_version, 6);
  });

  await t.test('an approval names the version the artist saw, and a newer delivery refuses it', async () => {
    const session = await booking();
    const first = await deliver(session.id, 'mix-01.wav');
    await deliver(session.id, 'mix-02.wav');
    const deliverableId = first.body.deliverable.id as string;

    const stale = await review(session.id, deliverableId, { decision: 'APPROVED', version_number: 1 });
    assert.equal(stale.status, 409, 'version 2 was delivered after the version the artist approved');
    const [untouched] = await stored(session.id);
    assert.equal(untouched.status, 'PENDING_REVIEW');
    assert.equal(untouched.reviews.length, 0, 'the refused approval records nothing');

    const current = await review(session.id, deliverableId, { decision: 'APPROVED', version_number: 2 });
    assert.equal(current.status, 200);
    const [approved] = await stored(session.id);
    assert.equal(approved.status, 'APPROVED');
    assert.deepEqual(approved.reviews.map((row) => [row.version_number, row.decision]), [[2, 'APPROVED']]);
  });

  await t.test('approvals arriving together record one approval', async () => {
    const session = await booking();
    const delivered = await deliver(session.id, 'master.wav');
    const results = await Promise.all([1, 2, 3, 4, 5].map(() =>
      review(session.id, delivered.body.deliverable.id, { decision: 'APPROVED', version_number: 1 })));
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409, 409, 409, 409]);
    const [deliverable] = await stored(session.id);
    assert.equal(deliverable.reviews.length, 1);
  });

  await t.test('a review racing a new delivery never marks the new version approved', async () => {
    for (let round = 0; round < 8; round += 1) {
      const session = await booking();
      const delivered = await deliver(session.id, `round-${round}-v1.wav`);
      // An older page sends no version: the review applies to the version current when read.
      const [answer] = await Promise.all([
        review(session.id, delivered.body.deliverable.id, { decision: 'APPROVED' }),
        deliver(session.id, `round-${round}-v2.wav`),
      ]);
      const [deliverable] = await stored(session.id);
      if (deliverable.status === 'APPROVED') {
        assert.ok(
          deliverable.reviews.some((row) => row.decision === 'APPROVED' && row.version_number === deliverable.current_version),
          `round ${round}: an approved deliverable was approved at its current version`,
        );
      }
      assert.ok([200, 409].includes(answer.status), `round ${round}: ${answer.status}`);
    }
  });

  await t.test('only the booking\'s artist reviews its deliverable', async () => {
    const session = await booking();
    const delivered = await deliver(session.id, 'private.wav');
    const intrusion = await review(session.id, delivered.body.deliverable.id, { decision: 'APPROVED', version_number: 1 }, stranger);
    assert.equal(intrusion.status, 404);
    const [deliverable] = await stored(session.id);
    assert.equal(deliverable.reviews.length, 0);
  });
});
