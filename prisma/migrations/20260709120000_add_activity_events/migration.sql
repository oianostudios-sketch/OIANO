-- CreateEnum
CREATE TYPE "ArtistAvailability" AS ENUM ('AVAILABLE_FOR_BOOKING', 'IN_SESSION', 'UNAVAILABLE');

-- AlterTable
ALTER TABLE "artists" ADD COLUMN "status" "ArtistAvailability" NOT NULL DEFAULT 'AVAILABLE_FOR_BOOKING';

-- CreateTable
CREATE TABLE "activity_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "artist_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_events_type_idx" ON "activity_events"("type");

-- CreateIndex
CREATE INDEX "activity_events_artist_id_idx" ON "activity_events"("artist_id");

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
