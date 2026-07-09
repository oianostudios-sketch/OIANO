-- AlterTable
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "current_phase" TEXT NOT NULL DEFAULT 'setup';
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "phase_started_at" TIMESTAMP(3);
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "last_activity_at" TIMESTAMP(3);
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "overtime_logged_minutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "overtime_status" TEXT NOT NULL DEFAULT 'none';

-- CreateTable
CREATE TABLE IF NOT EXISTS "Milestone" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "session_id" TEXT,
    "track_id" TEXT,
    "title" TEXT NOT NULL,
    "milestone_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Milestone_project_id_fkey'
  ) THEN
    ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Milestone_session_id_fkey'
  ) THEN
    ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Milestone_track_id_fkey'
  ) THEN
    ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "Track"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
