import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// Owner decision 2026-10-09 (docs/status/2026-10-09-artist-detach.md): the artist controls
// which of their sessions a producer's project can see. They detach a session, including
// one a producer linked before the artist decided, and the producer loses the booking, its
// thread and its deliverables. A producer cannot rename the artist while that artist's
// sessions are on the project.

type Caller = { id: string; role: string };

test('the artist takes their session back off a project, and the producer cannot swap them out from under it', async (t) => {
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

  const studio = await prisma.studio.create({ data: { slug: unique('detach'), name: 'Detach studio' } });
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
  const makeBooking = async (artistId: string, days: number, projectId: string | null = null) => {
    const startsAt = new Date(Date.now() + days * 86_400_000);
    const booking = await prisma.booking.create({ data: {
      studio_id: studio.id, artist_id: artistId, room_id: room.id, service_id: service.id, project_id: projectId,
      starts_at: startsAt, ends_at: new Date(startsAt.getTime() + 3_600_000), total_usd: 50, status: 'CONFIRMED', notes: unique('private note'),
    } });
    await prisma.deliverable.create({ data: { booking_id: booking.id, title: 'Rough mix', created_by: owner.id } });
    return booking;
  };

  const a = await makeArtist('artist-a');
  const b = await makeArtist('artist-b');
  const producerUser = await prisma.user.create({ data: { email: email('producer'), role: 'PRODUCER' } });
  const producer = await prisma.producer.create({ data: { user_id: producerUser.id, name: unique('producer') } });
  const projectA = await prisma.project.create({ data: { producer_id: producer.id, artist_id: a.artist.id, title: unique('record-a') } });
  const otherProjectA = await prisma.project.create({ data: { producer_id: producer.id, artist_id: a.artist.id, title: unique('record-a2') } });
  const archivedA = await prisma.project.create({ data: { producer_id: producer.id, artist_id: a.artist.id, title: unique('old'), is_active: false } });
  const projectB = await prisma.project.create({ data: { producer_id: producer.id, artist_id: b.artist.id, title: unique('record-b') } });

  // A producer linked this one before #47 (the retired link-booking route set project_id).
  const linkedByProducer = await makeBooking(a.artist.id, 30, projectA.id);
  const onArchived = await makeBooking(a.artist.id, 32, archivedA.id);
  const bookingB = await makeBooking(b.artist.id, 33, projectB.id);
  // B's session left on a project that now names A (a rename before this change).
  const strandedB = await makeBooking(b.artist.id, 34, otherProjectA.id);

  const artistA = { id: a.user.id, role: 'ARTIST' };
  const artistB = { id: b.user.id, role: 'ARTIST' };
  const producerCaller = { id: producerUser.id, role: 'PRODUCER' };
  const projectOf = async (bookingId: string) =>
    (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { project_id: true } })).project_id;
  const producerProjectBookings = async (projectId: string) => {
    const projects = await request('GET', '/producer/projects', producerCaller);
    assert.equal(projects.status, 200, projects.text);
    const project = projects.body.find((candidate: any) => candidate.id === projectId);
    return project.bookings.map((booking: any) => ({ id: booking.id, deliverables: booking.deliverables.length }));
  };

  const posted = await request('POST', `/bookings/${linkedByProducer.id}/messages`, artistA, { body: 'Take two was the one' });
  assert.equal(posted.status, 201, posted.text);

  await t.test('while attached, the producer reads the booking, its thread and its deliverables', async () => {
    const read = await request('GET', `/bookings/${linkedByProducer.id}`, producerCaller);
    assert.equal(read.status, 200, read.text);
    assert.equal(read.body.deliverables.length, 1);
    const thread = await request('GET', `/bookings/${linkedByProducer.id}/messages`, producerCaller);
    assert.equal(thread.status, 200, thread.text);
    assert.ok(thread.text.includes('Take two was the one'));
    assert.deepEqual(await producerProjectBookings(projectA.id), [{ id: linkedByProducer.id, deliverables: 1 }]);
  });

  await t.test('only the artist, on their own booking and the project it is on, can detach', async () => {
    const attempts: Array<[string, Caller, string, string, number]> = [
      ['B detaches A\'s booking from A\'s project', artistB, projectA.id, linkedByProducer.id, 404],
      ['A detaches through B\'s project', artistA, projectB.id, linkedByProducer.id, 404],
      ['A detaches B\'s booking from B\'s project', artistA, projectB.id, bookingB.id, 404],
      ['A detaches B\'s booking off a project naming A', artistA, otherProjectA.id, strandedB.id, 404],
      ['A detaches from a project the booking is not on', artistA, otherProjectA.id, linkedByProducer.id, 404],
      ['A detaches with a malformed booking id', artistA, projectA.id, 'not-a-uuid', 404],
      ['the producer calls the artist route', producerCaller, projectA.id, linkedByProducer.id, 403],
    ];
    const wrong: string[] = [];
    for (const [label, caller, projectId, bookingId, expected] of attempts) {
      const answer = await request('DELETE', `/artist-projects/${projectId}/bookings/${bookingId}`, caller);
      if (answer.status !== expected) wrong.push(`${label}: expected ${expected}, got ${answer.status} ${answer.text.slice(0, 120)}`);
    }
    assert.deepEqual(wrong, [], wrong.join('\n'));
    assert.equal(await projectOf(linkedByProducer.id), projectA.id);
    assert.equal(await projectOf(bookingB.id), projectB.id);
    assert.equal(await projectOf(strandedB.id), otherProjectA.id);
  });

  await t.test('after the artist detaches, the producer loses the booking, its thread and its deliverables', async () => {
    const detached = await request('DELETE', `/artist-projects/${projectA.id}/bookings/${linkedByProducer.id}`, artistA);
    assert.equal(detached.status, 204, detached.text);
    assert.equal(await projectOf(linkedByProducer.id), null);

    assert.equal((await request('GET', `/bookings/${linkedByProducer.id}`, producerCaller)).status, 404);
    assert.equal((await request('GET', `/bookings/${linkedByProducer.id}/messages`, producerCaller)).status, 404);
    assert.equal((await request('POST', `/bookings/${linkedByProducer.id}/messages`, producerCaller, { body: 'still here?' })).status, 404);
    assert.equal((await request('GET', `/bookings/${linkedByProducer.id}/session-summary`, producerCaller)).status, 404);
    assert.equal((await request('GET', `/bookings/${linkedByProducer.id}/next-action`, producerCaller)).status, 404);
    assert.deepEqual(await producerProjectBookings(projectA.id), []);
    const list = await request('GET', '/bookings', producerCaller);
    assert.equal(list.status, 200, list.text);
    assert.ok(!list.text.includes(linkedByProducer.id));

    // Gone, so a second detach is 404, and the session is the artist's to attach again.
    assert.equal((await request('DELETE', `/artist-projects/${projectA.id}/bookings/${linkedByProducer.id}`, artistA)).status, 404);
    const available = await request('GET', `/artist-projects/${projectA.id}/available-sessions`, artistA);
    assert.ok(available.body.some((booking: any) => booking.id === linkedByProducer.id));
    // The artist still reads their own booking and thread.
    assert.equal((await request('GET', `/bookings/${linkedByProducer.id}/messages`, artistA)).status, 200);
  });

  await t.test('neither archiving the project nor renaming its artist keeps a session the artist takes back', async () => {
    const detached = await request('DELETE', `/artist-projects/${archivedA.id}/bookings/${onArchived.id}`, artistA);
    assert.equal(detached.status, 204, detached.text);
    assert.equal(await projectOf(onArchived.id), null);
    assert.equal((await request('GET', `/bookings/${onArchived.id}`, producerCaller)).status, 404);

    // B's session sits on a project that now names A; B can still take it back.
    assert.equal((await request('GET', `/bookings/${strandedB.id}`, producerCaller)).status, 200);
    const reclaimed = await request('DELETE', `/artist-projects/${otherProjectA.id}/bookings/${strandedB.id}`, artistB);
    assert.equal(reclaimed.status, 204, reclaimed.text);
    assert.equal(await projectOf(strandedB.id), null);
    assert.equal((await request('GET', `/bookings/${strandedB.id}`, producerCaller)).status, 404);
  });

  await t.test('the producer cannot rename the artist while that artist\'s sessions are on the project', async () => {
    const attached = await request('POST', `/artist-projects/${projectA.id}/bookings`, artistA, { booking_id: linkedByProducer.id });
    assert.equal(attached.status, 200, attached.text);

    const swap = await request('PATCH', `/producer/projects/${projectA.id}`, producerCaller, { artist_id: b.artist.id });
    assert.equal(swap.status, 409, swap.text);
    assert.match(swap.body.error, /detach/i);
    assert.equal((await request('PATCH', `/producer/projects/${projectA.id}`, producerCaller, { artist_id: null })).status, 409);
    const after = await prisma.project.findUniqueOrThrow({ where: { id: projectA.id } });
    assert.equal(after.artist_id, a.artist.id);
    // The artist keeps sight of the project and the session.
    const artistView = await request('GET', '/artist-projects', artistA);
    assert.ok(artistView.body.find((project: any) => project.id === projectA.id));

    // Other edits, and naming the same artist again, still work.
    assert.equal((await request('PATCH', `/producer/projects/${projectA.id}`, producerCaller, { phase: 'MIXING', artist_id: a.artist.id })).status, 200);
    // A project with none of the artist's sessions on it can still be renamed.
    assert.equal((await request('PATCH', `/producer/projects/${otherProjectA.id}`, producerCaller, { artist_id: b.artist.id })).status, 200);

    // Once the artist detaches, the rename goes through.
    assert.equal((await request('DELETE', `/artist-projects/${projectA.id}/bookings/${linkedByProducer.id}`, artistA)).status, 204);
    const renamed = await request('PATCH', `/producer/projects/${projectA.id}`, producerCaller, { artist_id: b.artist.id });
    assert.equal(renamed.status, 200, renamed.text);
    assert.equal(renamed.body.artist.id, b.artist.id);
  });
});
