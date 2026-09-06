// What counts as work a creator has actually done.
//
// The passport is the accumulated proof of work performed through OIANO, so the
// only bookings that may contribute to it are the ones that happened. Three call
// sites in passport.routes.ts each decided this for themselves and disagreed:
// recalculatePortfolioScore() included every booking with no filter at all, so a
// CANCELLED or NO_SHOW session raised profile_strength, while the public passport
// and the portfolio view counted CONFIRMED and IN_PROGRESS — publishing a session
// booked for next month as one already delivered, together with its hours.
//
// Two consequences, both fixed by having one definition. Publicly, the passport
// overstated verified work, which is the one thing this product must never do.
// Internally, profile_strength was non-deterministic: the same artist scored
// differently depending on which endpoint last recalculated it.
export const PERFORMED_SESSION_WHERE = { status: 'COMPLETED' as const };

interface PerformedSession {
  starts_at: Date;
  ends_at: Date;
}

// Sessions and studio hours, derived only from work that happened. Negative
// spans are clamped rather than trusted — a booking whose end precedes its start
// is bad data, and bad data must not subtract from a creator's record.
export function summariseVerifiedWork(bookings: PerformedSession[] = []) {
  const hours = bookings.reduce(
    (sum, booking) => sum + Math.max(0, booking.ends_at.getTime() - booking.starts_at.getTime()) / 3_600_000,
    0,
  );
  return { sessions: bookings.length, hours: Math.round(hours) };
}
