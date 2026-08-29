CREATE TABLE "financial_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "source_type" TEXT NOT NULL, "source_id" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD', "status" TEXT NOT NULL DEFAULT 'POSTED', "description" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}', "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';
ALTER TABLE "studios" ADD COLUMN IF NOT EXISTS "platform_fee_bps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "refunded_usd" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "refund_ref" TEXT;
UPDATE "payments" SET "refunded_usd"="amount_usd" WHERE "status"='REFUNDED' AND "refunded_usd"=0;
CREATE UNIQUE INDEX "financial_transactions_source_type_source_id_key" ON "financial_transactions"("source_type", "source_id");
CREATE INDEX "financial_transactions_occurred_at_idx" ON "financial_transactions"("occurred_at");

CREATE TABLE "financial_ledger_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "transaction_id" UUID NOT NULL, "account_code" TEXT NOT NULL,
  "direction" TEXT NOT NULL, "amount_usd" DECIMAL(12,2) NOT NULL, "owner_type" TEXT, "owner_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "financial_ledger_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "financial_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "financial_ledger_entries_direction_check" CHECK ("direction" IN ('DEBIT','CREDIT')),
  CONSTRAINT "financial_ledger_entries_amount_check" CHECK ("amount_usd" > 0)
);
CREATE INDEX "financial_ledger_entries_account_code_created_at_idx" ON "financial_ledger_entries"("account_code", "created_at");
CREATE INDEX "financial_ledger_entries_owner_type_owner_id_created_at_idx" ON "financial_ledger_entries"("owner_type", "owner_id", "created_at");

INSERT INTO "financial_transactions" ("source_type", "source_id", "description", "occurred_at", "metadata")
SELECT 'BOOKING_PAYMENT', p."id", 'Legacy paid booking payment', COALESCE(p."paid_at", p."created_at"), jsonb_build_object('legacy_backfill', true, 'provider', p."provider")
FROM "payments" p WHERE p."status" IN ('PAID','REFUNDED') ON CONFLICT DO NOTHING;
INSERT INTO "financial_ledger_entries" ("transaction_id", "account_code", "direction", "amount_usd", "owner_type", "owner_id")
SELECT ft."id", CASE WHEN p."provider" = 'wallet' THEN 'WALLET_LIABILITY' ELSE 'CASH_CLEARING' END, 'DEBIT', p."amount_usd", 'ARTIST', b."artist_id"
FROM "financial_transactions" ft JOIN "payments" p ON ft."source_type"='BOOKING_PAYMENT' AND ft."source_id"=p."id" JOIN "bookings" b ON b."id"=p."booking_id";
INSERT INTO "financial_ledger_entries" ("transaction_id", "account_code", "direction", "amount_usd", "owner_type", "owner_id")
SELECT ft."id", 'STUDIO_PAYABLE', 'CREDIT', p."amount_usd", 'STUDIO', b."studio_id"
FROM "financial_transactions" ft JOIN "payments" p ON ft."source_type"='BOOKING_PAYMENT' AND ft."source_id"=p."id" JOIN "bookings" b ON b."id"=p."booking_id";

INSERT INTO "financial_transactions" ("source_type", "source_id", "description", "occurred_at", "metadata")
SELECT 'BOOKING_REFUND', p."id" || ':LEGACY_FULL_REFUND', 'Legacy full booking refund', p."created_at", jsonb_build_object('legacy_backfill', true, 'payment_id', p."id")
FROM "payments" p WHERE p."status"='REFUNDED' ON CONFLICT DO NOTHING;
INSERT INTO "financial_ledger_entries" ("transaction_id", "account_code", "direction", "amount_usd", "owner_type", "owner_id")
SELECT ft."id", 'STUDIO_PAYABLE', 'DEBIT', p."amount_usd", 'STUDIO', b."studio_id"
FROM "financial_transactions" ft JOIN "payments" p ON ft."source_type"='BOOKING_REFUND' AND ft."source_id"=p."id" || ':LEGACY_FULL_REFUND' JOIN "bookings" b ON b."id"=p."booking_id";
INSERT INTO "financial_ledger_entries" ("transaction_id", "account_code", "direction", "amount_usd")
SELECT ft."id", CASE WHEN p."provider"='wallet' THEN 'WALLET_LIABILITY' ELSE 'CASH_CLEARING' END, 'CREDIT', p."amount_usd"
FROM "financial_transactions" ft JOIN "payments" p ON ft."source_type"='BOOKING_REFUND' AND ft."source_id"=p."id" || ':LEGACY_FULL_REFUND';

INSERT INTO "financial_transactions" ("source_type", "source_id", "description", "occurred_at", "metadata")
SELECT 'WALLET_TOPUP', wt."id", 'Legacy wallet top-up', wt."created_at", jsonb_build_object('legacy_backfill', true)
FROM "wallet_topups" wt WHERE wt."status"='PAID' ON CONFLICT DO NOTHING;
INSERT INTO "financial_ledger_entries" ("transaction_id", "account_code", "direction", "amount_usd")
SELECT ft."id", 'CASH_CLEARING', 'DEBIT', wt."amount_usd" FROM "financial_transactions" ft JOIN "wallet_topups" wt ON ft."source_type"='WALLET_TOPUP' AND ft."source_id"=wt."id";
INSERT INTO "financial_ledger_entries" ("transaction_id", "account_code", "direction", "amount_usd", "owner_type", "owner_id")
SELECT ft."id", 'WALLET_LIABILITY', 'CREDIT', wt."amount_usd", 'WALLET', wt."wallet_id" FROM "financial_transactions" ft JOIN "wallet_topups" wt ON ft."source_type"='WALLET_TOPUP' AND ft."source_id"=wt."id";
