import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// Owner decision 2026-10-09 (docs/status/2026-10-09-artist-links-bookings.md): a producer
// names the artist on their own project without the artist agreeing, so the name cannot
// open the artist's sessions. The artist attaches one of their own sessions to a project
// that names them, from their side, and that attach opens the booking, its thread and its
// deliverables to the producer exactly as the producer's link used to.

type Caller = { id: string; role: string };

test('only the artist attaches their session to a project that names them', async (t) => {
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
  const request = async (method: string, path: string, user: Caller, body?: unknown) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!)}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: any = text;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, body: parsed, text };
  };

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let sequence = 0;
  const unique = (label: string) => `${label}-${runId}-${(sequence += 1)}`;
  const email = (label: string) => `${unique(label)}@example.test`;

  const studio = await prisma.studio.create({ data: { slug: unique('links'), name: 'Links studio' } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: unique('room') } });
  const service = await prisma.serviceOffering.create({ data: {
    studio_id: studio.id, category: 'RECORDING', name: unique('service'), min_price_usd: 50, max_price_usd: 50, unit: 'hour',
  } });
  const owner = await prisma.user.create({ data: { email: email('owner'), role: 'STUDIO_ADMIN', active_studio_id: studio.id } });
  await prisma.studioStaff.create({ data: { user_id: owner.id, studio_id: studio.id, role: 'STUDIO_ADMIN', capabilities: [] } });

  const makeArtist = async (label: string) => {
    const user = await prisma.user.create({ data: { email: email(label), role: 'ARTIST' } });
    const artist = await prisma.artist.create({ data: { user_id: user.id, name: unique(label) } });
    return { user, artist };
  };
  const makeBooking = async (artistId: string, days: number) => {
    const startsAt = new Date(Date.now() + days * 86_400_000);
    const booking = await prisma.booking.create({ data: {
      studio_id: studio.id, artist_id: artistId, room_id: room.id, service_id: service.id,
      starts_at: startsAt, ends_at: new Date(startsAt.getTime() + 3_600_000), total_usd: 50, status: 'CONFIRMED', notes: unique('private note'),
    } });
    await prisma.deliverable.create({ data: { booking_id: booking.id, title: 'Rough mix', created_by: owner.id } });
    return booking;
  };

  const a = await makeArtist('artist-a');
  const b = await makeArtist('artist-b');
  const bookingA = await makeBooking(a.artist.id, 30);
  const bookingB = await makeBooking(b.artist.id, 31);

  const producerUser = await prisma.user.create({ data: { email: email('producer'), role: 'PRODUCER' } });
  const producer = await prisma.producer.create({ data: { user_id: producerUser.id, name: unique('producer') } });
  const projectA = await prisma.project.create({ data: { producer_id: producer.id, artist_id: a.artist.id, title: unique('record-a') } });
  const otherProjectA = await prisma.project.create({ data: { producer_id: producer.id, artist_id: a.artist.id, title: unique('record-a2') } });
  const archivedA = await prisma.project.create({ data: { producer_id: producer.id, artist_id: a.artist.id, title: unique('old'), is_active: false } });
  const projectB = await prisma.project.create({ data: { producer_id: producer.id, artist_id: b.artist.id, title: unique('record-b') } });
  const unnamed = await prisma.project.create({ data: { producer_id: producer.id, title: unique('no-artist') } });

  const projectOf = async (bookingId: string) =>
    (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { project_id: true } })).project_id;
  const artistA = { id: a.user.id, role: 'ARTIST' };
  const artistB = { id: b.user.id, role: 'ARTIST' };
  const producerCaller = { id: producerUser.id, role: 'PRODUCER' };

  await t.test('before the artist acts, the producer reaches none of their session', async () => {
    assert.equal((await request('GET', `/bookings/${bookingA.id}`, producerCaller)).status, 404);
    assert.equal((await request('GET', `/bookings/${bookingA.id}/messages`, producerCaller)).status, 404);
    const projects = await request('GET', '/producer/projects', producerCaller);
    assert.equal(projects.status, 200);
    assert.ok(!projects.text.includes(bookingA.id));
  });

  await t.test('the artist lists only their own unattached sessions, and only on a live project that names them', async () => {
    const listed = await request('GET', `/artist-projects/${projectA.id}/available-sessions`, artistA);
    assert.equal(listed.status, 200, listed.text);
    assert.deepEqual(listed.body.map((booking: any) => booking.id), [bookingA.id]);
    assert.equal((await request('GET', `/artist-projects/${projectB.id}/available-sessions`, artistA)).status, 404);
    assert.equal((await request('GET', `/artist-projects/${archivedA.id}/available-sessions`, artistA)).status, 404);
    assert.equal((await request('GET', `/artist-projects/${projectA.id}/available-sessions`, producerCaller)).status, 403);
  });

  await t.test('another artist\'s booking, or a project not naming the caller, is 404 and changes nothing', async () => {
    const attempts: Array<[string, Caller, string, string]> = [
      ['B attaches A\'s booking to A\'s project', artistB, projectA.id, bookingA.id],
      ['A attaches B\'s booking to A\'s project', artistA, projectA.id, bookingB.id],
      ['A attaches own booking to B\'s project', artistA, projectB.id, bookingA.id],
      ['A attaches own booking to a project with no artist', artistA, unnamed.id, bookingA.id],
      ['A attaches own booking to an archived project', artistA, archivedA.id, bookingA.id],
    ];
    const wrong: string[] = [];
    for (const [label, caller, projectId, bookingId] of attempts) {
      const answer = await request('POST', `/artist-projects/${projectId}/bookings`, caller, { booking_id: bookingId });
      if (answer.status !== 404) wrong.push(`${label}: expected 404, got ${answer.status} ${answer.text.slice(0, 120)}`);
    }
    assert.deepEqual(wrong, [], wrong.join('\n'));
    assert.equal((await request('POST', `/artist-projects/${projectA.id}/bookings`, producerCaller, { booking_id: bookingA.id })).status, 403);
    assert.equal((await request('POST', `/artist-projects/${projectA.id}/bookings`, artistA, { booking_id: 'not-a-uuid' })).status, 400);
    assert.equal(await projectOf(bookingA.id), null);
    assert.equal(await projectOf(bookingB.id), null);
  });

  await t.test('the artist attaches their own session, which opens it to the project\'s producer as before', async () => {
    const attached = await request('POST', `/artist-projects/${projectA.id}/bookings`, artistA, { booking_id: bookingA.id });
    assert.equal(attached.status, 200, attached.text);
    assert.equal(attached.body.project_id, projectA.id);
    assert.equal(await projectOf(bookingA.id), projectA.id);

    // Attaching again is harmless; moving it to another project is refused.
    assert.equal((await request('POST', `/artist-projects/${projectA.id}/bookings`, artistA, { booking_id: bookingA.id })).status, 200);
    assert.equal((await request('POST', `/artist-projects/${otherProjectA.id}/bookings`, artistA, { booking_id: bookingA.id })).status, 409);
    assert.equal(await projectOf(bookingA.id), projectA.id);
    const stillListed = await request('GET', `/artist-projects/${projectA.id}/available-sessions`, artistA);
    assert.deepEqual(stillListed.body, []);

    const read = await request('GET', `/bookings/${bookingA.id}`, producerCaller);
    assert.equal(read.status, 200, read.text);
    assert.equal(read.body.deliverables.length, 1);
    assert.ok(!read.text.includes(a.user.email));
    assert.equal((await request('GET', `/bookings/${bookingA.id}/messages`, producerCaller)).status, 200);
    const projects = await request('GET', '/producer/projects', producerCaller);
    const mine = projects.body.find((project: any) => project.id === projectA.id);
    assert.deepEqual(mine.bookings.map((booking: any) => booking.id), [bookingA.id]);

    const artistView = await request('GET', '/artist-projects', artistA);
    assert.deepEqual(artistView.body.find((project: any) => project.id === projectA.id).bookings.map((booking: any) => booking.id), [bookingA.id]);
  });
});
