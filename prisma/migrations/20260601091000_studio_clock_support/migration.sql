-- CreateTable
CREATE TABLE IF NOT EXISTS "ArtistRhythm" (
    "id" TEXT NOT NULL,
    "artist_id" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "energy" DOUBLE PRECISION NOT NULL,
    "bookings" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistRhythm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StudioLoad" (
    "id" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "load_pct" DOUBLE PRECISION NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioLoad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RecordingScore" (
    "id" TEXT NOT NULL,
    "artist_id" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "factors" JSONB NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordingScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ArtistRhythm_artist_id_hour_key" ON "ArtistRhythm"("artist_id", "hour");
CREATE UNIQUE INDEX IF NOT EXISTS "StudioLoad_room_hour_day_of_week_key" ON "StudioLoad"("room", "hour", "day_of_week");
CREATE UNIQUE INDEX IF NOT EXISTS "RecordingScore_artist_id_hour_key" ON "RecordingScore"("artist_id", "hour");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ArtistRhythm_artist_id_fkey'
  ) THEN
    ALTER TABLE "ArtistRhythm" ADD CONSTRAINT "ArtistRhythm_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
