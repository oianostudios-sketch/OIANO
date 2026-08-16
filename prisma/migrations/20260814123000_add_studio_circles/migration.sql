CREATE TYPE "CircleConsentStatus" AS ENUM ('ELIGIBLE', 'REQUESTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');
CREATE TYPE "CircleVisibility" AS ENUM ('HIDDEN', 'INITIALS', 'STAGE_NAME', 'FULL_PROFILE');

CREATE TABLE "studio_circle_members" (
  "id" TEXT NOT NULL,
  "studio_id" TEXT NOT NULL,
  "artist_id" TEXT NOT NULL,
  "consent_status" "CircleConsentStatus" NOT NULL DEFAULT 'ELIGIBLE',
  "visibility" "CircleVisibility" NOT NULL DEFAULT 'HIDDEN',
  "show_session_count" BOOLEAN NOT NULL DEFAULT false,
  "show_projects" BOOLEAN NOT NULL DEFAULT false,
  "session_count" INTEGER NOT NULL DEFAULT 1,
  "first_session_at" TIMESTAMP(3) NOT NULL,
  "last_session_at" TIMESTAMP(3) NOT NULL,
  "consented_at" TIMESTAMP(3),
  "withdrawn_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "studio_circle_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "studio_circle_members_studio_id_artist_id_key" ON "studio_circle_members"("studio_id", "artist_id");
CREATE INDEX "studio_circle_members_studio_id_consent_status_last_session_at_idx" ON "studio_circle_members"("studio_id", "consent_status", "last_session_at");
CREATE INDEX "studio_circle_members_artist_id_consent_status_idx" ON "studio_circle_members"("artist_id", "consent_status");

ALTER TABLE "studio_circle_members" ADD CONSTRAINT "studio_circle_members_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studio_circle_members" ADD CONSTRAINT "studio_circle_members_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
