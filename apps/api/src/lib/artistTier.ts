// apps/api/src/lib/artistTier.ts
// Rough -> Cut -> Precious -> Traded -> Diamond. Every artist starts Rough
// (no mark shown — showing a glyph for everyone would be noise, not signal).
// Diamond is never computed; it's the aspirational direction, not a state
// any account actually reaches. Quiet by design: this returns a tier, never
// a rank or a count — there is no "you are #7" anywhere in this system.
import { prisma } from './prisma';

export type ArtistTier = 'CUT' | 'PRECIOUS' | 'TRADED';

const PRECIOUS_MIN_RATING = 4.5;
const PRECIOUS_MIN_SESSIONS = 10;
const PRECIOUS_MIN_ENGINEERS = 3;
const TRADED_MIN_RECENT_CONNECTIONS = 2;
const TRADED_WINDOW_DAYS = 30;

function tierFromAggregates(params: {
  profileStrength: number;
  completedEngineerIds: (string | null)[];
  ratings: number[];
  recentInitiatorIds: string[];
}): ArtistTier | null {
  const { profileStrength, completedEngineerIds, ratings, recentInitiatorIds } = params;

  if (profileStrength <= 60 || completedEngineerIds.length === 0) return null;

  const distinctEngineers = new Set(completedEngineerIds.filter((id): id is string => !!id));
  const avgRating = ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : 0;

  const isPrecious = avgRating >= PRECIOUS_MIN_RATING
    && ratings.length >= PRECIOUS_MIN_SESSIONS
    && distinctEngineers.size >= PRECIOUS_MIN_ENGINEERS;

  if (!isPrecious) return 'CUT';

  const distinctInitiators = new Set(recentInitiatorIds);
  return distinctInitiators.size >= TRADED_MIN_RECENT_CONNECTIONS ? 'TRADED' : 'PRECIOUS';
}

/**
 * Batched — 4 queries total regardless of how many artist IDs are passed, so
 * a roster of 20 doesn't fire 20x the round trips (and exhaust the Prisma
 * connection pool, which is exactly what calling computeArtistTier in a
 * Promise.all per-artist did before this was batched).
 */
export async function computeArtistTiers(artistIds: string[]): Promise<Record<string, ArtistTier | null>> {
  if (artistIds.length === 0) return {};

  const [artists, bookings, sessionLogs, connections] = await Promise.all([
    prisma.artist.findMany({
      where: { id: { in: artistIds } },
      select: { id: true, passport: { select: { profile_strength: true } } },
    }),
    prisma.booking.findMany({
      where: { artist_id: { in: artistIds }, status: 'COMPLETED' },
      select: { artist_id: true, engineer_id: true },
    }),
    prisma.sessionLog.findMany({
      where: { artist_id: { in: artistIds }, artist_rating: { not: null } },
      select: { artist_id: true, artist_rating: true },
    }),
    prisma.passportConnection.findMany({
      where: {
        recipient_id: { in: artistIds },
        created_at: { gte: new Date(Date.now() - TRADED_WINDOW_DAYS * 24 * 60 * 60 * 1000) },
      },
      select: { recipient_id: true, initiator_id: true },
    }),
  ]);

  const profileStrengthById = new Map(artists.map((a) => [a.id, a.passport?.profile_strength ?? 0]));
  const bookingsById = new Map<string, (string | null)[]>();
  for (const b of bookings) {
    if (!bookingsById.has(b.artist_id)) bookingsById.set(b.artist_id, []);
    bookingsById.get(b.artist_id)!.push(b.engineer_id);
  }
  const ratingsById = new Map<string, number[]>();
  for (const s of sessionLogs) {
    if (s.artist_rating == null) continue;
    if (!ratingsById.has(s.artist_id)) ratingsById.set(s.artist_id, []);
    ratingsById.get(s.artist_id)!.push(s.artist_rating);
  }
  const initiatorsById = new Map<string, string[]>();
  for (const c of connections) {
    if (!initiatorsById.has(c.recipient_id)) initiatorsById.set(c.recipient_id, []);
    initiatorsById.get(c.recipient_id)!.push(c.initiator_id);
  }

  const result: Record<string, ArtistTier | null> = {};
  for (const id of artistIds) {
    result[id] = tierFromAggregates({
      profileStrength: profileStrengthById.get(id) ?? 0,
      completedEngineerIds: bookingsById.get(id) ?? [],
      ratings: ratingsById.get(id) ?? [],
      recentInitiatorIds: initiatorsById.get(id) ?? [],
    });
  }
  return result;
}

/** Single-artist convenience wrapper — still just 4 queries, not 4-per-call-site. */
export async function computeArtistTier(artistId: string): Promise<ArtistTier | null> {
  const result = await computeArtistTiers([artistId]);
  return result[artistId] ?? null;
}
