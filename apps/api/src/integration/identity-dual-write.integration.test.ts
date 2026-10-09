import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// While the legacy Artist, Producer and Engineer rows are the truth, every route that
// writes one keeps the canonical Person and CreativeProfile in step (dual-write), so the
// parity check stays clean without running the backfill again. Readers can only move to
// the canonical tables once this holds.
test('routes that write an identity keep its person and profile in step', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);

  const [{ app }, { prisma }, { backfillIdentity, identityParity, mirrorIdentities }] = await Promise.all([
    import('../app'), import('../lib/prisma'), import('../lib/identity/backfill'),
  ]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await prisma.$disconnect();
  });

  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const send = async (method: string, path: string, token: string | null, body?: unknown) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as any };
  };
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = (label: string) => `${label}-${runId}@example.test`;
  const password = 'DualWrite123!';

  // Start from a database in step, as production will be after its backfill.
  await backfillIdentity(prisma);
  const clean = async (label: string) => assert.deepEqual((await identityParity(prisma)).mismatches, [], label);
  await clean('in step before any write');

  await t.test('signing up creates the person and profile at once', async () => {
    const artist = await send('POST', '/auth/signup', null, { email: email('artist'), password, name: 'Nana Signup', role: 'ARTIST' });
    assert.equal(artist.status, 201);
    const producer = await send('POST', '/auth/signup', null, { email: email('producer'), password, name: 'Efua Producer', role: 'PRODUCER' });
    assert.equal(producer.status, 201);
    const studio = await send('POST', '/auth/signup', null, { email: email('studio'), password, name: 'Owner', role: 'STUDIO_ADMIN', studio_name: `Dual Rooms ${runId}`, studio_timezone: 'Europe/London' });
    assert.equal(studio.status, 201);
    const entered = await send('POST', '/auth/enter', null, { email: email('entered'), password });
    assert.equal(entered.status, 201);
    const profile = await prisma.creativeProfile.findUniqueOrThrow({ where: { id: artist.body.user.artist.id }, include: { person: true } });
    assert.equal(profile.person.user_id, artist.body.user.id);
    assert.equal(profile.display_name, 'Nana Signup');
    await clean('after four kinds of signup');
  });

  await t.test('an artist\'s edits reach their profile', async () => {
    const login = await send('POST', '/auth/signup', null, { email: email('editor'), password, name: 'Kojo Edit', role: 'ARTIST' });
    const token = login.body.token as string;
    const artistId = login.body.user.artist.id as string;
    // Each edit is checked on its own: a later edit mirrors the whole artist and would hide a missing one.
    assert.equal((await send('PATCH', '/passport/profile', token, { name: 'Kojo Edited', alias: 'KJ', bio: 'New bio' })).status, 200);
    await clean('after a profile edit');
    assert.equal((await send('PATCH', '/passport/portfolio', token, { location: 'Takoradi', location_public: true })).status, 200);
    await clean('after a location edit');
    assert.equal((await send('PATCH', '/artists/me/status', token, { status: 'UNAVAILABLE' })).status, 200);
    const profile = await prisma.creativeProfile.findUniqueOrThrow({ where: { id: artistId }, include: { person: true } });
    assert.deepEqual(
      [profile.display_name, profile.bio, profile.city, profile.city_public, profile.availability, profile.person.display_name],
      ['KJ', 'New bio', 'Takoradi', true, 'UNAVAILABLE', 'Kojo Edited'],
    );
    await clean('after artist edits');
  });

  await t.test('a producer\'s edits reach their profile', async () => {
    const login = await send('POST', '/auth/signup', null, { email: email('producer-edit'), password, name: 'Ato Producer', role: 'PRODUCER' });
    assert.equal((await send('PATCH', '/producer/me', login.body.token, { alias: 'Ato Beats', bio: 'Afrobeats producer' })).status, 200);
    const profile = await prisma.creativeProfile.findUniqueOrThrow({ where: { id: login.body.user.producer.id } });
    assert.deepEqual([profile.display_name, profile.bio], ['Ato Beats', 'Afrobeats producer']);
    await clean('after producer edits');
  });

  await t.test('a professional who changes their disciplines holds the new ones at once', async () => {
    const held = async (userId: string) => (await prisma.personDiscipline.findMany({
      where: { person: { user_id: userId } }, orderBy: { discipline_code: 'asc' },
    })).map((d) => [d.discipline_code, d.is_primary]);
    const login = await send('POST', '/auth/signup', null, {
      email: email('disciplines'), password, name: 'Yaa Writer', role: 'PRODUCER', primary_discipline: 'SONGWRITER', disciplines: ['SONGWRITER', 'VOCALIST'],
    });
    assert.equal(login.status, 201);
    const userId = login.body.user.id as string;
    assert.deepEqual(await held(userId), [['SONGWRITER', true], ['VOCALIST', false]]);
    const changed = await send('PATCH', '/producer/me', login.body.token, { primary_discipline: 'PRODUCER', disciplines: ['PRODUCER', 'SONGWRITER'] });
    assert.equal(changed.status, 200);
    assert.deepEqual(await held(userId), [['PRODUCER', true], ['SONGWRITER', false]], 'VOCALIST dropped, PRODUCER added and primary');
    await clean('after a change of disciplines');
  });

  await t.test('a studio\'s listed engineers are listed, renamed and removed as identities', async () => {
    const owner = await send('POST', '/auth/signup', null, { email: email('owner'), password, name: 'Owner', role: 'STUDIO_ADMIN', studio_name: `Engineer Rooms ${runId}`, studio_timezone: 'Europe/London' });
    const token = owner.body.token as string;
    const listed = await send('POST', '/studio-setup/engineers', token, { name: 'Abena Listed' });
    assert.equal(listed.status, 201);
    const created = await prisma.creativeProfile.findUniqueOrThrow({ where: { id: listed.body.id }, include: { person: true } });
    assert.deepEqual([created.person.user_id, created.person.display_name], [null, 'Abena Listed']);
    assert.equal((await send('PATCH', `/studio-setup/engineers/${listed.body.id}`, token, { name: 'Abena Renamed' })).status, 200);
    const renamed = await prisma.creativeProfile.findUniqueOrThrow({ where: { id: listed.body.id }, include: { person: true } });
    assert.deepEqual([renamed.display_name, renamed.person.display_name], ['Abena Renamed', 'Abena Renamed']);
    await clean('after listing and renaming an engineer');
    assert.equal((await send('DELETE', `/studio-setup/engineers/${listed.body.id}`, token)).status, 200);
    assert.equal(await prisma.creativeProfile.count({ where: { id: listed.body.id } }), 0);
    assert.equal(await prisma.person.count({ where: { id: created.person_id } }), 0, 'an unclaimed identity with nothing left is removed');
    await clean('after removing an engineer');
  });

  await t.test('a change made behind the routes is reported, and the next run repairs it', async () => {
    const login = await send('POST', '/auth/signup', null, { email: email('drift'), password, name: 'Drift Artist', role: 'ARTIST' });
    const artistId = login.body.user.artist.id as string;
    await prisma.artist.update({ where: { id: artistId }, data: { bio: 'Written straight to the table' } });
    assert.ok((await identityParity(prisma)).mismatches.includes(`artist ${artistId}: bio differs`));
    const repaired = await mirrorIdentities({ legacyIds: [artistId] }, prisma);
    assert.equal(repaired.profilesUpdated, 1);
    await clean('after the repair');
  });
});
