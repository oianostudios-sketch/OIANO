-- Canonical migration, steps 1 and 2: Person and CreativeProfile. Expand only.
--
-- A Person is who someone is; a User is how they sign in. A CreativeProfile is how a
-- person presents one practice. These tables are added beside the legacy Artist,
-- Producer and Engineer tables and touch none of them. Nothing reads or writes them yet
-- except the backfill (apps/api/src/lib/identity/backfill.ts), which creates one Person
-- per User and one CreativeProfile per Artist, Producer and Engineer row under the same
-- id. docs/OIANO_SCHEMA_REDESIGN.md §3.1 and §7.
--
-- Deleting a user keeps their Person (an identity can exist unclaimed): user_id is set
-- to null. A Person with profiles cannot be deleted while they exist.

-- CreateEnum
CREATE TYPE "ProfileAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "LegacyProfileSource" AS ENUM ('ARTIST', 'PRODUCER', 'ENGINEER');

-- CreateTable
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "display_name" TEXT,
    "primary_locale" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_profiles" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "legacy_source" "LegacyProfileSource",
    "handle" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "bio" TEXT,
    "avatar_url" TEXT,
    "city" TEXT,
    "city_public" BOOLEAN NOT NULL DEFAULT false,
    "availability" "ProfileAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "open_to_work" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creative_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "persons_user_id_key" ON "persons"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "creative_profiles_handle_key" ON "creative_profiles"("handle");

-- CreateIndex
CREATE INDEX "creative_profiles_person_id_idx" ON "creative_profiles"("person_id");

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_profiles" ADD CONSTRAINT "creative_profiles_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

