CREATE TABLE "promotional_consents" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "channels" TEXT[] NOT NULL,
  "assets" TEXT[] NOT NULL,
  "expires_at" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "requested_by" TEXT NOT NULL,
  "responded_by" TEXT,
  "responded_at" TIMESTAMP(3),
  "withdrawn_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "promotional_consents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "promotional_consents_project_id_status_idx" ON "promotional_consents"("project_id", "status");
ALTER TABLE "promotional_consents" ADD CONSTRAINT "promotional_consents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
