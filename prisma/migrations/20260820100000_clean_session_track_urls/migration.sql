-- Older delivery handling incorrectly copied deliverable URLs into
-- session_logs.tracks_worked. Deliverable versions remain the source of truth
-- for those files; remove only URL-shaped entries and preserve real titles.
UPDATE "session_logs"
SET "tracks_worked" = ARRAY(
  SELECT entry
  FROM unnest("tracks_worked") AS entry
  WHERE entry !~* '^https?://'
)
WHERE EXISTS (
  SELECT 1
  FROM unnest("tracks_worked") AS entry
  WHERE entry ~* '^https?://'
);
