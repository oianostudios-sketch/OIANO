-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ARTIST', 'PRODUCER', 'STUDIO_ADMIN', 'ENGINEER', 'OIANO_ADMIN');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ProjectPhase" AS ENUM ('PRE_PRODUCTION', 'TRACKING', 'EDITING', 'MIXING', 'MASTERING', 'DELIVERED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('RECORDING', 'FULL_DAY', 'MIX_MASTER', 'COACHING', 'EVENT', 'MEMBERSHIP');

-- CreateEnum
CREATE TYPE "CircleConsentStatus" AS ENUM ('ELIGIBLE', 'REQUESTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CircleVisibility" AS ENUM ('HIDDEN', 'INITIALS', 'STAGE_NAME', 'FULL_PROFILE');

-- CreateEnum
CREATE TYPE "ConnectStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ArtistAvailability" AS ENUM ('AVAILABLE_FOR_BOOKING', 'IN_SESSION', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('BUG', 'CONFUSING', 'FEATURE_REQUEST', 'MISSING_INFO', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'REVIEWED', 'RESOLVED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'ARTIST',
    "active_studio_id" TEXT,
    "locale" TEXT DEFAULT 'en-US',
    "mfa_secret_encrypted" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "studios" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "operating_open_hour" INTEGER NOT NULL DEFAULT 8,
    "operating_close_hour" INTEGER NOT NULL DEFAULT 22,
    "stripe_account_id" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "logo_url" TEXT,
    "mint_letter" TEXT NOT NULL DEFAULT 'Z',
    "passport_seq" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_staff" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STUDIO_ADMIN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "description" TEXT,
    "hourly_rate" DECIMAL(10,2),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineers" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "specialties" TEXT[],
    "hourly_rate_usd" DECIMAL(10,2),
    "bio" TEXT,
    "avatar_url" TEXT,
    "credits" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "engineers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_offerings" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "min_price_usd" DECIMAL(10,2) NOT NULL,
    "max_price_usd" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "service_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_slots" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL,
    "room_id" TEXT,
    "engineer_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "availability_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alias" TEXT,
    "bio" TEXT,
    "avatar_url" TEXT,
    "status" "ArtistAvailability" NOT NULL DEFAULT 'AVAILABLE_FOR_BOOKING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artists_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "artist_passports" (
    "id" TEXT NOT NULL,
    "artist_id" TEXT NOT NULL,
    "passport_code" TEXT NOT NULL,
    "creative_dna" JSONB NOT NULL DEFAULT '{}',
    "profile_strength" INTEGER NOT NULL DEFAULT 0,
    "profile_image_url" TEXT,
    "bio" TEXT,
    "ai_summary" TEXT,
    "ai_summary_updated_at" TIMESTAMP(3),
    "ai_summary_edited" BOOLEAN NOT NULL DEFAULT false,
    "ai_summary_public" BOOLEAN NOT NULL DEFAULT true,
    "profile_views" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT,
    "social_links" JSONB NOT NULL DEFAULT '{}',
    "collaboration_interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artist_passports_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "artist_id" TEXT NOT NULL,
    "balance_usd" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "amount_usd" DECIMAL(10,2) NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_files" (
    "id" TEXT NOT NULL,
    "artist_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "folder" TEXT,
    "source" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL,
    "artist_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "engineer_id" TEXT,
    "preferred_engineer_id" TEXT,
    "service_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "total_usd" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "project_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT,
    "payment_intent_id" TEXT,
    "amount_usd" DECIMAL(10,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_topups" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "provider_ref" TEXT,
    "payment_intent_id" TEXT,
    "amount_usd" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_topups_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "session_logs" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "artist_id" TEXT NOT NULL,
    "notes" TEXT,
    "quality_rating" INTEGER,
    "artist_rating" INTEGER,
    "artist_testimonial" TEXT,
    "testimonial_public" BOOLEAN NOT NULL DEFAULT false,
    "ai_summary" TEXT,
    "tracks_worked" TEXT[],
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "session_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_messages" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alias" TEXT,
    "bio" TEXT,
    "avatar_url" TEXT,
    "open_to_collabs" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producer_passports" (
    "id" TEXT NOT NULL,
    "producer_id" TEXT NOT NULL,
    "passport_code" TEXT NOT NULL,
    "genres_produced" JSONB NOT NULL DEFAULT '[]',
    "signature_tags" JSONB NOT NULL DEFAULT '[]',
    "profile_strength" INTEGER NOT NULL DEFAULT 0,
    "profile_views" INTEGER NOT NULL DEFAULT 0,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producer_passports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" TEXT NOT NULL,
    "producer_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "waveform_url" TEXT,
    "duration_sec" INTEGER,
    "bpm" INTEGER,
    "genre" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "price_usd" INTEGER,
    "license_type" TEXT,
    "play_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "producer_id" TEXT NOT NULL,
    "artist_id" TEXT,
    "title" TEXT NOT NULL,
    "phase" "ProjectPhase" NOT NULL DEFAULT 'PRE_PRODUCTION',
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "last_session_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "studio_announcements" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passport_connections" (
    "id" TEXT NOT NULL,
    "initiator_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "status" "ConnectStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passport_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connect_messages" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connect_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "artist_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "admin_audit_logs_actor_id_created_at_idx" ON "admin_audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_created_at_idx" ON "admin_audit_logs"("action", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "studios_slug_key" ON "studios"("slug");

-- CreateIndex
CREATE INDEX "studio_staff_user_id_idx" ON "studio_staff"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_staff_user_id_studio_id_key" ON "studio_staff"("user_id", "studio_id");

-- CreateIndex
CREATE UNIQUE INDEX "engineers_user_id_key" ON "engineers"("user_id");

-- CreateIndex
CREATE INDEX "availability_slots_studio_id_room_id_starts_at_ends_at_idx" ON "availability_slots"("studio_id", "room_id", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "artists_user_id_key" ON "artists"("user_id");

-- CreateIndex
CREATE INDEX "studio_circle_members_studio_id_consent_status_last_session_idx" ON "studio_circle_members"("studio_id", "consent_status", "last_session_at");

-- CreateIndex
CREATE INDEX "studio_circle_members_artist_id_consent_status_idx" ON "studio_circle_members"("artist_id", "consent_status");

-- CreateIndex
CREATE UNIQUE INDEX "studio_circle_members_studio_id_artist_id_key" ON "studio_circle_members"("studio_id", "artist_id");

-- CreateIndex
CREATE UNIQUE INDEX "artist_passports_artist_id_key" ON "artist_passports"("artist_id");

-- CreateIndex
CREATE UNIQUE INDEX "artist_passports_passport_code_key" ON "artist_passports"("passport_code");

-- CreateIndex
CREATE INDEX "passport_views_passport_id_viewed_on_idx" ON "passport_views"("passport_id", "viewed_on");

-- CreateIndex
CREATE UNIQUE INDEX "passport_views_passport_id_viewer_hash_viewed_on_key" ON "passport_views"("passport_id", "viewer_hash", "viewed_on");

-- CreateIndex
CREATE INDEX "artist_releases_artist_id_release_date_idx" ON "artist_releases"("artist_id", "release_date");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_artist_id_key" ON "wallets"("artist_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_idx" ON "wallet_transactions"("wallet_id");

-- CreateIndex
CREATE INDEX "bookings_studio_id_starts_at_idx" ON "bookings"("studio_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_artist_id_starts_at_idx" ON "bookings"("artist_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_room_id_starts_at_ends_at_idx" ON "bookings"("room_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "deliverables_booking_id_status_idx" ON "deliverables"("booking_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_versions_deliverable_id_version_number_key" ON "deliverable_versions"("deliverable_id", "version_number");

-- CreateIndex
CREATE INDEX "deliverable_reviews_deliverable_id_created_at_idx" ON "deliverable_reviews"("deliverable_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_booking_id_key" ON "payments"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_ref_key" ON "payments"("provider_ref");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_topups_provider_ref_key" ON "wallet_topups"("provider_ref");

-- CreateIndex
CREATE UNIQUE INDEX "session_logs_booking_id_key" ON "session_logs"("booking_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "booking_messages_booking_id_created_at_idx" ON "booking_messages"("booking_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "producers_user_id_key" ON "producers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "producer_passports_producer_id_key" ON "producer_passports"("producer_id");

-- CreateIndex
CREATE UNIQUE INDEX "producer_passports_passport_code_key" ON "producer_passports"("passport_code");

-- CreateIndex
CREATE INDEX "project_messages_project_id_created_at_idx" ON "project_messages"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "rights_agreements_project_id_agreement_type_status_idx" ON "rights_agreements"("project_id", "agreement_type", "status");

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
CREATE UNIQUE INDEX "passport_connections_initiator_id_recipient_id_key" ON "passport_connections"("initiator_id", "recipient_id");

-- CreateIndex
CREATE INDEX "activity_events_type_idx" ON "activity_events"("type");

-- CreateIndex
CREATE INDEX "activity_events_artist_id_idx" ON "activity_events"("artist_id");

-- CreateIndex
CREATE INDEX "feedback_status_created_at_idx" ON "feedback"("status", "created_at");

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_staff" ADD CONSTRAINT "studio_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_staff" ADD CONSTRAINT "studio_staff_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineers" ADD CONSTRAINT "engineers_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineers" ADD CONSTRAINT "engineers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_offerings" ADD CONSTRAINT "service_offerings_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_engineer_id_fkey" FOREIGN KEY ("engineer_id") REFERENCES "engineers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artists" ADD CONSTRAINT "artists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_circle_members" ADD CONSTRAINT "studio_circle_members_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_circle_members" ADD CONSTRAINT "studio_circle_members_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_passports" ADD CONSTRAINT "artist_passports_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passport_views" ADD CONSTRAINT "passport_views_passport_id_fkey" FOREIGN KEY ("passport_id") REFERENCES "artist_passports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_releases" ADD CONSTRAINT "artist_releases_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_files" ADD CONSTRAINT "artist_files_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_engineer_id_fkey" FOREIGN KEY ("engineer_id") REFERENCES "engineers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_preferred_engineer_id_fkey" FOREIGN KEY ("preferred_engineer_id") REFERENCES "engineers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "deliverables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_reviews" ADD CONSTRAINT "deliverable_reviews_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "deliverables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_topups" ADD CONSTRAINT "wallet_topups_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_messages" ADD CONSTRAINT "booking_messages_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_messages" ADD CONSTRAINT "booking_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producers" ADD CONSTRAINT "producers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_passports" ADD CONSTRAINT "producer_passports_producer_id_fkey" FOREIGN KEY ("producer_id") REFERENCES "producers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_producer_id_fkey" FOREIGN KEY ("producer_id") REFERENCES "producers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_producer_id_fkey" FOREIGN KEY ("producer_id") REFERENCES "producers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_messages" ADD CONSTRAINT "project_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_messages" ADD CONSTRAINT "project_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rights_agreements" ADD CONSTRAINT "rights_agreements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rights_shares" ADD CONSTRAINT "rights_shares_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "rights_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotional_consents" ADD CONSTRAINT "promotional_consents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_credits" ADD CONSTRAINT "project_credits_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_announcements" ADD CONSTRAINT "studio_announcements_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passport_connections" ADD CONSTRAINT "passport_connections_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "artists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passport_connections" ADD CONSTRAINT "passport_connections_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "artists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connect_messages" ADD CONSTRAINT "connect_messages_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "passport_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connect_messages" ADD CONSTRAINT "connect_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "artists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The following are raw-SQL constraints/triggers that live outside what
-- Prisma's schema can express (no @check, no EXCLUDE, no trigger support).
-- Confirmed present in the live database before writing this baseline —
-- carried forward here so a fresh database build doesn't silently lose them.
-- Originally added in 20260811110000_payment_booking_integrity and
-- 20260813143000_add_admin_audit_logs (see prisma/migrations_archive_pre_baseline/).

-- Prevents two non-cancelled bookings from overlapping in the same room, at
-- the database level (not just application-level conflict checks).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
ADD CONSTRAINT "bookings_room_time_no_overlap"
EXCLUDE USING gist (
  "room_id" WITH =,
  tsrange("starts_at", "ends_at", '[)') WITH &&
)
WHERE ("status" NOT IN ('CANCELLED', 'NO_SHOW'));

-- Admin audit log is append-only by design — blocks UPDATE/DELETE even for a
-- direct database connection, not just at the application layer.
CREATE OR REPLACE FUNCTION prevent_admin_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Administrative audit logs are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admin_audit_logs_no_update
BEFORE UPDATE ON "admin_audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_log_mutation();

CREATE TRIGGER admin_audit_logs_no_delete
BEFORE DELETE ON "admin_audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_log_mutation();
