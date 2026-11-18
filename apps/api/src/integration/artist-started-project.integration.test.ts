import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

// An artist starts a project of their own (POST /api/artist-projects). It belongs to
// that artist, has no producer, and stays out of every other workspace: another
// artist, a producer and studio staff cannot read or change it. Producers still
// create projects exactly as before.
test('an artist starts their own project, and nobody else reaches it', async (t) => {
  assert.equal(process.env.NODE_ENV, 'test');
  const database = new URL(process.env.DATABASE_URL!);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname), 'requires local PostgreSQL');
  assert.match(database.pathname, /[_-]test$/i);

  const [{ app }, { prisma }] = await Promise.all([import('../app'), import('../lib/prisma')]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await prisma.$disconnect();
  });

  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  type Identity = { id: string; role: string };
  const request = async (method: string, path: string, user?: Identity, body?: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        ...(user ? { authorization: `Bearer ${jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!)}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: any = text;
    try { parsed = JSON.parse(text); } catch { /* redirects and HTML answer as text */ }
    return { status: response.status, body: parsed };
  };

  const email = (label: string) => `${label}-${randomUUID()}@example.test`;
  const artistUser = (label: string) => prisma.user.create({
    data: { email: email(label), role: 'ARTIST', artist: { create: { name: label } } },
    include: { artist: true },
  });
  const artist = await artistUser('Starting Artist');
  const otherArtist = await artistUser('Other Artist');
  const producer = await prisma.user.create({
    data: { email: email('producer'), role: 'PRODUCER', producer: { create: { name: 'Neighbour Producer' } } },
    include: { producer: true },
  });
  // An ARTIST account that never got an artist profile is not eligible.
  const profileless = await prisma.user.create({ data: { email: email('profileless'), role: 'ARTIST' } });
  const studio = await prisma.studio.create({ data: { slug: `artist-project-${randomUUID()}`, name: 'Artist Project Studio' } });
  const staff = await prisma.user.create({ data: { email: email('staff'), role: 'STUDIO_ADMIN', active_studio_id: studio.id } });
  await prisma.studioStaff.create({ data: { user_id: staff.id, studio_id: studio.id, role: 'STUDIO_ADMIN' } });

  const title = `Debut single ${randomUUID()}`;
  const created = await request('POST', '/artist-projects', artist, { title, notes: 'Three songs, recording in March' });

  await t.test('an eligible artist creates a project that is theirs, with no producer', async () => {
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.title, title);
    assert.equal(created.body.phase, 'PRE_PRODUCTION');
    assert.equal(created.body.artist_id, artist.artist!.id);
    assert.equal(created.body.producer_id, null);
    const stored = await prisma.project.findUniqueOrThrow({ where: { id: created.body.id } });
    assert.equal(stored.artist_id, artist.artist!.id);
    assert.equal(stored.producer_id, null);
    assert.equal(stored.is_public, false, 'a new project is not on the Passport until the artist says so');

    const listed = await request('GET', '/artist-projects', artist);
    assert.equal(listed.status, 200);
    const mine = listed.body.find((project: { id: string }) => project.id === created.body.id);
    assert.ok(mine, 'the project is in its artist\'s list');
    assert.equal(mine.producer, null);
  });

  await t.test('the artist works in it: messages and their own session', async () => {
    const message = await request('POST', `/projects/${created.body.id}/messages`, artist, { body: 'Reference tracks to follow.' });
    assert.equal(message.status, 201, JSON.stringify(message.body));
    const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Room A' } });
    const service = await prisma.serviceOffering.create({ data: {
      studio_id: studio.id, category: 'RECORDING', name: 'Session', min_price_usd: 0, max_price_usd: 0, unit: 'hour',
    } });
    const starts = new Date(Date.now() + 40 * 86_400_000);
    const booking = await prisma.booking.create({ data: {
      studio_id: studio.id, artist_id: artist.artist!.id, room_id: room.id, service_id: service.id,
      starts_at: starts, ends_at: new Date(starts.getTime() + 3_600_000), total_usd: 0, status: 'CONFIRMED',
    } });
    const attached = await request('POST', `/artist-projects/${created.body.id}/bookings`, artist, { booking_id: booking.id });
    assert.equal(attached.status, 200, JSON.stringify(attached.body));
    assert.equal(attached.body.project_id, created.body.id);
  });

  await t.test('unauthorized callers are rejected and create nothing', async () => {
    const before = await prisma.project.count();
    assert.equal((await request('POST', '/artist-projects', undefined, { title: 'Anonymous' })).status, 401);
    assert.equal((await request('POST', '/artist-projects', producer, { title: 'Producer through the artist door' })).status, 403);
    assert.equal((await request('POST', '/artist-projects', staff, { title: 'Staff through the artist door' })).status, 403);
    assert.equal((await request('POST', '/artist-projects', profileless, { title: 'No profile' })).status, 404);
    assert.equal(await prisma.project.count(), before, 'no rejected request created a project');
  });

  await t.test('the artist cannot name someone else as owner, or a producer, through the body', async () => {
    const before = await prisma.project.count();
    for (const extra of [{ artist_id: otherArtist.artist!.id }, { producer_id: producer.producer!.id }, { is_public: true }]) {
      const response = await request('POST', '/artist-projects', artist, { title: 'Smuggled field', ...extra });
      assert.equal(response.status, 400, `${Object.keys(extra)[0]} is refused`);
    }
    assert.equal((await request('POST', '/artist-projects', artist, { title: '   ' })).status, 400, 'a blank title is refused');
    assert.equal(await prisma.project.count(), before);
  });

  await t.test('another artist cannot see or use it', async () => {
    const listed = await request('GET', '/artist-projects', otherArtist);
    assert.equal(listed.status, 200);
    assert.ok(!listed.body.some((project: { id: string }) => project.id === created.body.id));
    assert.equal((await request('GET', `/artist-projects/${created.body.id}`, otherArtist)).status, 404);
    assert.equal((await request('GET', `/artist-projects/${created.body.id}/available-sessions`, otherArtist)).status, 404);
    assert.equal((await request('GET', `/projects/${created.body.id}/messages`, otherArtist)).status, 404);
    assert.equal((await request('POST', `/projects/${created.body.id}/messages`, otherArtist, { body: 'Let me in' })).status, 404);
  });

  await t.test('producers and studio staff cannot reach it', async () => {
    const listed = await request('GET', '/producer/projects', producer);
    assert.equal(listed.status, 200);
    assert.ok(!listed.body.some((project: { id: string }) => project.id === created.body.id));
    assert.equal((await request('PATCH', `/producer/projects/${created.body.id}`, producer, { title: 'Taken over' })).status, 404);
    assert.equal((await request('DELETE', `/producer/projects/${created.body.id}`, producer)).status, 404);
    assert.equal((await request('POST', `/producer/projects/${created.body.id}/participants`, producer, {
      display_name: 'Uninvited', email: email('uninvited'), role: 'SONGWRITER',
    })).status, 404);
    assert.equal((await request('POST', `/producer/projects/${created.body.id}/credits`, producer, {
      credited_name: 'Uninvited', role: 'SONGWRITER',
    })).status, 404);
    assert.equal((await request('GET', `/projects/${created.body.id}/messages`, producer)).status, 404);
    // The studio the session is booked at can follow the conversation, as with any
    // project with a booking there; a studio with no booking on it cannot.
    const otherStudio = await prisma.studio.create({ data: { slug: `elsewhere-${randomUUID()}`, name: 'Elsewhere' } });
    const elsewhere = await prisma.user.create({ data: { email: email('elsewhere'), role: 'STUDIO_ADMIN', active_studio_id: otherStudio.id } });
    await prisma.studioStaff.create({ data: { user_id: elsewhere.id, studio_id: otherStudio.id, role: 'STUDIO_ADMIN' } });
    assert.equal((await request('GET', `/projects/${created.body.id}/messages`, elsewhere)).status, 404);
    const stored = await prisma.project.findUniqueOrThrow({ where: { id: created.body.id } });
    assert.equal(stored.title, title);
    assert.equal(stored.is_active, true);
    assert.equal(stored.producer_id, null);
  });

  await t.test('producer project creation is unchanged', async () => {
    const made = await request('POST', '/producer/projects', producer, { title: 'Producer project', artist_id: artist.artist!.id });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal(made.body.producer_id, producer.producer!.id);
    assert.equal((await request('POST', '/producer/projects', artist, { title: 'Artist through the producer door' })).status, 403);
    const listed = await request('GET', '/producer/projects', producer);
    assert.ok(listed.body.some((project: { id: string }) => project.id === made.body.id));
    const artistList = await request('GET', '/artist-projects', artist);
    const named = artistList.body.find((project: { id: string }) => project.id === made.body.id);
    assert.ok(named, 'the named artist still sees a producer\'s project');
    assert.equal(named.producer.id, producer.producer!.id);
  });
});
