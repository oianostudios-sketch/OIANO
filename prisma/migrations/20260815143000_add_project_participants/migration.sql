CREATE TABLE "project_participants" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "email" TEXT,
  "role" TEXT NOT NULL,
  "participant_type" TEXT NOT NULL DEFAULT 'EXTERNAL',
  "participant_ref_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "added_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_participants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_participants_project_id_idx" ON "project_participants"("project_id");
CREATE INDEX "project_participants_participant_ref_id_idx" ON "project_participants"("participant_ref_id");
ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
