import assert from 'node:assert/strict';
import test from 'node:test';

// Canonical migration steps 1 and 2 (docs/OIANO_SCHEMA_REDESIGN.md §7): the backfill
// creates one Person per User and one CreativeProfile per Artist, Producer and Engineer
// under the same id, a second run changes nothing, and the parity check finds every
// legacy identity resolved. Runs over the whole integration database, so every other
// file's accounts are backfilled and verified too.
test('identity backfill: one person per login, one profile per legacy identity, idempotent', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);

  const [{ prisma }, { backfillIdentity, identityParity, handleBase }] = await Promise.all([
    import('../lib/prisma'), import('../lib/identity/backfill'),
  ]);
  t.after(() => prisma.$disconnect());

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = (label: string) => `${label}-${runId}@example.test`;
  const studio = await prisma.studio.create({ data: { slug: `identity-${runId}`, name: 'Identity Studio' } });

  const artist = await prisma.user.create({
    data: { email: email('artist'), role: 'ARTIST', artist: { create: {
      name: 'Ama Owusu', alias: 'Amaa', bio: 'Singer',
      passport: { create: { passport_code: `ID-${runId}`.toUpperCase(), location: 'Kumasi', location_public: false } },
    } } },
    include: { artist: true },
  });
  const both = await prisma.user.create({
    data: { email: email('both'), role: 'ARTIST', artist: { create: { name: 'Kwame Both' } }, producer: { create: { name: 'K. Both Productions', alias: 'KB Beats' } } },
    include: { artist: true, producer: true },
  });
  const operator = await prisma.user.create({ data: { email: email('operator'), role: 'STUDIO_ADMIN' } });
  const engineerLogin = await prisma.user.create({ data: { email: email('engineer'), role: 'ENGINEER' } });
  const linkedEngineer = await prisma.engineer.create({ data: { studio_id: studio.id, user_id: engineerLogin.id, name: 'Esi Linked', specialties: [] } });
  const listedEngineer = await prisma.engineer.create({ data: { studio_id: studio.id, name: 'Yaw Listed', specialties: [] } });
  const twinName = `Echo ${runId}`;
  const twins = await Promise.all([1, 2].map((n) => prisma.user.create({
    data: { email: email(`twin-${n}`), role: 'ARTIST', artist: { create: { name: twinName } } }, include: { artist: true },
  })));
  await prisma.weaveNode.create({ data: { id: artist.artist!.id, type: 'ARTIST' } });

  const first = await backfillIdentity(prisma);
  assert.ok(first.personsCreated > 0 && first.profilesCreated > 0);

  await t.test('every legacy identity resolves after one run', async () => {
    const parity = await identityParity(prisma);
    assert.deepEqual(parity.mismatches, []);
    assert.equal(parity.counts.persons, parity.counts.users + await prisma.engineer.count({ where: { user_id: null } }));
    assert.equal(parity.counts.profiles, parity.counts.artists + parity.counts.producers + parity.counts.engineers);
  });

  await t.test('a second run changes nothing', async () => {
    const snapshot = async () => ({
      persons: await prisma.person.findMany({ orderBy: { id: 'asc' } }),
      profiles: await prisma.creativeProfile.findMany({ orderBy: { id: 'asc' } }),
    });
    const before = await snapshot();
    assert.ok(Object.values(await backfillIdentity(prisma)).every((n) => n === 0), 'nothing created, updated or removed');
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('a profile reuses its legacy id and carries what the person chose', async () => {
    const profile = await prisma.creativeProfile.findUniqueOrThrow({ where: { id: artist.artist!.id }, include: { person: true } });
    assert.equal(profile.legacy_source, 'ARTIST');
    assert.equal(profile.person.user_id, artist.id);
    assert.equal(profile.person.display_name, 'Ama Owusu', 'the person is named from their record');
    assert.equal(profile.display_name, 'Amaa', 'the profile presents their stage name');
    assert.equal(profile.handle, handleBase('Amaa'));
    assert.deepEqual([profile.city, profile.city_public], ['Kumasi', false], 'an unpublished location stays private');
    assert.ok(await prisma.creativeProfile.findUnique({ where: { id: artist.artist!.id } }), 'the weave node id names the profile');
  });

  await t.test('one person holds both of an account\'s practices', async () => {
    const person = await prisma.person.findUniqueOrThrow({ where: { user_id: both.id }, include: { profiles: { orderBy: { legacy_source: 'asc' } } } });
    assert.deepEqual(person.profiles.map((p) => [p.id, p.legacy_source]), [[both.artist!.id, 'ARTIST'], [both.producer!.id, 'PRODUCER']]);
    assert.equal(person.display_name, 'Kwame Both', 'named from the artist record before the producer record');
    assert.equal(person.profiles[1].display_name, 'KB Beats');
  });

  await t.test('names come from records, never from an email address', async () => {
    const op = await prisma.person.findUniqueOrThrow({ where: { user_id: operator.id } });
    assert.equal(op.display_name, null, 'a studio operator with no record of a name gets none');
    const ours = await prisma.person.findMany({ where: { user: { email: { endsWith: `${runId}@example.test` } } } });
    assert.ok(ours.length >= 6);
    assert.ok(ours.every((p) => !p.display_name?.includes('@')));
  });

  await t.test('engineers: a login joins its person, a listed engineer is an unclaimed identity', async () => {
    const linked = await prisma.creativeProfile.findUniqueOrThrow({ where: { id: linkedEngineer.id }, include: { person: true } });
    assert.equal(linked.person.user_id, engineerLogin.id);
    const listed = await prisma.creativeProfile.findUniqueOrThrow({ where: { id: listedEngineer.id }, include: { person: true } });
    assert.equal(listed.person.user_id, null);
    assert.equal(listed.person.display_name, 'Yaw Listed');
  });

  await t.test('two people with one name get distinct handles', async () => {
    const handles = (await prisma.creativeProfile.findMany({ where: { id: { in: twins.map((u) => u.artist!.id) } }, select: { handle: true } })).map((p) => p.handle).sort();
    const base = handleBase(twinName);
    assert.deepEqual(handles, [base, `${base}-2`]);
  });

  await t.test('parity reports a legacy identity created after the backfill, and the next run resolves it', async () => {
    const late = await prisma.user.create({ data: { email: email('late'), role: 'PRODUCER', producer: { create: { name: 'Late Producer' } } }, include: { producer: true } });
    const parity = await identityParity(prisma);
    assert.ok(parity.mismatches.includes(`user ${late.id} has no person`));
    assert.ok(parity.mismatches.includes(`producer ${late.producer!.id} has no profile`));
    const repaired = await backfillIdentity(prisma);
    assert.deepEqual([repaired.personsCreated, repaired.profilesCreated, repaired.profilesUpdated], [1, 1, 0]);
    assert.deepEqual((await identityParity(prisma)).mismatches, []);
  });

  await t.test('an id found in two legacy tables stops the backfill before it writes', async () => {
    const intruderUser = await prisma.user.create({ data: { email: email('intruder'), role: 'PRODUCER' } });
    // Same id as an existing artist, in the producer table.
    await prisma.producer.create({ data: { id: twins[0].artist!.id, user_id: intruderUser.id, name: 'Collision' } });
    const personsBefore = await prisma.person.count();
    await assert.rejects(backfillIdentity(prisma), /aborted: id .* is both ARTIST and PRODUCER/);
    assert.equal(await prisma.person.count(), personsBefore, 'nothing was written');
    await prisma.producer.delete({ where: { id: twins[0].artist!.id } });
    await prisma.user.delete({ where: { id: intruderUser.id } });
  });
});
