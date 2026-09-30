-- Contribution invitations are claimed with a link, not by an email match.
--
-- A participant used to belong to any account at the invited email address, and
-- signup never proves an address belongs to whoever registers it. Anyone who
-- registered an invited address could accept the invitation, open the project's
-- workspace and messages, and be named as a rights holder.
--
-- The link is a credential: a random token of which only the SHA-256 is stored,
-- with an expiry, claimable once. This follows StudioStaffInvitation and
-- CreatorInvitation.
CREATE TABLE "contribution_invitations" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invited_by" TEXT NOT NULL,
    "claimed_by" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contribution_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contribution_invitations_token_hash_key" ON "contribution_invitations"("token_hash");
CREATE INDEX "contribution_invitations_participant_id_status_idx" ON "contribution_invitations"("participant_id", "status");

ALTER TABLE "contribution_invitations" ADD CONSTRAINT "contribution_invitations_participant_id_fkey"
  FOREIGN KEY ("participant_id") REFERENCES "project_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An unanswered invitation whose address matched an account when it was created
-- was bound to that account then. That binding is the email match being retired,
-- so it is undone: the invitation waits for a link like any new one, and the
-- project lead can send one from the project page. Answered invitations are left
-- as they are; after the fact, an email match cannot be told apart from a person.
UPDATE "project_participants"
SET "participant_ref_id" = NULL, "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'INVITED' AND "participant_ref_id" IS NOT NULL;
