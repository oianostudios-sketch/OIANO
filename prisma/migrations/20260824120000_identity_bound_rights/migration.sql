CREATE TABLE "rights_decisions" (
  -- OIANO's baseline uses Prisma string UUIDs stored as TEXT. Keep every
  -- relation type identical to its referenced key; PostgreSQL will reject a
  -- UUID -> TEXT foreign key even when both values contain UUID strings.
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "agreement_id" TEXT NOT NULL,
  "holder_user_id" TEXT NOT NULL,
  "holder_name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "evidence" JSONB,
  "responded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rights_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rights_decisions_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "rights_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "rights_decisions_agreement_id_holder_user_id_key" ON "rights_decisions"("agreement_id", "holder_user_id");
CREATE INDEX "rights_decisions_holder_user_id_status_idx" ON "rights_decisions"("holder_user_id", "status");

INSERT INTO "rights_decisions" ("agreement_id", "holder_user_id", "holder_name", "status", "responded_at", "evidence")
SELECT DISTINCT ra."id", a."user_id", rs."holder_name",
  CASE WHEN ra."status" = 'APPROVED' THEN 'APPROVED' WHEN ra."status" = 'DISPUTED' THEN 'DISPUTED' ELSE 'PENDING' END,
  CASE WHEN ra."status" IN ('APPROVED', 'DISPUTED') THEN ra."responded_at" ELSE NULL END,
  jsonb_build_object('method', 'LEGACY_AGREEMENT_BACKFILL')
FROM "rights_agreements" ra
JOIN "projects" p ON p."id" = ra."project_id"
JOIN "artists" a ON a."id" = p."artist_id"
JOIN "rights_shares" rs ON rs."agreement_id" = ra."id" AND rs."holder_type" = 'ARTIST'
ON CONFLICT ("agreement_id", "holder_user_id") DO NOTHING;
