-- Add folder and source columns to artist_files
ALTER TABLE "artist_files" ADD COLUMN IF NOT EXISTS "folder" TEXT;
ALTER TABLE "artist_files" ADD COLUMN IF NOT EXISTS "source" TEXT;
