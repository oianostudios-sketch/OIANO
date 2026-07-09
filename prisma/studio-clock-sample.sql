-- Optional local sample data for Studio Clock verification.
-- Replace the artist_id/project_id/session_id values with records from your local database before running.

INSERT INTO "Room" ("id", "name", "room_type", "capacity", "status", "created_at", "updated_at")
VALUES
  ('00000000-0000-4000-8000-000000000101', 'Studio A', 'recording', 5, 'available', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000102', 'Control Room', 'mix', 3, 'available', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "Profile" ("id", "display_name", "email", "primary_role", "created_at", "updated_at")
VALUES
  ('00000000-0000-4000-8000-000000000201', 'Mara Ionescu', 'mara.engineer@example.com', 'engineer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000202', 'Alex Radu', 'alex.producer@example.com', 'producer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("email") DO NOTHING;

-- Example milestone rows after creating a project/session:
-- INSERT INTO "Milestone" ("id", "project_id", "session_id", "title", "milestone_type", "status", "due_at", "sort_order", "created_at", "updated_at")
-- VALUES
--   (gen_random_uuid()::text, '<project_id>', '<session_id>', 'Lead vocal comp complete', 'recording_block', 'pending', CURRENT_TIMESTAMP + INTERVAL '45 minutes', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
--   (gen_random_uuid()::text, '<project_id>', '<session_id>', 'Client review bounce', 'review', 'pending', CURRENT_TIMESTAMP + INTERVAL '90 minutes', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
