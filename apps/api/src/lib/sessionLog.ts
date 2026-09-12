import { Prisma, type SessionLog } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from './prisma';

type Db = Prisma.TransactionClient | typeof prisma;

// The booking is the source of a session log's identity and start time. Every
// writer previously re-derived these by hand, and they had already drifted:
// the artist-review path omitted started_at entirely, so a log first created by
// a review lost the session's start — invisible today only because a session
// must be COMPLETED before it can be reviewed, which means another writer got
// there first. Ordering is not an invariant; deriving it in one place is.
export interface SessionLogBooking {
  id: string;
  artist_id: string;
  starts_at: Date;
}

// Only the fields a caller may legitimately set. booking_id, artist_id and
// started_at are deliberately absent: they belong to the booking, not to
// whoever happens to be writing.
export interface SessionLogFields {
  notes?: string | null;
  quality_rating?: number;
  artist_rating?: number;
  artist_testimonial?: string | null;
  testimonial_public?: boolean;
  ai_summary?: string;
  tracks_worked?: string[];
  ended_at?: Date;
}

// One owner for "a session log exists for this booking, carrying these fields".
// Six call sites used to hand-roll this upsert; the clock's copy passed
// `notes: { set }`, which replaces the column, and so destroyed the engineer's
// notes on every DAW ping. Routing every writer through here means identity and
// timing are always derived the same way, and a destructive note write is not
// something a caller can express by accident — see appendSessionLogNote.
export async function upsertSessionLog(
  booking: SessionLogBooking,
  fields: SessionLogFields = {},
  db: Db = prisma,
) {
  return db.sessionLog.upsert({
    where: { booking_id: booking.id },
    update: fields,
    create: {
      booking_id: booking.id,
      artist_id: booking.artist_id,
      started_at: booking.starts_at,
      ...fields,
    },
  });
}

// Adds a line to the running log without disturbing what is already there.
// Separate from upsertSessionLog because appending and replacing are different
// intentions, and the bug worth preventing is one being mistaken for the other.
export async function appendSessionLogNote(
  booking: SessionLogBooking,
  line: string,
  db: Db = prisma,
) {
  // Read/concatenate/write loses a line when two callers read the same notes.
  // ON CONFLICT locks the row and appends to its current value. Keep this in
  // the session domain, and use the caller's transaction when one is supplied.
  const [log] = await db.$queryRaw<SessionLog[]>`
    INSERT INTO session_logs (id, booking_id, artist_id, started_at, notes, tracks_worked, testimonial_public)
    VALUES (${randomUUID()}, ${booking.id}, ${booking.artist_id}, ${booking.starts_at.toISOString()}::timestamp, ${line}, ARRAY[]::text[], false)
    ON CONFLICT (booking_id) DO UPDATE SET notes =
      CASE WHEN session_logs.notes IS NULL OR session_logs.notes = '' THEN EXCLUDED.notes
           ELSE session_logs.notes || E'\n' || EXCLUDED.notes END
    RETURNING *
  `;
  return log;
}
