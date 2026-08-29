CREATE TABLE "studio_policies" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "studio_id" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "conditions" JSONB NOT NULL DEFAULT '{}',
  "default_outcome" JSONB NOT NULL,
  "enforcement" TEXT NOT NULL DEFAULT 'CONTROLLED',
  "override_capability" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_until" TIMESTAMP(3),
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "studio_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "studio_policies_enforcement_check" CHECK ("enforcement" IN ('ADVISORY','CONTROLLED','HARD')),
  CONSTRAINT "studio_policies_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','RETIRED')),
  CONSTRAINT "studio_policies_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "studio_policies_studio_id_domain_subject_version_key" ON "studio_policies"("studio_id", "domain", "subject", "version");
CREATE INDEX "studio_policies_studio_id_status_effective_from_idx" ON "studio_policies"("studio_id", "status", "effective_from");

CREATE TABLE "policy_exceptions" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "studio_id" TEXT NOT NULL,
  "policy_id" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "normal_values" JSONB NOT NULL,
  "requested_values" JSONB NOT NULL,
  "consequence" JSONB NOT NULL DEFAULT '{}',
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "requested_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approval_note" TEXT,
  "expires_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "applied_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "policy_exceptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "policy_exceptions_status_check" CHECK ("status" IN ('REQUESTED','APPROVED','REJECTED','ESCALATED','APPLIED','EXPIRED','REVOKED')),
  CONSTRAINT "policy_exceptions_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "policy_exceptions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "studio_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "policy_exceptions_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "policy_exceptions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "policy_exceptions_studio_id_status_created_at_idx" ON "policy_exceptions"("studio_id", "status", "created_at");
CREATE INDEX "policy_exceptions_target_type_target_id_idx" ON "policy_exceptions"("target_type", "target_id");
CREATE INDEX "policy_exceptions_policy_id_created_at_idx" ON "policy_exceptions"("policy_id", "created_at");
