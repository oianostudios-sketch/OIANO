-- Separate a Creative Professional's craft identity from their access role.
-- Existing PRODUCER accounts remain valid and receive a conservative default.
ALTER TABLE "producers"
  ADD COLUMN "primary_discipline" TEXT NOT NULL DEFAULT 'PRODUCER',
  ADD COLUMN "disciplines" JSONB NOT NULL DEFAULT '["PRODUCER"]'::jsonb,
  ADD COLUMN "services" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "onboarding_complete" BOOLEAN NOT NULL DEFAULT true;

-- Existing professionals have already been using their workspace. New accounts
-- must complete the explicit discipline onboarding introduced with this change.
ALTER TABLE "producers" ALTER COLUMN "onboarding_complete" SET DEFAULT false;

CREATE INDEX "producers_primary_discipline_idx"
  ON "producers" ("primary_discipline");
