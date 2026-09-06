-- Widen the activity event's subject beyond Artist.
--
-- The subject was an Artist FK and nothing else, so an event about a studio, a
-- producer or a payout had nowhere to go and was simply never emitted. Studio
-- registration, the platform fee and payouts all record nothing today.
--
-- Additive: artist_id stays, existing rows keep working, and every existing
-- emitter continues to compile unchanged.
ALTER TABLE "activity_events"
  ADD COLUMN "subject_type" TEXT NOT NULL DEFAULT 'ARTIST',
  ADD COLUMN "subject_id"   TEXT,
  ADD COLUMN "actor_id"     TEXT,
  ADD COLUMN "version"      INTEGER NOT NULL DEFAULT 1;

-- Every event recorded so far was about an artist, so the backfill is exact
-- rather than a guess: the subject is the artist the row already names.
UPDATE "activity_events" SET "subject_id" = "artist_id" WHERE "artist_id" IS NOT NULL;

CREATE INDEX "activity_events_subject_type_subject_id_created_at_idx"
  ON "activity_events"("subject_type", "subject_id", "created_at");
