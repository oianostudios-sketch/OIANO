-- CreateEnum
CREATE TYPE "CircleConsentStatus" AS ENUM ('ELIGIBLE', 'REQUESTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CircleVisibility" AS ENUM ('HIDDEN', 'INITIALS', 'STAGE_NAME', 'FULL_PROFILE');

-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('BUG', 'CONFUSING', 'FEATURE_REQUEST', 'MISSING_INFO', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'REVIEWED', 'RESOLVED');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'OIANO_ADMIN';

-- DropIndex
DROP INDEX "studio_staff_user_id_key";

-- AlterTable
ALTER TABLE "artist_passports" ADD COLUMN     "collaboration_interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "location" TEXT,
ADD COLUMN     "social_links" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "refund_ref" TEXT,
ADD COLUMN     "refunded_usd" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "session_logs" ADD COLUMN     "testimonial_public" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "studio_staff" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "studios" ADD COLUMN     "operating_close_hour" INTEGER NOT NULL DEFAULT 22,
ADD COLUMN     "operating_open_hour" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "platform_fee_bps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "active_studio_id" TEXT,
ADD COLUMN     "auth_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfa_secret_encrypted" TEXT;

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "method" TEXT,
    "path" TEXT,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_circle_members" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL,
    "artist_id" TEXT NOT NULL,
    "consent_status" "CircleConsentStatus" NOT NULL DEFAULT 'ELIGIBLE',
    "visibility" "CircleVisibility" NOT NULL DEFAULT 'HIDDEN',
    "show_session_count" BOOLEAN NOT NULL DEFAULT false,
    "show_projects" BOOLEAN NOT NULL DEFAULT false,
    "session_count" INTEGER NOT NULL DEFAULT 1,
    "first_session_at" TIMESTAMP(3) NOT NULL,
    "last_session_at" TIMESTAMP(3) NOT NULL,
    "consented_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_circle_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passport_views" (
    "id" TEXT NOT NULL,
    "passport_id" TEXT NOT NULL,
    "viewer_hash" TEXT NOT NULL,
    "viewed_on" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passport_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_releases" (
    "id" TEXT NOT NULL,
    "artist_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "release_type" TEXT NOT NULL,
    "release_date" TIMESTAMP(3),
    "artwork_url" TEXT,
    "external_url" TEXT,
    "collaborators" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artist_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_policies" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "studio_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_exceptions" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "policy_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_completion_requests" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_completion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverables" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "visibility" TEXT NOT NULL DEFAULT 'STUDIO_ONLY',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT NOT NULL,
    "reviewed_at" TIMESTAMP(3),
    "review_due_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverable_versions" (
    "id" TEXT NOT NULL,
    "deliverable_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "file_urls" TEXT[],
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliverable_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverable_reviews" (
    "id" TEXT NOT NULL,
    "deliverable_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT,
    "reviewed_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliverable_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_messages" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MESSAGE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rights_agreements" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "agreement_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "terms_note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "created_by" TEXT NOT NULL,
    "responded_by" TEXT,
    "response_note" TEXT,
    "responded_at" TIMESTAMP(3),
    "effective_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rights_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_transactions" (
    "id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_ledger_entries" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "account_code" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount_usd" DECIMAL(12,2) NOT NULL,
    "owner_type" TEXT,
    "owner_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rights_decisions" (
    "id" TEXT NOT NULL,
    "agreement_id" TEXT NOT NULL,
    "holder_user_id" TEXT NOT NULL,
    "holder_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "evidence" JSONB,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rights_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rights_shares" (
    "id" TEXT NOT NULL,
    "agreement_id" TEXT NOT NULL,
    "holder_name" TEXT NOT NULL,
    "holder_type" TEXT NOT NULL,
    "holder_ref_id" TEXT,
    "role" TEXT NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rights_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotional_consents" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "channels" TEXT[],
    "assets" TEXT[],
    "expires_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requested_by" TEXT NOT NULL,
    "responded_by" TEXT,
    "responded_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotional_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_credits" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "credited_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "scope" TEXT,
    "participant_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "added_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_participants" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL,
    "participant_type" TEXT NOT NULL DEFAULT 'EXTERNAL',
    "participant_ref_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "added_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" "FeedbackCategory" NOT NULL,
    "page" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_logs_actor_id_created_at_idx" ON "admin_audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_created_at_idx" ON "admin_audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "studio_circle_members_studio_id_consent_status_last_session_idx" ON "studio_circle_members"("studio_id", "consent_status", "last_session_at");

-- CreateIndex
CREATE INDEX "studio_circle_members_artist_id_consent_status_idx" ON "studio_circle_members"("artist_id", "consent_status");

-- CreateIndex
CREATE UNIQUE INDEX "studio_circle_members_studio_id_artist_id_key" ON "studio_circle_members"("studio_id", "artist_id");

-- CreateIndex
CREATE INDEX "passport_views_passport_id_viewed_on_idx" ON "passport_views"("passport_id", "viewed_on");

-- CreateIndex
CREATE UNIQUE INDEX "passport_views_passport_id_viewer_hash_viewed_on_key" ON "passport_views"("passport_id", "viewer_hash", "viewed_on");

-- CreateIndex
CREATE INDEX "artist_releases_artist_id_release_date_idx" ON "artist_releases"("artist_id", "release_date");

-- CreateIndex
CREATE INDEX "studio_policies_studio_id_status_effective_from_idx" ON "studio_policies"("studio_id", "status", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "studio_policies_studio_id_domain_subject_version_key" ON "studio_policies"("studio_id", "domain", "subject", "version");

-- CreateIndex
CREATE INDEX "policy_exceptions_studio_id_status_created_at_idx" ON "policy_exceptions"("studio_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "policy_exceptions_target_type_target_id_idx" ON "policy_exceptions"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "policy_exceptions_policy_id_created_at_idx" ON "policy_exceptions"("policy_id", "created_at");

-- CreateIndex
CREATE INDEX "session_completion_requests_booking_id_created_at_idx" ON "session_completion_requests"("booking_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "session_completion_requests_booking_id_idempotency_key_key" ON "session_completion_requests"("booking_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "deliverables_booking_id_status_idx" ON "deliverables"("booking_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_versions_deliverable_id_version_number_key" ON "deliverable_versions"("deliverable_id", "version_number");

-- CreateIndex
CREATE INDEX "deliverable_reviews_deliverable_id_created_at_idx" ON "deliverable_reviews"("deliverable_id", "created_at");

-- CreateIndex
CREATE INDEX "project_messages_project_id_created_at_idx" ON "project_messages"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "rights_agreements_project_id_agreement_type_status_idx" ON "rights_agreements"("project_id", "agreement_type", "status");

-- CreateIndex
CREATE INDEX "financial_transactions_occurred_at_idx" ON "financial_transactions"("occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "financial_transactions_source_type_source_id_key" ON "financial_transactions"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_account_code_created_at_idx" ON "financial_ledger_entries"("account_code", "created_at");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_owner_type_owner_id_created_at_idx" ON "financial_ledger_entries"("owner_type", "owner_id", "created_at");

-- CreateIndex
CREATE INDEX "rights_decisions_holder_user_id_status_idx" ON "rights_decisions"("holder_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rights_decisions_agreement_id_holder_user_id_key" ON "rights_decisions"("agreement_id", "holder_user_id");

-- CreateIndex
CREATE INDEX "rights_shares_agreement_id_idx" ON "rights_shares"("agreement_id");

-- CreateIndex
CREATE INDEX "promotional_consents_project_id_status_idx" ON "promotional_consents"("project_id", "status");

-- CreateIndex
CREATE INDEX "project_credits_project_id_status_idx" ON "project_credits"("project_id", "status");

-- CreateIndex
CREATE INDEX "project_participants_project_id_idx" ON "project_participants"("project_id");

-- CreateIndex
CREATE INDEX "project_participants_participant_ref_id_idx" ON "project_participants"("participant_ref_id");

-- CreateIndex
CREATE INDEX "feedback_status_created_at_idx" ON "feedback"("status", "created_at");

-- CreateIndex
CREATE INDEX "availability_slots_studio_id_room_id_starts_at_ends_at_idx" ON "availability_slots"("studio_id", "room_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "booking_messages_booking_id_created_at_idx" ON "booking_messages"("booking_id", "created_at");

-- CreateIndex
CREATE INDEX "bookings_studio_id_starts_at_idx" ON "bookings"("studio_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_artist_id_starts_at_idx" ON "bookings"("artist_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_room_id_starts_at_ends_at_idx" ON "bookings"("room_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_ref_key" ON "payments"("provider_ref");

-- CreateIndex
CREATE INDEX "studio_staff_user_id_idx" ON "studio_staff"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_staff_user_id_studio_id_key" ON "studio_staff"("user_id", "studio_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_topups_provider_ref_key" ON "wallet_topups"("provider_ref");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_idx" ON "wallet_transactions"("wallet_id");

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_circle_members" ADD CONSTRAINT "studio_circle_members_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_circle_members" ADD CONSTRAINT "studio_circle_members_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passport_views" ADD CONSTRAINT "passport_views_passport_id_fkey" FOREIGN KEY ("passport_id") REFERENCES "artist_passports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_releases" ADD CONSTRAINT "artist_releases_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_policies" ADD CONSTRAINT "studio_policies_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_exceptions" ADD CONSTRAINT "policy_exceptions_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_exceptions" ADD CONSTRAINT "policy_exceptions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "studio_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_exceptions" ADD CONSTRAINT "policy_exceptions_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_exceptions" ADD CONSTRAINT "policy_exceptions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_completion_requests" ADD CONSTRAINT "session_completion_requests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "deliverables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_reviews" ADD CONSTRAINT "deliverable_reviews_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "deliverables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_messages" ADD CONSTRAINT "project_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_messages" ADD CONSTRAINT "project_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rights_agreements" ADD CONSTRAINT "rights_agreements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "financial_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rights_decisions" ADD CONSTRAINT "rights_decisions_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "rights_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rights_shares" ADD CONSTRAINT "rights_shares_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "rights_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotional_consents" ADD CONSTRAINT "promotional_consents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_credits" ADD CONSTRAINT "project_credits_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
