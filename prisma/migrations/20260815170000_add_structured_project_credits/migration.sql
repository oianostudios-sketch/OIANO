CREATE TABLE "project_credits" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "credited_name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "scope" TEXT,
  "participant_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "added_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_credits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_credits_project_id_status_idx" ON "project_credits"("project_id", "status");
ALTER TABLE "project_credits" ADD CONSTRAINT "project_credits_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
