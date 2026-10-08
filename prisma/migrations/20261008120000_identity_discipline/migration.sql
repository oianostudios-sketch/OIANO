-- Canonical migration, step 3: Discipline and PersonDiscipline. Expand only.
--
-- A discipline is what a person says they do ("Artist · Producer · Songwriter" on one
-- person); what they did on a particular Work is a Contribution role, which comes later.
-- `disciplines` is a reference list, seeded below so every environment gets it from
-- `prisma migrate deploy`. `person_disciplines` links a Person to the disciplines they
-- hold, one of them primary. Nothing reads or writes them yet except the identity mirror
-- (apps/api/src/lib/identity/backfill.ts). Touches no legacy table.
-- docs/OIANO_SCHEMA_REDESIGN.md §3.1.
--
-- A person's disciplines go with the person. A discipline that anyone holds cannot be
-- deleted.

-- CreateTable
CREATE TABLE "disciplines" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "family" TEXT NOT NULL,

    CONSTRAINT "disciplines_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "person_disciplines" (
    "person_id" TEXT NOT NULL,
    "discipline_code" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_disciplines_pkey" PRIMARY KEY ("person_id","discipline_code")
);

-- CreateIndex
CREATE INDEX "person_disciplines_discipline_code_idx" ON "person_disciplines"("discipline_code");

-- AddForeignKey
ALTER TABLE "person_disciplines" ADD CONSTRAINT "person_disciplines_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_disciplines" ADD CONSTRAINT "person_disciplines_discipline_code_fkey" FOREIGN KEY ("discipline_code") REFERENCES "disciplines"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reference rows: the twelve disciplines a professional chooses from today
-- (apps/web/src/lib/creativeDisciplines.ts), plus ARTIST and ENGINEER, which the legacy
-- Artist and Engineer records stand for. Idempotent.
INSERT INTO "disciplines" ("code", "label", "family") VALUES
    ('ARTIST', 'Artist', 'MUSIC'),
    ('ENGINEER', 'Engineer', 'MUSIC'),
    ('PRODUCER', 'Producer', 'MUSIC'),
    ('RECORDING_ENGINEER', 'Recording engineer', 'MUSIC'),
    ('MIX_ENGINEER', 'Mix engineer', 'MUSIC'),
    ('MASTERING_ENGINEER', 'Mastering engineer', 'MUSIC'),
    ('SONGWRITER', 'Songwriter', 'MUSIC'),
    ('COMPOSER', 'Composer', 'MUSIC'),
    ('MUSICIAN', 'Musician', 'MUSIC'),
    ('VOCALIST', 'Vocalist', 'MUSIC'),
    ('DJ', 'DJ', 'MUSIC'),
    ('CREATIVE_DIRECTOR', 'Creative director', 'VISUAL'),
    ('PHOTOGRAPHER', 'Photographer', 'VISUAL'),
    ('VIDEOGRAPHER', 'Videographer', 'FILM')
ON CONFLICT ("code") DO NOTHING;
