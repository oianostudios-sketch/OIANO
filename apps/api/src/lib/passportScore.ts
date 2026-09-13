// apps/api/src/lib/passportScore.ts
// An artist passport's completeness score and the breakdown the artist reads.
//
// The score is what its breakdown adds up to. They used to be two calculations
// kept side by side, and they had drifted: a delivered project still marked
// active counted as both active and delivered in the stored score, but only as
// delivered in the breakdown (A06). Completeness says nothing about the quality
// of anyone's work; the canonical Passport replaces this stored number with a
// projection computed on read.

interface ScoredPassport {
  location?: string | null;
  passport_code?: string | null;
  collaboration_interests?: string[] | null;
  social_links?: unknown;
  creative_dna?: unknown;
}

export interface ScoredArtist {
  name?: string | null;
  alias?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  status?: string | null;
  passport?: ScoredPassport | null;
  releases?: unknown[] | null;
  projects?: Array<{ is_active: boolean; phase: string }> | null;
  bookings?: Array<{ starts_at: Date | string; ends_at: Date | string }> | null;
}

export interface ScorePart {
  label: string;
  max: number;
  earned: number;
}

function sizeOf(value: unknown): number {
  return typeof value === 'string' || Array.isArray(value) ? value.length : 0;
}

function points(present: unknown, weight: number): number {
  return present ? weight : 0;
}

export function portfolioBreakdown(artist: ScoredArtist): ScorePart[] {
  const passport: ScoredPassport = artist.passport ?? {};
  const dna = (passport.creative_dna && typeof passport.creative_dna === 'object' ? passport.creative_dna : {}) as Record<string, unknown>;
  const links = passport.social_links && typeof passport.social_links === 'object' ? Object.keys(passport.social_links).length : 0;
  const releases = artist.releases?.length ?? 0;
  const projects = artist.projects ?? [];
  const active = projects.some((project) => project.is_active && project.phase !== 'DELIVERED');
  const delivered = projects.some((project) => project.phase === 'DELIVERED');
  const bookings = artist.bookings ?? [];
  const hours = bookings.reduce((sum, booking) =>
    sum + Math.max(0, new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / 3_600_000, 0);
  return [
    { label: 'Core identity', max: 20, earned: points(artist.name, 3) + points(artist.alias, 3) + points(artist.avatar_url, 5) + points(artist.bio, 5) + points(passport.location, 2) + points(artist.status, 2) },
    { label: 'Creative identity', max: 18, earned: points(sizeOf(dna.genres), 4) + points(dna.vocal_type, 3) + points(dna.energy_profile, 2) + points(sizeOf(dna.key_themes), 2) + points(sizeOf(dna.influences), 2) + points(sizeOf(dna.languages), 2) + points(passport.collaboration_interests?.length, 3) },
    { label: 'Social & streaming', max: 10, earned: Math.min(10, links * 2) },
    { label: 'Released work', max: 20, earned: releases ? 8 + Math.min(12, Math.max(0, releases - 1) * 4) : 0 },
    { label: 'Projects', max: 13, earned: points(active, 8) + points(delivered, 5) },
    { label: 'Verified OIANO activity', max: 12, earned: points(bookings.length, 5) + points(hours, 3) + 1 + points(passport.passport_code, 3) },
    { label: 'Professional tools', max: 7, earned: 7 },
  ];
}

export function portfolioScore(artist: ScoredArtist): number {
  return Math.min(100, portfolioBreakdown(artist).reduce((sum, part) => sum + part.earned, 0));
}
