-- A person can hold a different position and authority set at each studio.
-- Existing administrators retain their current authority through the defaults
-- applied below; future staff invitations can be deliberately least-privilege.
ALTER TABLE "studio_staff"
  ADD COLUMN "position" TEXT NOT NULL DEFAULT 'MANAGER',
  ADD COLUMN "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "studio_staff"
SET "position" = CASE
  WHEN "role" = 'ENGINEER' THEN 'ENGINEER'
  WHEN "role" = 'STUDIO_ADMIN' THEN 'MANAGER'
  ELSE 'TEAM_MEMBER'
END,
"capabilities" = CASE
  WHEN "role" = 'STUDIO_ADMIN' THEN ARRAY[
    'MANAGE_BOOKINGS', 'MANAGE_CALENDAR', 'MANAGE_STAFF',
    'MANAGE_POLICIES', 'VIEW_FINANCE', 'POLICY_OVERRIDE_ALL'
  ]::TEXT[]
  WHEN "role" = 'ENGINEER' THEN ARRAY[
    'VIEW_CALENDAR', 'MANAGE_ASSIGNED_SESSIONS', 'UPLOAD_DELIVERABLES'
  ]::TEXT[]
  ELSE ARRAY[]::TEXT[]
END;

CREATE INDEX "studio_staff_studio_id_position_idx"
  ON "studio_staff"("studio_id", "position");
