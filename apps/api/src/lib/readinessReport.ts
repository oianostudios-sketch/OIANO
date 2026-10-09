// apps/api/src/lib/readinessReport.ts
//
// Counts the owner needs from production before deciding on the name repair, the
// Weave backfill, the identity migration (#16, #39) and the untyped references (audit
// C13). The owner runs it with prisma/readiness-report.ts against a database we never
// see, so it is built to be safe to point anywhere:
//
// - Every query runs inside one transaction started READ ONLY. Postgres itself then
//   refuses any write, whatever a query here says.
// - It prints counts only, never a name, email, id or other row content. The only
//   strings it prints are fixed labels, migration folder names, and values from fixed
//   enums (user roles).
// - A table that a pending migration would add is reported as absent, not queried, so
//   one missing table does not abort the transaction and with it the whole report.
//
// It does not import ../prisma: that module loads .env over an exported DATABASE_URL,
// which would point the report somewhere other than where the owner aimed it.
import type { Prisma, PrismaClient } from '@prisma/client';
import { SIGNUP_PLACEHOLDER_NAMES } from '@oiano/shared';

type Tx = Prisma.TransactionClient;

// The same window as the scheduled Weave repair (REPAIR_WINDOW_MS in
// lib/weave/repair.ts, which this cannot import: it loads ../prisma). The integration
// test holds the two equal.
export const WEAVE_REPAIR_WINDOW_DAYS = 7;

// The discipline codes the web app offers (apps/web/src/lib/creativeDisciplines.ts),
// which signup accepts and the identity migration (#39) recognises. The integration
// test holds this list equal to the web file's.
export const KNOWN_DISCIPLINE_CODES = [
  'PRODUCER', 'RECORDING_ENGINEER', 'MIX_ENGINEER', 'MASTERING_ENGINEER',
  'SONGWRITER', 'COMPOSER', 'MUSICIAN', 'VOCALIST', 'DJ',
  'CREATIVE_DIRECTOR', 'PHOTOGRAPHER', 'VIDEOGRAPHER',
] as const;

// Runs `fn` in a transaction Postgres will not let write. SET TRANSACTION must be the
// first statement, and it is checked rather than trusted before anything else runs.
export async function withReadOnlyTransaction<T>(db: PrismaClient, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const [{ transaction_read_only }] = await tx.$queryRawUnsafe<Array<{ transaction_read_only: string }>>('SHOW transaction_read_only');
    if (transaction_read_only !== 'on') throw new Error('The transaction did not become read-only; nothing was run.');
    // One slow count must not hold a production connection indefinitely.
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '120s'`);
    return fn(tx);
  }, { maxWait: 30_000, timeout: 15 * 60_000 });
}

export interface ReportTable {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  notes?: string[];
}

export interface ReadinessReport {
  names: {
    artists: NameCounts;
    producers: NameCounts;
    accountsWithEmailName: number;
  };
  weave: { evidenceTable: boolean; completed: number; missing: number; missingRecent: number; missingOlder: number };
  identity: {
    users: number;
    usersByRole: Record<string, number>;
    artists: number;
    producers: number;
    engineersWithLogin: number;
    engineersWithoutLogin: number;
    usersWithArtistAndProducer: number;
    usersWithSeveralIdentityRows: number;
    idsInTwoLegacyTables: number;
    canonicalTables: Record<string, boolean>;
    // null when the producer discipline columns are absent.
    producerDisciplines: {
      primaryUnknown: number;
      listNotArray: number;
      listWithUnknown: number;
      listWithNoKnown: number;
    } | null;
  };
  references: Array<ReferenceCounts & { column: string; group: string }>;
  migrations: {
    table: boolean;
    pending: string[];
    unfinished: string[];
    appliedNotInRepository: number;
  };
}

interface NameCounts { total: number; nameIsEmailLocalPart: number; aliasIsEmailLocalPart: number; either: number; placeholder: number }
interface ReferenceCounts { rows: number; empty: number; user: number; artist: number; producer: number; participant: number; several: number; nothing: number }

const n = (value: unknown) => Number(value ?? 0);

async function tableExists(tx: Tx, table: string) {
  const [{ present }] = await tx.$queryRaw<Array<{ present: boolean }>>`SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS present`;
  return present;
}

async function columnExists(tx: Tx, table: string, column: string) {
  const [{ present }] = await tx.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
    ) AS present`;
  return present;
}

// Compared inside the database, so no email address leaves it. Signup before PR #32
// stored email.split('@')[0] as the name when none was given.
async function nameCounts(tx: Tx, table: 'artists' | 'producers'): Promise<NameCounts> {
  const placeholders = Object.values(SIGNUP_PLACEHOLDER_NAMES);
  const [row] = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE lower(r.name) = lower(split_part(u.email, '@', 1)))::int AS name_match,
      count(*) FILTER (WHERE lower(r.alias) = lower(split_part(u.email, '@', 1)))::int AS alias_match,
      count(*) FILTER (WHERE lower(r.name) = lower(split_part(u.email, '@', 1))
                          OR lower(r.alias) = lower(split_part(u.email, '@', 1)))::int AS either,
      count(*) FILTER (WHERE btrim(r.name) = ANY($1::text[]))::int AS placeholder
    FROM ${table} r JOIN users u ON u.id = r.user_id`, placeholders);
  return {
    total: n(row.total), nameIsEmailLocalPart: n(row.name_match), aliasIsEmailLocalPart: n(row.alias_match),
    either: n(row.either), placeholder: n(row.placeholder),
  };
}

const REFERENCE_COLUMNS: Array<{ table: string; column: string; groupBy?: { column: string; known: string[] } }> = [
  { table: 'rights_shares', column: 'holder_ref_id', groupBy: { column: 'holder_type', known: ['ARTIST', 'PRODUCER', 'PARTICIPANT', 'COMPANY'] } },
  { table: 'project_credits', column: 'participant_id' },
  { table: 'project_participants', column: 'participant_ref_id', groupBy: { column: 'participant_type', known: ['OIANO_USER', 'INVITED', 'EXTERNAL', 'ARTIST', 'PRODUCER'] } },
];

// What each stored value names: a user, an artist, a producer, a project participant,
// more than one of those, or nothing. Group values outside the fixed list are OTHER, so
// no free text is printed. Identifiers here are constants, never input.
async function referenceCounts(tx: Tx) {
  const out: ReadinessReport['references'] = [];
  for (const { table, column, groupBy } of REFERENCE_COLUMNS) {
    const label = `${table}.${column}`;
    if (!(await columnExists(tx, table, column)) || (groupBy && !(await columnExists(tx, table, groupBy.column)))) {
      out.push({ column: label, group: 'column absent', rows: 0, empty: 0, user: 0, artist: 0, producer: 0, participant: 0, several: 0, nothing: 0 });
      continue;
    }
    const known = groupBy ? groupBy.known.map((value) => `'${value}'`).join(', ') : '';
    const group = groupBy ? `CASE WHEN t.${groupBy.column} IN (${known}) THEN t.${groupBy.column} ELSE 'OTHER' END` : `'all'`;
    const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT grp,
        count(*)::int AS rows,
        count(*) FILTER (WHERE ref IS NULL)::int AS empty,
        count(*) FILTER (WHERE is_user)::int AS "user",
        count(*) FILTER (WHERE is_artist)::int AS artist,
        count(*) FILTER (WHERE is_producer)::int AS producer,
        count(*) FILTER (WHERE is_participant)::int AS participant,
        count(*) FILTER (WHERE is_user::int + is_artist::int + is_producer::int + is_participant::int > 1)::int AS several,
        count(*) FILTER (WHERE ref IS NOT NULL AND NOT (is_user OR is_artist OR is_producer OR is_participant))::int AS nothing
      FROM (
        SELECT ${group} AS grp, t.${column} AS ref,
          EXISTS (SELECT 1 FROM users x WHERE x.id = t.${column}) AS is_user,
          EXISTS (SELECT 1 FROM artists x WHERE x.id = t.${column}) AS is_artist,
          EXISTS (SELECT 1 FROM producers x WHERE x.id = t.${column}) AS is_producer,
          EXISTS (SELECT 1 FROM project_participants x WHERE x.id = t.${column}) AS is_participant
        FROM ${table} t
      ) s
      GROUP BY grp ORDER BY grp`);
    if (rows.length === 0) out.push({ column: label, group: groupBy ? '(no rows)' : 'all', rows: 0, empty: 0, user: 0, artist: 0, producer: 0, participant: 0, several: 0, nothing: 0 });
    for (const r of rows) {
      out.push({
        column: label, group: String(r.grp), rows: n(r.rows), empty: n(r.empty), user: n(r.user), artist: n(r.artist),
        producer: n(r.producer), participant: n(r.participant), several: n(r.several), nothing: n(r.nothing),
      });
    }
  }
  return out;
}

// `migrationNames` are the folders in prisma/migrations. Applied means finished and
// not rolled back, as `prisma migrate deploy` judges it.
async function migrationCounts(tx: Tx, migrationNames: string[]): Promise<ReadinessReport['migrations']> {
  if (!(await tableExists(tx, '_prisma_migrations'))) {
    return { table: false, pending: [...migrationNames].sort(), unfinished: [], appliedNotInRepository: 0 };
  }
  const rows = await tx.$queryRawUnsafe<Array<{ migration_name: string; applied: boolean }>>(`
    SELECT migration_name, bool_or(finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied
    FROM _prisma_migrations GROUP BY migration_name`);
  const applied = new Set(rows.filter((r) => r.applied).map((r) => r.migration_name));
  const local = new Set(migrationNames);
  return {
    table: true,
    pending: migrationNames.filter((name) => !applied.has(name)).sort(),
    // Names only from the repository's own list, so nothing the database holds is printed.
    unfinished: rows.filter((r) => !r.applied && local.has(r.migration_name)).map((r) => r.migration_name).sort(),
    appliedNotInRepository: [...applied].filter((name) => !local.has(name)).length,
  };
}

export async function collectReadinessReport(db: PrismaClient, migrationNames: string[]): Promise<ReadinessReport> {
  return withReadOnlyTransaction(db, async (tx) => {
    // 1. Public names derived from email.
    const artists = await nameCounts(tx, 'artists');
    const producers = await nameCounts(tx, 'producers');
    const [{ accounts }] = await tx.$queryRawUnsafe<Array<{ accounts: number }>>(`
      SELECT count(*)::int AS accounts FROM users u
      WHERE EXISTS (SELECT 1 FROM artists r WHERE r.user_id = u.id
                    AND (lower(r.name) = lower(split_part(u.email, '@', 1)) OR lower(r.alias) = lower(split_part(u.email, '@', 1))))
         OR EXISTS (SELECT 1 FROM producers r WHERE r.user_id = u.id
                    AND (lower(r.name) = lower(split_part(u.email, '@', 1)) OR lower(r.alias) = lower(split_part(u.email, '@', 1))))`);

    // 2. Completed bookings with no Weave evidence, split at the scheduled repair's
    // window. As lib/weave/repair.ts: COMPLETED status, measured on updated_at.
    const evidenceTable = await tableExists(tx, 'weave_connection_evidence');
    const [weave] = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(evidenceTable ? `
      SELECT count(*)::int AS completed,
        count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM weave_connection_evidence e WHERE e.booking_id = b.id))::int AS missing,
        count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM weave_connection_evidence e WHERE e.booking_id = b.id)
                          AND b.updated_at >= now() - make_interval(days => ${WEAVE_REPAIR_WINDOW_DAYS}))::int AS recent
      FROM bookings b WHERE b.status = 'COMPLETED'` : `
      SELECT count(*)::int AS completed, count(*)::int AS missing,
        count(*) FILTER (WHERE b.updated_at >= now() - make_interval(days => ${WEAVE_REPAIR_WINDOW_DAYS}))::int AS recent
      FROM bookings b WHERE b.status = 'COMPLETED'`);

    // 3. Identity readiness, from the legacy tables the backfill reads.
    const [identity] = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        (SELECT count(*) FROM users)::int AS users,
        (SELECT count(*) FROM artists)::int AS artists,
        (SELECT count(*) FROM producers)::int AS producers,
        (SELECT count(*) FROM engineers WHERE user_id IS NOT NULL)::int AS engineers_login,
        (SELECT count(*) FROM engineers WHERE user_id IS NULL)::int AS engineers_no_login,
        (SELECT count(*) FROM users u WHERE EXISTS (SELECT 1 FROM artists a WHERE a.user_id = u.id)
                                        AND EXISTS (SELECT 1 FROM producers p WHERE p.user_id = u.id))::int AS artist_and_producer,
        (SELECT count(*) FROM users u WHERE
            (EXISTS (SELECT 1 FROM artists a WHERE a.user_id = u.id))::int
          + (EXISTS (SELECT 1 FROM producers p WHERE p.user_id = u.id))::int
          + (EXISTS (SELECT 1 FROM engineers e WHERE e.user_id = u.id))::int > 1)::int AS several_rows,
        (SELECT count(*) FROM (
          SELECT id FROM (SELECT id FROM artists UNION ALL SELECT id FROM producers UNION ALL SELECT id FROM engineers) ids
          GROUP BY id HAVING count(*) > 1) collisions)::int AS collisions`);
    const roles = await tx.$queryRawUnsafe<Array<{ role: string; count: number }>>(
      `SELECT role::text AS role, count(*)::int AS count FROM users GROUP BY role ORDER BY role`);
    const canonicalTables: Record<string, boolean> = {};
    for (const table of ['persons', 'creative_profiles', 'disciplines', 'person_disciplines']) {
      canonicalTables[table] = await tableExists(tx, table);
    }
    // A producer's chosen disciplines, against the known codes; counts of producers.
    const disciplineColumns = (await columnExists(tx, 'producers', 'primary_discipline')) && (await columnExists(tx, 'producers', 'disciplines'));
    const [disciplines] = !disciplineColumns ? [null] : await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        count(*) FILTER (WHERE primary_discipline IS NULL OR NOT (primary_discipline = ANY($1::text[])))::int AS primary_unknown,
        count(*) FILTER (WHERE jsonb_typeof(disciplines::jsonb) IS DISTINCT FROM 'array')::int AS not_array,
        count(*) FILTER (WHERE jsonb_typeof(disciplines::jsonb) = 'array' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(disciplines::jsonb) d
          WHERE jsonb_typeof(d) <> 'string' OR NOT ((d #>> '{}') = ANY($1::text[]))))::int AS with_unknown,
        count(*) FILTER (WHERE NOT (jsonb_typeof(disciplines::jsonb) = 'array' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(disciplines::jsonb) d
          WHERE jsonb_typeof(d) = 'string' AND (d #>> '{}') = ANY($1::text[]))))::int AS no_known
      FROM producers`, [...KNOWN_DISCIPLINE_CODES]);

    // 4 and 5.
    const references = await referenceCounts(tx);
    const migrations = await migrationCounts(tx, migrationNames);

    return {
      names: { artists, producers, accountsWithEmailName: n(accounts) },
      weave: {
        evidenceTable,
        completed: n(weave.completed),
        missing: n(weave.missing),
        missingRecent: n(weave.recent),
        missingOlder: n(weave.missing) - n(weave.recent),
      },
      identity: {
        users: n(identity.users),
        usersByRole: Object.fromEntries(roles.map((r) => [r.role, n(r.count)])),
        artists: n(identity.artists),
        producers: n(identity.producers),
        engineersWithLogin: n(identity.engineers_login),
        engineersWithoutLogin: n(identity.engineers_no_login),
        usersWithArtistAndProducer: n(identity.artist_and_producer),
        usersWithSeveralIdentityRows: n(identity.several_rows),
        idsInTwoLegacyTables: n(identity.collisions),
        canonicalTables,
        producerDisciplines: disciplines && {
          primaryUnknown: n(disciplines.primary_unknown),
          listNotArray: n(disciplines.not_array),
          listWithUnknown: n(disciplines.with_unknown),
          listWithNoKnown: n(disciplines.no_known),
        },
      },
      references,
      migrations,
    };
  });
}

export function readinessTables(report: ReadinessReport): ReportTable[] {
  const { names, weave, identity, references, migrations } = report;
  const nameRow = (label: string, c: NameCounts) => [label, c.total, c.nameIsEmailLocalPart, c.aliasIsEmailLocalPart, c.either, c.placeholder];
  return [
    {
      title: '1. Public names taken from the email address (signup before PR #32)',
      headers: ['record', 'total', 'name = email local part', 'alias = email local part', 'either', 'signup placeholder'],
      rows: [nameRow('artists', names.artists), nameRow('producers', names.producers)],
      notes: [
        `Accounts with an artist or producer name or alias equal to their email's local part: ${names.accountsWithEmailName}`,
        'Compared case-insensitively inside the database; no email was read out.',
      ],
    },
    {
      title: '2. Completed bookings with no Weave evidence',
      headers: ['measure', 'count'],
      rows: [
        ['completed bookings', weave.completed],
        ['with no Weave evidence', weave.missing],
        [`  completed in the last ${WEAVE_REPAIR_WINDOW_DAYS} days (scheduled repair covers)`, weave.missingRecent],
        [`  older (backfill decision)`, weave.missingOlder],
      ],
      notes: [
        ...(weave.evidenceTable ? [] : ['weave_connection_evidence is absent, so every completed booking counts as missing.']),
        'Completed = status COMPLETED; the window is measured on updated_at, as the repair does.',
      ],
    },
    {
      title: '3. Identity readiness (PRs #16 and #39)',
      headers: ['measure', 'count'],
      rows: [
        ['users', identity.users],
        ...Object.entries(identity.usersByRole).map(([role, count]): [string, number] => [`  role ${role}`, count]),
        ['artists', identity.artists],
        ['producers', identity.producers],
        ['engineers with a login', identity.engineersWithLogin],
        ['engineers without a login', identity.engineersWithoutLogin],
        ['users with both an artist and a producer row', identity.usersWithArtistAndProducer],
        ['users with more than one artist/producer/engineer row', identity.usersWithSeveralIdentityRows],
        ['ids found in two legacy identity tables (backfill stops)', identity.idsInTwoLegacyTables],
        ...(identity.producerDisciplines ? [
          ['producers whose primary discipline is not a known code', identity.producerDisciplines.primaryUnknown],
          ['producers whose discipline list is not a list', identity.producerDisciplines.listNotArray],
          ['producers with an unknown value in their discipline list', identity.producerDisciplines.listWithUnknown],
          ['producers with no known code in their discipline list', identity.producerDisciplines.listWithNoKnown],
        ] : [['producer discipline columns', 'absent']]) as Array<[string, string | number]>,
        ...Object.entries(identity.canonicalTables).map(([table, present]): [string, string] => [`table ${table}`, present ? 'present' : 'absent']),
      ],
    },
    {
      title: '4. Untyped references (audit C13): what each stored value names',
      headers: ['column', 'kind', 'rows', 'empty', 'user', 'artist', 'producer', 'participant', 'several', 'nothing'],
      rows: references.map((r) => [r.column, r.group, r.rows, r.empty, r.user, r.artist, r.producer, r.participant, r.several, r.nothing]),
      notes: ['"several" values also appear under each table they match; "nothing" matches none.'],
    },
    {
      title: '5. Migrations in the repository not applied to this database',
      headers: ['migration'],
      rows: migrations.pending.length ? migrations.pending.map((name) => [name]) : [['(none)']],
      notes: [
        ...(migrations.table ? [] : ['There is no _prisma_migrations table, so every migration is listed.']),
        ...migrations.unfinished.map((name) => `Started but not finished or rolled back: ${name}`),
        `Applied migrations not in this checkout: ${migrations.appliedNotInRepository}`,
      ],
    },
  ];
}

export function formatTable(table: ReportTable): string {
  const cells = [table.headers, ...table.rows.map((row) => row.map(String))];
  const widths = table.headers.map((_, i) => Math.max(...cells.map((row) => (row[i] ?? '').length)));
  const line = (row: string[]) => row.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join(' | ').trimEnd();
  return [
    table.title,
    line(cells[0]),
    widths.map((w) => '-'.repeat(w)).join('-+-'),
    ...cells.slice(1).map(line),
    ...(table.notes ?? []).map((note) => `  ${note}`),
  ].join('\n');
}

export function formatReadinessReport(report: ReadinessReport): string {
  return readinessTables(report).map(formatTable).join('\n\n');
}
