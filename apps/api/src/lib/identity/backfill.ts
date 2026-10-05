// apps/api/src/lib/identity/backfill.ts
//
// Canonical migration steps 1 and 2 (docs/OIANO_SCHEMA_REDESIGN.md §7): one Person per
// User, and one CreativeProfile per Artist, Producer and Engineer row, reusing that
// row's id so every existing reference to it already names the profile.
//
// Until writers move to the canonical tables, the legacy rows are the source of truth
// and Person and CreativeProfile mirror them. mirrorIdentities() brings the canonical
// rows for some identities into line with their legacy rows: it creates what is missing,
// updates fields that differ, and removes profiles whose legacy row is gone. Every route
// that writes a legacy identity calls it afterwards (dual-write), and backfillIdentity()
// runs it over everything. A second run changes nothing.
//
// identityParity() is the verification: it lists every legacy identity whose canonical
// rows are missing or differ. Zero mismatches is the condition for moving readers.
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';

type Source = 'ARTIST' | 'PRODUCER' | 'ENGINEER';

export interface IdentityMirrorResult {
  personsCreated: number;
  personsUpdated: number;
  personsRemoved: number;
  profilesCreated: number;
  profilesUpdated: number;
  profilesRemoved: number;
}
export type IdentityBackfillResult = IdentityMirrorResult;

export interface IdentityParity {
  mismatches: string[];
  counts: { users: number; persons: number; artists: number; producers: number; engineers: number; profiles: number };
}

// A handle is a public slug, derived from the name the person chose, never from an email
// address, and made unique with a numeric suffix.
export function handleBase(name: string): string {
  const slug = name
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40).replace(/-+$/g, '');
  return slug || 'creative';
}

// The fields a profile mirrors from its legacy row. The handle is not among them: it is
// chosen once and kept, because it is a public address.
const MIRRORED = ['display_name', 'bio', 'avatar_url', 'city', 'city_public', 'availability', 'open_to_work'] as const;
type Mirrored = { [K in (typeof MIRRORED)[number]]: K extends 'city_public' | 'open_to_work' ? boolean : K extends 'availability' ? 'AVAILABLE' | 'UNAVAILABLE' : K extends 'display_name' ? string : string | null };

type LegacyIdentity = Mirrored & { id: string; source: Source; user_id: string | null; name: string; created_at: Date | null };

type Scope = { userIds?: string[]; legacyIds?: string[] } | 'all';

async function loadLegacy(db: PrismaClient, scope: Scope): Promise<LegacyIdentity[]> {
  const where = (field: 'user_id') => scope === 'all' ? {} : {
    OR: [
      ...(scope.userIds?.length ? [{ [field]: { in: scope.userIds } }] : []),
      ...(scope.legacyIds?.length ? [{ id: { in: scope.legacyIds } }] : []),
    ],
  };
  const none = scope !== 'all' && !scope.userIds?.length && !scope.legacyIds?.length;
  if (none) return [];
  const [artists, producers, engineers] = await Promise.all([
    db.artist.findMany({ where: where('user_id'), select: { id: true, user_id: true, name: true, alias: true, bio: true, avatar_url: true, status: true, created_at: true, passport: { select: { location: true, location_public: true } } } }),
    db.producer.findMany({ where: where('user_id'), select: { id: true, user_id: true, name: true, alias: true, bio: true, avatar_url: true, location: true, open_to_collabs: true, created_at: true } }),
    db.engineer.findMany({ where: where('user_id'), select: { id: true, user_id: true, name: true, bio: true, avatar_url: true } }),
  ]);
  const rows: LegacyIdentity[] = [
    ...artists.map((a) => ({
      id: a.id, source: 'ARTIST' as const, user_id: a.user_id, name: a.name, display_name: a.alias || a.name,
      bio: a.bio, avatar_url: a.avatar_url,
      // Location stays private unless the artist published it, as it is today.
      city: a.passport?.location ?? null, city_public: Boolean(a.passport?.location && a.passport.location_public),
      // Being in a session is derived from the session itself in the target, not declared.
      availability: a.status === 'UNAVAILABLE' ? 'UNAVAILABLE' as const : 'AVAILABLE' as const,
      open_to_work: a.status !== 'UNAVAILABLE', created_at: a.created_at,
    })),
    ...producers.map((p) => ({
      id: p.id, source: 'PRODUCER' as const, user_id: p.user_id, name: p.name, display_name: p.alias || p.name,
      bio: p.bio, avatar_url: p.avatar_url,
      // A producer's location has no publication flag today, so it is kept private.
      city: p.location ?? null, city_public: false,
      availability: 'AVAILABLE' as const, open_to_work: p.open_to_collabs, created_at: p.created_at,
    })),
    ...engineers.map((e) => ({
      id: e.id, source: 'ENGINEER' as const, user_id: e.user_id, name: e.name, display_name: e.name,
      bio: e.bio, avatar_url: e.avatar_url, city: null, city_public: false,
      availability: 'AVAILABLE' as const, open_to_work: true, created_at: null,
    })),
  ];
  // Stable order, so names and handles come out the same however the database returns rows.
  const rank: Record<Source, number> = { ARTIST: 0, PRODUCER: 1, ENGINEER: 2 };
  return rows.sort((a, b) => rank[a.source] - rank[b.source]
    || (a.created_at?.getTime() ?? 0) - (b.created_at?.getTime() ?? 0)
    || a.id.localeCompare(b.id));
}

// A user's person is named from their artist, producer or engineer record in that order.
function personNames(rows: LegacyIdentity[]) {
  const names = new Map<string, string>();
  for (const row of rows) if (row.user_id && !names.has(row.user_id)) names.set(row.user_id, row.name);
  return names;
}

function mirrored(row: LegacyIdentity): Mirrored {
  return Object.fromEntries(MIRRORED.map((field) => [field, row[field]])) as Mirrored;
}

function differs(current: Record<string, unknown>, wanted: Record<string, unknown>) {
  return Object.keys(wanted).some((key) => current[key] !== wanted[key]);
}

function assertDistinctIds(rows: LegacyIdentity[]) {
  // Ids are reused, so one id in two legacy tables would make two rows claim one profile.
  // UUIDs make that practically impossible; the mirror still refuses it before writing.
  const seen = new Map<string, Source>();
  for (const row of rows) {
    const other = seen.get(row.id);
    if (other) throw new Error(`Identity backfill aborted: id ${row.id} is both ${other} and ${row.source}`);
    seen.set(row.id, row.source);
  }
}

async function freeHandle(db: PrismaClient, name: string, taken?: Set<string>): Promise<string> {
  const base = handleBase(name);
  const used = taken ?? new Set((await db.creativeProfile.findMany({ where: { handle: { startsWith: base } }, select: { handle: true } })).map((p) => p.handle));
  let handle = base;
  for (let n = 2; used.has(handle); n += 1) handle = `${base}-${n}`;
  used.add(handle);
  return handle;
}

export async function mirrorIdentities(scope: Scope, db: PrismaClient = prisma): Promise<IdentityMirrorResult> {
  const result: IdentityMirrorResult = { personsCreated: 0, personsUpdated: 0, personsRemoved: 0, profilesCreated: 0, profilesUpdated: 0, profilesRemoved: 0 };
  const legacy = await loadLegacy(db, scope);
  assertDistinctIds(legacy);

  const userIds = scope === 'all'
    ? (await db.user.findMany({ select: { id: true } })).map((u) => u.id)
    : [...new Set([...(scope.userIds ?? []), ...legacy.flatMap((row) => row.user_id ? [row.user_id] : [])])];
  const existingUsers = new Set((await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true } })).map((u) => u.id));
  const legacyIds = legacy.map((row) => row.id);
  const [persons, profiles] = await Promise.all([
    db.person.findMany({ where: scope === 'all' ? {} : { user_id: { in: userIds } }, select: { id: true, user_id: true, display_name: true } }),
    db.creativeProfile.findMany({
      where: scope === 'all' ? {} : { OR: [{ id: { in: [...legacyIds, ...(scope.legacyIds ?? [])] } }, { person: { user_id: { in: userIds } } }] },
      select: { id: true, person_id: true, legacy_source: true, handle: true, display_name: true, bio: true, avatar_url: true, city: true, city_public: true, availability: true, open_to_work: true, person: { select: { id: true, user_id: true, display_name: true } } },
    }),
  ]);
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  for (const row of legacy) {
    const existing = profileById.get(row.id);
    if (existing && existing.legacy_source !== row.source) {
      throw new Error(`Identity backfill aborted: profile ${row.id} mirrors ${existing.legacy_source}, not ${row.source}`);
    }
  }
  const taken = scope === 'all' ? new Set(profiles.map((p) => p.handle)) : undefined;

  // People who sign in: one Person each, named from their records, never their email.
  const names = personNames(legacy);
  const personByUser = new Map(persons.filter((p) => p.user_id).map((p) => [p.user_id!, p]));
  for (const userId of userIds) {
    if (!existingUsers.has(userId)) continue;
    const name = names.get(userId) ?? null;
    const person = personByUser.get(userId);
    if (!person) {
      const created = await db.person.create({ data: { user_id: userId, display_name: name }, select: { id: true, user_id: true, display_name: true } });
      personByUser.set(userId, created);
      result.personsCreated += 1;
    } else if (person.display_name !== name) {
      await db.person.update({ where: { id: person.id }, data: { display_name: name } });
      result.personsUpdated += 1;
    }
  }

  for (const row of legacy) {
    const wanted = mirrored(row);
    const existing = profileById.get(row.id);
    const personId = row.user_id ? personByUser.get(row.user_id)!.id : (existing?.person_id ?? row.id);
    if (!existing) {
      if (!row.user_id) {
        // An engineer a studio lists without a login: an identity nobody has claimed yet.
        await db.person.upsert({ where: { id: row.id }, create: { id: row.id, display_name: row.name }, update: {} });
        result.personsCreated += 1;
      }
      await createProfile(db, { ...wanted, id: row.id, legacy_source: row.source, person_id: personId }, row.display_name, taken);
      result.profilesCreated += 1;
      continue;
    }
    const patch: Record<string, unknown> = differs(existing as any, wanted) ? { ...wanted } : {};
    // A listed engineer who is later linked to a login moves to that login's person.
    if (existing.person_id !== personId) patch.person_id = personId;
    if (Object.keys(patch).length) {
      await db.creativeProfile.update({ where: { id: row.id }, data: patch });
      result.profilesUpdated += 1;
    }
    if (!row.user_id && existing.person.display_name !== row.name) {
      await db.person.update({ where: { id: existing.person_id }, data: { display_name: row.name } });
      result.personsUpdated += 1;
    }
  }

  // Profiles whose legacy row is gone, as when a studio removes a listed engineer or an
  // artist account with no history is deleted, go too, while legacy is the truth.
  const present = new Set(legacyIds);
  const gone = profiles.filter((p) => p.legacy_source && !present.has(p.id)
    && (scope === 'all' || scope.legacyIds?.includes(p.id) || (p.person.user_id && userIds.includes(p.person.user_id))));
  for (const profile of gone) {
    await db.creativeProfile.delete({ where: { id: profile.id } });
    result.profilesRemoved += 1;
    // A person nobody signs in as and who has no profile left is no one's identity.
    const left = await db.person.findUnique({ where: { id: profile.person_id }, select: { user_id: true, _count: { select: { profiles: true } } } });
    if (left && !left.user_id && left._count.profiles === 0) {
      await db.person.delete({ where: { id: profile.person_id } });
      result.personsRemoved += 1;
    }
  }
  return result;
}

async function createProfile(db: PrismaClient, data: Omit<Prisma.CreativeProfileUncheckedCreateInput, 'handle'>, name: string, taken?: Set<string>) {
  // Two people with one name signing up at the same moment can pick the same handle; the
  // loser picks again.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await db.creativeProfile.create({ data: { ...data, handle: await freeHandle(db, name, attempt === 0 ? taken : undefined) } });
      return;
    } catch (error) {
      const handleTaken = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
        && String((error.meta as any)?.target ?? '').includes('handle');
      if (!handleTaken || attempt >= 3) throw error;
    }
  }
}

export function backfillIdentity(db: PrismaClient = prisma): Promise<IdentityBackfillResult> {
  return mirrorIdentities('all', db);
}

// For the routes that write a legacy identity. The legacy write has already happened and
// is the truth, so a failed mirror must not fail the request: it is logged, the parity
// check reports the drift, and the next backfill run repairs it.
export async function keepIdentityInStep(scope: { userIds?: string[]; legacyIds?: string[] }): Promise<void> {
  try {
    await mirrorIdentities(scope);
  } catch (error: any) {
    console.error('[identity] mirror failed; run prisma/backfill-identity.ts to repair:', error?.message);
  }
}

export async function identityParity(db: PrismaClient = prisma): Promise<IdentityParity> {
  const [users, persons, legacy, profiles, artistNodes] = await Promise.all([
    db.user.findMany({ select: { id: true } }),
    db.person.findMany({ select: { id: true, user_id: true, display_name: true } }),
    loadLegacy(db, 'all'),
    db.creativeProfile.findMany({ select: { id: true, legacy_source: true, display_name: true, bio: true, avatar_url: true, city: true, city_public: true, availability: true, open_to_work: true, person: { select: { user_id: true } } } }),
    db.weaveNode.findMany({ where: { type: 'ARTIST' }, select: { id: true } }),
  ]);
  const mismatches: string[] = [];
  const names = personNames(legacy);
  const personByUser = new Map(persons.filter((p) => p.user_id).map((p) => [p.user_id!, p]));
  for (const user of users) {
    const person = personByUser.get(user.id);
    if (!person) mismatches.push(`user ${user.id} has no person`);
    else if (person.display_name !== (names.get(user.id) ?? null)) mismatches.push(`user ${user.id}: person is named differently from their record`);
  }

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  for (const row of legacy) {
    const label = `${row.source.toLowerCase()} ${row.id}`;
    const profile = profileById.get(row.id);
    if (!profile) { mismatches.push(`${label} has no profile`); continue; }
    if (profile.legacy_source !== row.source) mismatches.push(`${label}: profile mirrors ${profile.legacy_source}`);
    if (profile.person.user_id !== row.user_id) mismatches.push(`${label}: profile belongs to another person`);
    const wanted = mirrored(row);
    for (const field of MIRRORED) if ((profile as any)[field] !== wanted[field]) mismatches.push(`${label}: ${field} differs`);
  }
  for (const node of artistNodes) if (!profileById.has(node.id)) mismatches.push(`weave node ${node.id} names no profile`);
  const legacyIds = new Set(legacy.map((row) => row.id));
  for (const profile of profiles) if (profile.legacy_source && !legacyIds.has(profile.id)) mismatches.push(`profile ${profile.id} mirrors a ${profile.legacy_source.toLowerCase()} that no longer exists`);

  return {
    mismatches,
    counts: {
      users: users.length, persons: persons.length, profiles: profiles.length,
      artists: legacy.filter((r) => r.source === 'ARTIST').length,
      producers: legacy.filter((r) => r.source === 'PRODUCER').length,
      engineers: legacy.filter((r) => r.source === 'ENGINEER').length,
    },
  };
}
