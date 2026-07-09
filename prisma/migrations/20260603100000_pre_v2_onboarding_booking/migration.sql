-- Artist Passport and wallet
CREATE TABLE "ArtistPassport" (
    "id" TEXT NOT NULL,
    "artist_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "creative_dna" JSONB NOT NULL,
    "goals" TEXT[],
    "preferred_rooms" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ArtistPassport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "artist_id" TEXT,
    "studio_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "balance_cents" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "provider_ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- Studio onboarding
CREATE TABLE "Studio" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "room_count" INTEGER NOT NULL,
    "availability" JSONB NOT NULL,
    "payout_method" TEXT NOT NULL,
    "payout_provider" TEXT,
    "payout_ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'onboarding',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Studio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioRoom" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    CONSTRAINT "StudioRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioOffering" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "unit" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudioOffering_pkey" PRIMARY KEY ("id")
);

-- Booking and payment records
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "artist_id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL,
    "room_id" TEXT,
    "service_type" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "duration_hours" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "total_cents" INTEGER NOT NULL,
    "platform_fee_cents" INTEGER NOT NULL,
    "studio_payout_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amount_cents" INTEGER NOT NULL,
    "platform_fee_cents" INTEGER NOT NULL,
    "studio_payout_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "checkout_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArtistPassport_artist_id_key" ON "ArtistPassport"("artist_id");
CREATE UNIQUE INDEX "Wallet_artist_id_key" ON "Wallet"("artist_id");
CREATE UNIQUE INDEX "Wallet_studio_id_key" ON "Wallet"("studio_id");
CREATE UNIQUE INDEX "StudioRoom_studio_id_room_id_key" ON "StudioRoom"("studio_id", "room_id");
CREATE UNIQUE INDEX "Booking_session_id_key" ON "Booking"("session_id");
CREATE UNIQUE INDEX "PaymentRecord_booking_id_key" ON "PaymentRecord"("booking_id");

ALTER TABLE "ArtistPassport" ADD CONSTRAINT "ArtistPassport_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioRoom" ADD CONSTRAINT "StudioRoom_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioRoom" ADD CONSTRAINT "StudioRoom_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioOffering" ADD CONSTRAINT "StudioOffering_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
