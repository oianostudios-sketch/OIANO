import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// The owner runs prisma/readiness-report.ts against production, so: every count must
// be exactly what was seeded, nothing it prints may name anyone, and Postgres itself
// must refuse a write made inside its transaction. Other files share this database, so
// the counts are compared before and after this file's own rows are added.
test('the readiness report counts exactly, reveals no one, and cannot write', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);

  const [{ prisma }, report, { syncConnectionFromBooking }, { REPAIR_WINDOW_MS }] = await Promise.all([
    import('../lib/prisma'), import('../lib/readinessReport'), import('../lib/weave/sync'), import('../lib/weave/repair'),
  ]);
  t.after(() => prisma.$disconnect());

  const root = path.resolve(__dirname, '../../../..');
  const migrationNames = fs.readdirSync(path.join(root, 'prisma/migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const notApplied = '29990101000000_readiness_report_not_applied';
  const names = [...migrationNames.slice(1), notApplied];

  await t.test('its definitions match the repair window and the web discipline list', () => {
    assert.equal(report.WEAVE_REPAIR_WINDOW_DAYS * 86_400_000, REPAIR_WINDOW_MS);
    const web = fs.readFileSync(path.join(root, 'apps/web/src/lib/creativeDisciplines.ts'), 'utf8');
    const webCodes = [...web.matchAll(/\{\s*id:\s*'([A-Z_]+)'/g)].map((m) => m[1]);
    assert.ok(webCodes.length >= 12);
    assert.deepEqual([...report.KNOWN_DISCIPLINE_CODES].sort(), webCodes.sort());
  });

  const before = await report.collectReadinessReport(prisma, names);

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const seededText: string[] = [];
  const user = async (key: string, role: 'ARTIST' | 'PRODUCER' | 'ENGINEER' = 'ARTIST') => {
    const local = `ReadyRep${key}${runId.replace(/[^a-z0-9]/gi, '')}`;
    const email = `${local.toLowerCase()}@example.test`;
    seededText.push(email, local, local.toLowerCase());
    const created = await prisma.user.create({ data: { email, role } });
    seededText.push(created.id);
    return { ...created, local };
  };
  const named = (name: string) => { seededText.push(name); return name; };

  // 1. Names. One account's artist and producer both carry its email's local part (in
  // another case): two rows, one account. Alias only, placeholders, and a real name.
  const both = await user('Both');
  const artistEmailName = await prisma.artist.create({ data: { user_id: both.id, name: both.local.toUpperCase() } });
  const producerEmailName = await prisma.producer.create({ data: { user_id: both.id, name: both.local } });
  const aliased = await user('Alias');
  const artistAliased = await prisma.artist.create({ data: { user_id: aliased.id, name: named(`Readiness Alias Artist ${runId}`), alias: aliased.local } });
  const artistPlaceholder = await prisma.artist.create({ data: { user_id: (await user('PhA')).id, name: 'New artist' } });
  const producerPlaceholder = await prisma.producer.create({ data: { user_id: (await user('PhP', 'PRODUCER')).id, name: 'New creative professional' } });
  const plainArtist = await prisma.artist.create({ data: { user_id: (await user('Plain')).id, name: named(`Readiness Plain Artist ${runId}`) } });

  // 3. Disciplines (signup's defaults are PRODUCER / ["PRODUCER"], both known). One
  // unknown primary and an unknown list entry; one list that is not a list; one empty list.
  const odd = await prisma.producer.create({ data: {
    user_id: (await user('Odd', 'PRODUCER')).id, name: named(`Readiness Odd Producer ${runId}`),
    primary_discipline: 'READINESS_WIZARD', disciplines: ['PRODUCER', 'READINESS_WIZARD'],
  } });
  const notList = await prisma.producer.create({ data: {
    user_id: (await user('NotList', 'PRODUCER')).id, name: named(`Readiness NotList Producer ${runId}`), disciplines: { code: 'DJ' },
  } });
  const emptyList = await prisma.producer.create({ data: {
    user_id: (await user('Empty', 'PRODUCER')).id, name: named(`Readiness Empty Producer ${runId}`), primary_discipline: 'DJ', disciplines: [],
  } });
  // A producer whose id is also an artist's id: the identity backfill stops on it.
  const collision = await prisma.producer.create({ data: {
    id: plainArtist.id, user_id: (await user('Collide', 'PRODUCER')).id, name: named(`Readiness Collide Producer ${runId}`),
  } });

  const studio = await prisma.studio.create({ data: { slug: `readiness-${runId}`, name: named(`Readiness Studio ${runId}`) } });
  const engineerUser = await user('Eng', 'ENGINEER');
  await prisma.engineer.create({ data: { studio_id: studio.id, user_id: engineerUser.id, name: named(`Readiness Engineer ${runId}`) } });
  await prisma.engineer.create({ data: { studio_id: studio.id, name: named(`Readiness Freelancer ${runId}`) } });

  // 2. Weave. Two missed recently, one missed long ago, one synced, one pending.
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Readiness Room' } });
  const service = await prisma.serviceOffering.create({ data: {
    studio_id: studio.id, category: 'RECORDING', name: 'Readiness Session', min_price_usd: 50, max_price_usd: 50, unit: 'hour',
  } });
  const booking = (month: number, status: 'PENDING' | 'COMPLETED') => {
    const starts_at = new Date(Date.UTC(1972, month, 1, 12));
    return prisma.booking.create({ data: {
      studio_id: studio.id, artist_id: plainArtist.id, room_id: room.id, service_id: service.id,
      starts_at, ends_at: new Date(starts_at.getTime() + 3_600_000), total_usd: 50, status,
    } });
  };
  await booking(0, 'COMPLETED');
  await booking(1, 'COMPLETED');
  const old = await booking(2, 'COMPLETED');
  await prisma.$executeRaw`UPDATE bookings SET updated_at = now() - interval '30 days' WHERE id = ${old.id}`;
  const synced = await booking(3, 'COMPLETED');
  await syncConnectionFromBooking(synced.id);
  await booking(4, 'PENDING');

  // 4. Untyped references, written the ways the audit found them written.
  const project = await prisma.project.create({ data: { producer_id: producerEmailName.id, artist_id: plainArtist.id, title: named(`Readiness Project ${runId}`) } });
  const participant = (type: string, ref: string | null) => prisma.projectParticipant.create({ data: {
    project_id: project.id, display_name: named(`Readiness Participant ${type} ${runId}`), role: 'MUSICIAN',
    participant_type: type, participant_ref_id: ref, added_by: both.id,
  } });
  const claimed = await participant('OIANO_USER', aliased.id);
  await participant('PRODUCER', odd.id);
  await participant('EXTERNAL', null);
  await participant('READINESS_UNKNOWN_TYPE', `not-an-id-${runId}`);
  const credit = (participant_id: string | null) => prisma.projectCredit.create({ data: {
    project_id: project.id, credited_name: named(`Readiness Credit ${runId}`), role: 'MUSICIAN', participant_id, added_by: both.id,
  } });
  await credit(claimed.id);
  await credit(artistAliased.id);
  await credit(null);
  const agreement = await prisma.rightsAgreement.create({ data: { project_id: project.id, agreement_type: 'MASTER', title: 'Readiness Agreement', created_by: both.id } });
  const share = (holder_type: string, holder_ref_id: string | null) => prisma.rightsShare.create({ data: {
    agreement_id: agreement.id, holder_name: named(`Readiness Holder ${holder_type} ${runId}`), holder_type, holder_ref_id, role: 'Owner', percentage: 25,
  } });
  await share('ARTIST', aliased.id);
  await share('PRODUCER', producerEmailName.id);
  await share('COMPANY', null);
  await share('PARTICIPANT', collision.id);
  seededText.push(...[artistEmailName, producerEmailName, artistAliased, artistPlaceholder, producerPlaceholder, odd, notList, emptyList, project, claimed, studio].map((r) => r.id));

  const after = await report.collectReadinessReport(prisma, names);
  const text = report.formatReadinessReport(after);

  await t.test('names taken from an email are counted, once per account, and placeholders apart', () => {
    const delta = (k: 'artists' | 'producers') => Object.fromEntries(Object.entries(after.names[k]).map(([key, v]) => [key, v - (before.names[k] as any)[key]]));
    assert.deepEqual(delta('artists'), { total: 4, nameIsEmailLocalPart: 1, aliasIsEmailLocalPart: 1, either: 2, placeholder: 1 });
    assert.deepEqual(delta('producers'), { total: 6, nameIsEmailLocalPart: 1, aliasIsEmailLocalPart: 0, either: 1, placeholder: 1 });
    assert.equal(after.names.accountsWithEmailName - before.names.accountsWithEmailName, 2);
  });

  await t.test('completed bookings with no Weave evidence split at the repair window', () => {
    assert.equal(after.weave.evidenceTable, true);
    assert.equal(after.weave.completed - before.weave.completed, 4);
    assert.equal(after.weave.missing - before.weave.missing, 3);
    assert.equal(after.weave.missingRecent - before.weave.missingRecent, 2);
    assert.equal(after.weave.missingOlder - before.weave.missingOlder, 1);
  });

  await t.test('identity readiness counts every bucket', () => {
    const a = after.identity;
    const b = before.identity;
    assert.equal(a.users - b.users, 10);
    assert.equal((a.usersByRole.ARTIST ?? 0) - (b.usersByRole.ARTIST ?? 0), 4);
    assert.equal((a.usersByRole.PRODUCER ?? 0) - (b.usersByRole.PRODUCER ?? 0), 5);
    assert.equal((a.usersByRole.ENGINEER ?? 0) - (b.usersByRole.ENGINEER ?? 0), 1);
    assert.equal(a.artists - b.artists, 4);
    assert.equal(a.producers - b.producers, 6);
    assert.equal(a.engineersWithLogin - b.engineersWithLogin, 1);
    assert.equal(a.engineersWithoutLogin - b.engineersWithoutLogin, 1);
    assert.equal(a.usersWithArtistAndProducer - b.usersWithArtistAndProducer, 1);
    assert.equal(a.usersWithSeveralIdentityRows - b.usersWithSeveralIdentityRows, 1);
    assert.equal(a.idsInTwoLegacyTables - b.idsInTwoLegacyTables, 1);
    const pd = a.producerDisciplines!;
    const pb = b.producerDisciplines!;
    assert.deepEqual(
      { primaryUnknown: pd.primaryUnknown - pb.primaryUnknown, listNotArray: pd.listNotArray - pb.listNotArray, listWithUnknown: pd.listWithUnknown - pb.listWithUnknown, listWithNoKnown: pd.listWithNoKnown - pb.listWithNoKnown },
      { primaryUnknown: 1, listNotArray: 1, listWithUnknown: 1, listWithNoKnown: 2 },
    );
    assert.deepEqual(a.canonicalTables, { persons: false, creative_profiles: false, disciplines: false, person_disciplines: false });
  });

  await t.test('each untyped reference is classified by what it names', () => {
    const row = (column: string, group: string, r: typeof after) => r.references.find((x) => x.column === column && x.group === group)
      ?? { rows: 0, empty: 0, user: 0, artist: 0, producer: 0, participant: 0, several: 0, nothing: 0 };
    const delta = (column: string, group: string) => {
      const [x, y] = [row(column, group, after), row(column, group, before)];
      return { rows: x.rows - y.rows, empty: x.empty - y.empty, user: x.user - y.user, artist: x.artist - y.artist, producer: x.producer - y.producer, participant: x.participant - y.participant, several: x.several - y.several, nothing: x.nothing - y.nothing };
    };
    const zero = { rows: 0, empty: 0, user: 0, artist: 0, producer: 0, participant: 0, several: 0, nothing: 0 };
    assert.deepEqual(delta('rights_shares.holder_ref_id', 'ARTIST'), { ...zero, rows: 1, user: 1 });
    assert.deepEqual(delta('rights_shares.holder_ref_id', 'PRODUCER'), { ...zero, rows: 1, producer: 1 });
    assert.deepEqual(delta('rights_shares.holder_ref_id', 'COMPANY'), { ...zero, rows: 1, empty: 1 });
    assert.deepEqual(delta('rights_shares.holder_ref_id', 'PARTICIPANT'), { ...zero, rows: 1, artist: 1, producer: 1, several: 1 });
    assert.deepEqual(delta('project_credits.participant_id', 'all'), { ...zero, rows: 3, empty: 1, participant: 1, artist: 1 });
    assert.deepEqual(delta('project_participants.participant_ref_id', 'OIANO_USER'), { ...zero, rows: 1, user: 1 });
    assert.deepEqual(delta('project_participants.participant_ref_id', 'PRODUCER'), { ...zero, rows: 1, producer: 1 });
    assert.deepEqual(delta('project_participants.participant_ref_id', 'EXTERNAL'), { ...zero, rows: 1, empty: 1 });
    // A type outside the fixed list is printed as OTHER, never as itself.
    assert.deepEqual(delta('project_participants.participant_ref_id', 'OTHER'), { ...zero, rows: 1, nothing: 1 });
    assert.doesNotMatch(text, /READINESS_UNKNOWN_TYPE|READINESS_WIZARD/);
  });

  await t.test('migrations not applied are listed by name', () => {
    assert.deepEqual(after.migrations, { table: true, pending: [notApplied], unfinished: [], appliedNotInRepository: 1 });
    assert.match(text, new RegExp(notApplied));
  });

  await t.test('the printed report names no one', () => {
    assert.ok(seededText.length > 30);
    const lower = text.toLowerCase();
    for (const value of seededText) assert.ok(!lower.includes(value.toLowerCase()), `report contains seeded value ${value}`);
    assert.doesNotMatch(text, /@/);
    assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  await t.test('a write inside the report transaction is refused by Postgres', async () => {
    const email = `readiness-write-${runId}@example.test`;
    await assert.rejects(
      report.withReadOnlyTransaction(prisma, (tx) => tx.$executeRaw`INSERT INTO users (id, email) VALUES (${`readiness-write-${runId}`}, ${email})`),
      /read-only transaction/,
    );
    await assert.rejects(
      report.withReadOnlyTransaction(prisma, (tx) => tx.user.create({ data: { email } })),
      /read-only transaction/,
    );
    assert.equal(await prisma.user.count({ where: { email } }), 0);
  });

  await t.test('the command refuses to run without DATABASE_URL and never prints the password', () => {
    const run = (env: NodeJS.ProcessEnv) => spawnSync(process.execPath, [
      '-r', 'ts-node/register/transpile-only', '-r', 'tsconfig-paths/register', path.join(root, 'prisma/readiness-report.ts'),
    ], { cwd: path.join(root, 'apps/api'), env, encoding: 'utf8', timeout: 120_000 });
    const { DATABASE_URL: _omit, ...withoutUrl } = process.env;
    const refused = run(withoutUrl);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /DATABASE_URL is not set, so nothing was run/);
    assert.doesNotMatch(refused.stdout, /readiness report/i);

    const withPassword = new URL(process.env.DATABASE_URL!);
    withPassword.password = `readiness-secret-${runId}`;
    // Against the test database itself, with a password local trust auth ignores.
    const ran = run({ ...process.env, DATABASE_URL: withPassword.toString() });
    const output = ran.stdout + ran.stderr;
    assert.doesNotMatch(output, new RegExp(`readiness-secret-${runId}`));
    assert.match(ran.stdout, new RegExp(`read-only\\) for ${withPassword.hostname}`));
    if (ran.status === 0) assert.match(ran.stdout, /End of report/);
  });
});
