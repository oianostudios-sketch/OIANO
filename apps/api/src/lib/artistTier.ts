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
const TRADED_MIN_RECENT_STUDIOS = 2;
const TRADED_WINDOW_DAYS = 30;

function tierFromAggregates(params: {
  completedEngineerIds: (string | null)[];
  ratings: number[];
  recentStudioIds: string[];
}): ArtistTier | null {
  const { completedEngineerIds, ratings, recentStudioIds } = params;

  if (completedEngineerIds.length === 0) return null;

  const distinctEngineers = new Set(completedEngineerIds.filter((id): id is string => !!id));
  const avgRating = ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : 0;

  const isPrecious = avgRating >= PRECIOUS_MIN_RATING
    && ratings.length >= PRECIOUS_MIN_SESSIONS
    && distinctEngineers.size >= PRECIOUS_MIN_ENGINEERS;

  if (!isPrecious) return 'CUT';

  return new Set(recentStudioIds).size >= TRADED_MIN_RECENT_STUDIOS ? 'TRADED' : 'PRECIOUS';
}

/**
 * Batched — 3 queries total regardless of how many artist IDs are passed, so
 * a roster of 20 doesn't fire 20x the round trips (and exhaust the Prisma
 * connection pool, which is exactly what calling computeArtistTier in a
 * Promise.all per-artist did before this was batched).
 *
 * Standing counts only what someone else confirmed about the artist's work
 * (A07): completed sessions, the ratings engineers gave them, and the studios
 * the Weave records the artist working at. Nothing the artist declares about
 * themselves counts — not their profile's completeness, and not the message
 * requests they accept, which are contacts, not work (C18, C19).
 */
export async function computeArtistTiers(artistIds: string[]): Promise<Record<string, ArtistTier | null>> {
  if (artistIds.length === 0) return {};

  const windowStart = new Date(Date.now() - TRADED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [bookings, sessionLogs, recentWork] = await Promise.all([
    prisma.booking.findMany({
      where: { artist_id: { in: artistIds }, status: 'COMPLETED' },
      select: { artist_id: true, engineer_id: true },
    }),
    // The engineer's rating of the session. artist_rating is the artist's rating
    // of the engineer, which says nothing about the artist.
    prisma.sessionLog.findMany({
      where: { artist_id: { in: artistIds }, quality_rating: { not: null } },
      select: { artist_id: true, quality_rating: true },
    }),
    // Recent work read from the Weave's evidence, dated by when each session
    // started. The connection's own last_activity_at is a stored projection that
    // can lag until its next sync (A08), so the evidence is read instead.
    prisma.weaveEvidence.findMany({
      where: {
        connection: { source_node_id: { in: artistIds }, type: 'RECORDED_AT' },
        booking: { status: 'COMPLETED', starts_at: { gte: windowStart } },
      },
      select: { connection: { select: { source_node_id: true, target_node_id: true } } },
    }),
  ]);

  const bookingsById = new Map<string, (string | null)[]>();
  for (const b of bookings) {
    if (!bookingsById.has(b.artist_id)) bookingsById.set(b.artist_id, []);
    bookingsById.get(b.artist_id)!.push(b.engineer_id);
  }
  const ratingsById = new Map<string, number[]>();
  for (const s of sessionLogs) {
    if (s.quality_rating == null) continue;
    if (!ratingsById.has(s.artist_id)) ratingsById.set(s.artist_id, []);
    ratingsById.get(s.artist_id)!.push(s.quality_rating);
  }
  const studiosById = new Map<string, string[]>();
  for (const { connection } of recentWork) {
    if (!studiosById.has(connection.source_node_id)) studiosById.set(connection.source_node_id, []);
    studiosById.get(connection.source_node_id)!.push(connection.target_node_id);
  }

  const result: Record<string, ArtistTier | null> = {};
  for (const id of artistIds) {
    result[id] = tierFromAggregates({
      completedEngineerIds: bookingsById.get(id) ?? [],
      ratings: ratingsById.get(id) ?? [],
      recentStudioIds: studiosById.get(id) ?? [],
    });
  }
  return result;
}

/** Single-artist convenience wrapper — still just 3 queries, not 3-per-call-site. */
export async function computeArtistTier(artistId: string): Promise<ArtistTier | null> {
  const result = await computeArtistTiers([artistId]);
  return result[artistId] ?? null;
}
