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
  // A professional who chose their disciplines, one of them not on the reference list.
  const photographer = await prisma.user.create({
    data: { email: email('photographer'), role: 'PRODUCER', producer: { create: {
      name: 'Adwoa Lens', primary_discipline: 'PHOTOGRAPHER', disciplines: ['VIDEOGRAPHER', 'PHOTOGRAPHER', 'Drone pilot'],
    } } },
  });
  const operator = await prisma.user.create({ data: { email: email('operator'), role: 'STUDIO_ADMIN' } });
  const engineerLogin = await prisma.user.create({ data: { email: email('engineer'), role: 'ENGINEER' } });
  const linkedEngineer = await prisma.engineer.create({ data: { studio_id: studio.id, user_id: engineerLogin.id, name: 'Esi Linked', specialties: [] } });
  const listedEngineer = await prisma.engineer.create({ data: { studio_id: studio.id, name: 'Yaw Listed', specialties: [] } });
  const twinName = `Echo ${runId}`;
  const twins = await Promise.all([1, 2].map((n) => prisma.user.create({
    data: { email: email(`twin-${n}`), role: 'ARTIST', artist: { create: { name: twinName } } }, include: { artist: true },
  })));
  // Signed up without a name: the account carries a placeholder, which names no person.
  const unnamed = await prisma.user.create({
    data: { email: email('unnamed'), role: 'ARTIST', artist: { create: { name: 'New artist' } } },
  });
  const unnamedArtistNamedProducer = await prisma.user.create({
    data: { email: email('half-named'), role: 'ARTIST', artist: { create: { name: 'New artist' } }, producer: { create: { name: 'Adjoa Beats' } } },
  });
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
      disciplines: await prisma.personDiscipline.findMany({ orderBy: [{ person_id: 'asc' }, { discipline_code: 'asc' }] }),
    });
    const before = await snapshot();
    assert.ok(before.disciplines.length > 0);
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

  const held = async (userId: string) => (await prisma.personDiscipline.findMany({
    where: { person: { user_id: userId } }, orderBy: { discipline_code: 'asc' },
  })).map((d) => [d.discipline_code, d.is_primary]);

  await t.test('one person, several disciplines: an artist and producer account holds both', async () => {
    assert.deepEqual(await held(both.id), [['ARTIST', true], ['PRODUCER', false]], 'primarily an artist, named from that record');
    assert.deepEqual(await held(artist.id), [['ARTIST', true]]);
  });

  await t.test('a professional holds the disciplines they chose, known ones only', async () => {
    assert.deepEqual(await held(photographer.id), [['PHOTOGRAPHER', true], ['VIDEOGRAPHER', false]], 'their chosen primary leads; no PRODUCER they never chose');
    assert.deepEqual(await held(operator.id), [], 'a studio operator declares none');
    const engineers = await prisma.personDiscipline.findMany({ where: { person: { profiles: { some: { id: { in: [linkedEngineer.id, listedEngineer.id] } } } } } });
    assert.deepEqual(engineers.map((d) => [d.discipline_code, d.is_primary]), [['ENGINEER', true], ['ENGINEER', true]]);
  });

  await t.test('the reference list carries every discipline a professional can choose', async () => {
    const codes = (await prisma.discipline.findMany({ select: { code: true } })).map((d) => d.code).sort();
    assert.deepEqual(codes, [
      'ARTIST', 'COMPOSER', 'CREATIVE_DIRECTOR', 'DJ', 'ENGINEER', 'MASTERING_ENGINEER', 'MIX_ENGINEER',
      'MUSICIAN', 'PHOTOGRAPHER', 'PRODUCER', 'RECORDING_ENGINEER', 'SONGWRITER', 'VIDEOGRAPHER', 'VOCALIST',
    ]);
  });

  await t.test('parity reports a discipline missing, extra or wrongly primary, and the next run repairs each', async () => {
    const person = await prisma.person.findUniqueOrThrow({ where: { user_id: both.id } });
    await prisma.personDiscipline.delete({ where: { person_id_discipline_code: { person_id: person.id, discipline_code: 'PRODUCER' } } });
    await prisma.personDiscipline.create({ data: { person_id: person.id, discipline_code: 'DJ' } });
    await prisma.personDiscipline.update({ where: { person_id_discipline_code: { person_id: person.id, discipline_code: 'ARTIST' } }, data: { is_primary: false } });
    const { mismatches } = await identityParity(prisma);
    assert.ok(mismatches.includes(`person ${person.id} is missing discipline PRODUCER`));
    assert.ok(mismatches.includes(`person ${person.id} holds discipline DJ that no record declares`));
    assert.ok(mismatches.includes(`person ${person.id}: ARTIST is not primary, unlike their records`));
    const repaired = await backfillIdentity(prisma);
    assert.deepEqual([repaired.disciplinesCreated, repaired.disciplinesUpdated, repaired.disciplinesRemoved], [1, 1, 1]);
    assert.deepEqual(await held(both.id), [['ARTIST', true], ['PRODUCER', false]]);
    assert.deepEqual((await identityParity(prisma)).mismatches, []);
  });

  await t.test('names come from records, never from an email address', async () => {
    const op = await prisma.person.findUniqueOrThrow({ where: { user_id: operator.id } });
    assert.equal(op.display_name, null, 'a studio operator with no record of a name gets none');
    const ours = await prisma.person.findMany({ where: { user: { email: { endsWith: `${runId}@example.test` } } } });
    assert.ok(ours.length >= 6);
    assert.ok(ours.every((p) => !p.display_name?.includes('@')));
  });

  await t.test('a signup placeholder names no one', async () => {
    const none = await prisma.person.findUniqueOrThrow({ where: { user_id: unnamed.id } });
    assert.equal(none.display_name, null, '"New artist" is not a name the person chose');
    const half = await prisma.person.findUniqueOrThrow({ where: { user_id: unnamedArtistNamedProducer.id } });
    assert.equal(half.display_name, 'Adjoa Beats', 'the next record with a real name names the person');
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
