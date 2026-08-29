CREATE TABLE "studio_staff_invitations" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "studio_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'ENGINEER',
  "position" TEXT NOT NULL,
  "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "token_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "invited_by" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "studio_staff_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "studio_staff_invitations_status_check" CHECK ("status" IN ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
  CONSTRAINT "studio_staff_invitations_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "studio_staff_invitations_token_hash_key" ON "studio_staff_invitations"("token_hash");
CREATE INDEX "studio_staff_invitations_studio_id_status_created_at_idx" ON "studio_staff_invitations"("studio_id","status","created_at");
CREATE INDEX "studio_staff_invitations_email_status_idx" ON "studio_staff_invitations"("email","status");
