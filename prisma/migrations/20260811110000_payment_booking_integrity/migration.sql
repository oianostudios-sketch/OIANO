-- Financial webhook idempotency and booking integrity protections.
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_provider_ref_key"
ON "payments"("provider_ref")
WHERE "provider_ref" IS NOT NULL;

CREATE UNIQUE INDEX "wallet_topups_provider_ref_key"
ON "wallet_topups"("provider_ref")
WHERE "provider_ref" IS NOT NULL;

ALTER TABLE "wallets"
ADD CONSTRAINT "wallets_balance_nonnegative" CHECK ("balance_usd" >= 0);

ALTER TABLE "bookings"
ADD CONSTRAINT "bookings_valid_time_range" CHECK ("ends_at" > "starts_at");

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
ADD CONSTRAINT "bookings_room_time_no_overlap"
EXCLUDE USING gist (
  "room_id" WITH =,
  tsrange("starts_at", "ends_at", '[)') WITH &&
)
WHERE ("status" NOT IN ('CANCELLED', 'NO_SHOW'));
