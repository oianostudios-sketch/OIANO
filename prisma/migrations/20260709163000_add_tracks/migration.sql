-- CreateTable
CREATE TABLE "tracks" (
    "id" TEXT NOT NULL,
    "producer_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "waveform_url" TEXT,
    "duration_sec" INTEGER,
    "bpm" INTEGER,
    "genre" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "price_usd" INTEGER,
    "license_type" TEXT,
    "play_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tracks_producer_id_idx" ON "tracks"("producer_id");

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_producer_id_fkey" FOREIGN KEY ("producer_id") REFERENCES "producers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
