// apps/api/src/lib/identity/backfill.ts
//
// Canonical migration steps 1 and 2 (docs/OIANO_SCHEMA_REDESIGN.md §7): one Person per
// User, and one CreativeProfile per Artist, Producer and Engineer row, reusing that
// row's id so every existing reference to it already names the profile.
//
// The backfill only creates what is missing and never rewrites a row it finds, so a
// second run changes nothing and anything written to the canonical tables later is never
// overwritten from legacy. Run it on its own: two runs at once can collide on a handle,
// which fails one of them and is fixed by running again.
//
// identityParity() is the verification: it lists every legacy identity that does not
// resolve to its canonical row. Zero mismatches is the condition for moving readers.
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';

type Client = PrismaClient | Prisma.TransactionClient;
type Source = 'ARTIST' | 'PRODUCER' | 'ENGINEER';

export interface IdentityBackfillResult {
  personsCreated: number;
  profilesCreated: number;
}

export interface IdentityParity {
  mismatches: string[];
  counts: { users: number; persons: number; artists: number; producers: number; engineers: number; profiles: number };
}

// A handle is a public slug. It is derived from the name the person chose, never from an
// email address, and made unique with a numeric suffix.
export function handleBase(name: string): string {
  const slug = name
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40).replace(/-+$/g, '');
  return slug || 'creative';
}

function uniqueHandle(name: string, taken: Set<string>): string {
  const base = handleBase(name);
  let handle = base;
  for (let n = 2; taken.has(handle); n += 1) handle = `${base}-${n}`;
  taken.add(handle);
  return handle;
}

type LegacyIdentity = {
  id: string;
  source: Source;
  user_id: string | null;
  name: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  city: string | null;
  city_public: boolean;
  availability: 'AVAILABLE' | 'UNAVAILABLE';
  open_to_work: boolean;
  created_at: Date | null;
};

async function loadLegacy(db: Client): Promise<LegacyIdentity[]> {
  const [artists, producers, engineers] = await Promise.all([
    db.artist.findMany({ select: { id: true, user_id: true, name: true, alias: true, bio: true, avatar_url: true, status: true, created_at: true, passport: { select: { location: true, location_public: true } } } }),
    db.producer.findMany({ select: { id: true, user_id: true, name: true, alias: true, bio: true, avatar_url: true, location: true, open_to_collabs: true, created_at: true } }),
    db.engineer.findMany({ select: { id: true, user_id: true, name: true, bio: true, avatar_url: true } }),
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
  // Stable order, so handles come out the same however the database returns rows.
  const rank: Record<Source, number> = { ARTIST: 0, PRODUCER: 1, ENGINEER: 2 };
  return rows.sort((a, b) => rank[a.source] - rank[b.source]
    || (a.created_at?.getTime() ?? 0) - (b.created_at?.getTime() ?? 0)
    || a.id.localeCompare(b.id));
}

export async function backfillIdentity(db: PrismaClient = prisma): Promise<IdentityBackfillResult> {
  const legacy = await loadLegacy(db);

  // Ids are reused, so one id appearing in two legacy tables would make two rows claim
  // one profile. UUIDs make that practically impossible; the backfill still refuses it.
  const seen = new Map<string, Source>();
  for (const row of legacy) {
    const other = seen.get(row.id);
    if (other) throw new Error(`Identity backfill aborted: id ${row.id} is both ${other} and ${row.source}`);
    seen.set(row.id, row.source);
  }

  const [users, persons, profiles] = await Promise.all([
    db.user.findMany({ select: { id: true } }),
    db.person.findMany({ select: { id: true, user_id: true } }),
    db.creativeProfile.findMany({ select: { id: true, legacy_source: true, handle: true } }),
  ]);
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  for (const row of legacy) {
    const existing = profileById.get(row.id);
    if (existing && existing.legacy_source !== row.source) {
      throw new Error(`Identity backfill aborted: profile ${row.id} mirrors ${existing.legacy_source}, not ${row.source}`);
    }
  }
  const personByUser = new Map(persons.filter((p) => p.user_id).map((p) => [p.user_id!, p.id]));
  const handles = new Set(profiles.map((p) => p.handle));
  let personsCreated = 0;
  let profilesCreated = 0;

  // One Person per User, named from the user's artist, producer or engineer record in that
  // order (legacy is sorted that way), never from the email address.
  const nameByUser = new Map<string, string>();
  for (const row of legacy) if (row.user_id && !nameByUser.has(row.user_id)) nameByUser.set(row.user_id, row.name);
  for (const user of users) {
    if (personByUser.has(user.id)) continue;
    const person = await db.person.create({ data: { user_id: user.id, display_name: nameByUser.get(user.id) ?? null }, select: { id: true } });
    personByUser.set(user.id, person.id);
    personsCreated += 1;
  }

  for (const row of legacy) {
    if (profileById.has(row.id)) continue;
    const profile = {
      id: row.id, legacy_source: row.source, handle: uniqueHandle(row.display_name, handles), display_name: row.display_name,
      bio: row.bio, avatar_url: row.avatar_url, city: row.city, city_public: row.city_public,
      availability: row.availability, open_to_work: row.open_to_work,
    };
    if (row.user_id) {
      await db.creativeProfile.create({ data: { ...profile, person_id: personByUser.get(row.user_id)! } });
    } else {
      // An engineer a studio lists without a login: an identity nobody has claimed yet.
      await db.$transaction([
        db.person.create({ data: { id: row.id, display_name: row.name } }),
        db.creativeProfile.create({ data: { ...profile, person_id: row.id } }),
      ]);
      personsCreated += 1;
    }
    profilesCreated += 1;
  }

  return { personsCreated, profilesCreated };
}

export async function identityParity(db: Client = prisma): Promise<IdentityParity> {
  const [users, persons, artists, producers, engineers, profiles, artistNodes] = await Promise.all([
    db.user.findMany({ select: { id: true } }),
    db.person.findMany({ select: { id: true, user_id: true } }),
    db.artist.findMany({ select: { id: true, user_id: true } }),
    db.producer.findMany({ select: { id: true, user_id: true } }),
    db.engineer.findMany({ select: { id: true, user_id: true } }),
    db.creativeProfile.findMany({ select: { id: true, legacy_source: true, person: { select: { user_id: true } } } }),
    db.weaveNode.findMany({ where: { type: 'ARTIST' }, select: { id: true } }),
  ]);
  const mismatches: string[] = [];
  const personUsers = new Set(persons.map((p) => p.user_id).filter(Boolean));
  for (const user of users) if (!personUsers.has(user.id)) mismatches.push(`user ${user.id} has no person`);

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const check = (rows: { id: string; user_id: string | null }[], source: Source) => {
    for (const row of rows) {
      const profile = profileById.get(row.id);
      if (!profile) { mismatches.push(`${source.toLowerCase()} ${row.id} has no profile`); continue; }
      if (profile.legacy_source !== source) mismatches.push(`${source.toLowerCase()} ${row.id}: profile mirrors ${profile.legacy_source}`);
      if (profile.person.user_id !== row.user_id) mismatches.push(`${source.toLowerCase()} ${row.id}: profile belongs to another person`);
    }
  };
  check(artists, 'ARTIST');
  check(producers, 'PRODUCER');
  check(engineers.map((e) => ({ id: e.id, user_id: e.user_id })), 'ENGINEER');
  for (const node of artistNodes) if (!profileById.has(node.id)) mismatches.push(`weave node ${node.id} names no profile`);

  // A profile whose legacy row is gone, as when an artist account with no history is
  // deleted, is reported rather than removed: deciding that is for the writer move.
  const legacyIds = new Set([...artists, ...producers, ...engineers].map((row) => row.id));
  for (const profile of profiles) if (profile.legacy_source && !legacyIds.has(profile.id)) mismatches.push(`profile ${profile.id} mirrors a ${profile.legacy_source.toLowerCase()} that no longer exists`);

  return {
    mismatches,
    counts: { users: users.length, persons: persons.length, artists: artists.length, producers: producers.length, engineers: engineers.length, profiles: profiles.length },
  };
}
