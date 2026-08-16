CREATE TABLE "passport_views" (
  "id" TEXT NOT NULL,
  "passport_id" TEXT NOT NULL,
  "viewer_hash" TEXT NOT NULL,
  "viewed_on" DATE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "passport_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "passport_views_passport_id_viewer_hash_viewed_on_key"
  ON "passport_views"("passport_id", "viewer_hash", "viewed_on");
CREATE INDEX "passport_views_passport_id_viewed_on_idx"
  ON "passport_views"("passport_id", "viewed_on");

ALTER TABLE "passport_views"
  ADD CONSTRAINT "passport_views_passport_id_fkey"
  FOREIGN KEY ("passport_id") REFERENCES "artist_passports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
