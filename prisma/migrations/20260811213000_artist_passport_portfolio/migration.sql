ALTER TABLE "artist_passports"
  ADD COLUMN "location" TEXT,
  ADD COLUMN "social_links" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "collaboration_interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "projects" ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "artist_releases" (
  "id" TEXT NOT NULL,
  "artist_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "release_type" TEXT NOT NULL,
  "release_date" TIMESTAMP(3),
  "artwork_url" TEXT,
  "external_url" TEXT,
  "collaborators" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_featured" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "artist_releases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "artist_releases_artist_id_release_date_idx"
  ON "artist_releases"("artist_id", "release_date");

ALTER TABLE "artist_releases"
  ADD CONSTRAINT "artist_releases_artist_id_fkey"
  FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
