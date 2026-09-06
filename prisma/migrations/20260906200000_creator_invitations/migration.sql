-- Creator invitations: someone already using OIANO bringing in someone who is not.
--
-- The adoption loop had no INVITE stage. PassportConnection requires both
-- parties to be existing artists, and StudioStaffInvitation only admits studio
-- staff, so no creator could bring anyone new to the network at all.
--
-- Only the SHA-256 of the token is stored — the link is a credential, and this
-- follows StudioStaffInvitation, which already establishes that pattern here.
CREATE TABLE "creator_invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "note" TEXT,
    "token_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invited_by" TEXT NOT NULL,
    "accepted_by" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "creator_invitations_token_hash_key" ON "creator_invitations"("token_hash");
CREATE INDEX "creator_invitations_invited_by_status_created_at_idx" ON "creator_invitations"("invited_by", "status", "created_at");
CREATE INDEX "creator_invitations_email_status_idx" ON "creator_invitations"("email", "status");

ALTER TABLE "creator_invitations" ADD CONSTRAINT "creator_invitations_invited_by_fkey"
  FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creator_invitations" ADD CONSTRAINT "creator_invitations_accepted_by_fkey"
  FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
