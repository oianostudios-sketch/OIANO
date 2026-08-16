CREATE TYPE "OianoPaymentStatus" AS ENUM ('CREATED','REQUIRES_ACTION','PROCESSING','AUTHORIZED','SUCCEEDED','FAILED','CANCELLED','PARTIALLY_REFUNDED','REFUNDED','DISPUTED');
CREATE TYPE "PaymentPurpose" AS ENUM ('STUDIO_BOOKING','BOOKING_DEPOSIT','SESSION_PAYMENT','MIXING','MASTERING','BEAT_PURCHASE','VIDEO_PRODUCTION','PHOTOGRAPHY','SUBSCRIPTION','INVOICE','PROJECT_PAYMENT','OTHER');
CREATE TYPE "UniversalPaymentMethod" AS ENUM ('CARD','BANK_TRANSFER','APPLE_PAY','GOOGLE_PAY','MOBILE_MONEY','WALLET','LOCAL_PAYMENT_METHOD','CASH','OTHER');

CREATE TABLE "oiano_payments" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "idempotency_key" TEXT,
  "payer_id" TEXT NOT NULL,
  "merchant_id" TEXT NOT NULL,
  "studio_id" TEXT,
  "booking_id" TEXT,
  "project_id" TEXT,
  "service_id" TEXT,
  "amount_minor" BIGINT NOT NULL,
  "pricing_currency" TEXT NOT NULL,
  "transaction_currency" TEXT NOT NULL,
  "ledger_currency" TEXT NOT NULL,
  "settlement_currency" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "purpose" "PaymentPurpose" NOT NULL,
  "payment_method" "UniversalPaymentMethod" NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_payment_id" TEXT,
  "status" "OianoPaymentStatus" NOT NULL DEFAULT 'CREATED',
  "platform_fee_minor" BIGINT NOT NULL,
  "merchant_net_minor" BIGINT NOT NULL,
  "authorized_at" TIMESTAMP(3), "paid_at" TIMESTAMP(3), "failed_at" TIMESTAMP(3), "cancelled_at" TIMESTAMP(3), "refunded_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "oiano_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "oiano_payments_amount_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "oiano_payments_reconcile_check" CHECK ("platform_fee_minor" + "merchant_net_minor" = "amount_minor")
);
CREATE UNIQUE INDEX "oiano_payments_reference_key" ON "oiano_payments"("reference");
CREATE UNIQUE INDEX "oiano_payments_idempotency_key_key" ON "oiano_payments"("idempotency_key");
CREATE INDEX "oiano_payments_payer_id_created_at_idx" ON "oiano_payments"("payer_id","created_at");
CREATE INDEX "oiano_payments_merchant_id_created_at_idx" ON "oiano_payments"("merchant_id","created_at");
CREATE INDEX "oiano_payments_studio_id_created_at_idx" ON "oiano_payments"("studio_id","created_at");
CREATE INDEX "oiano_payments_booking_id_idx" ON "oiano_payments"("booking_id");
CREATE INDEX "oiano_payments_status_created_at_idx" ON "oiano_payments"("status","created_at");

CREATE TABLE "payment_gateway_events" (
  "id" TEXT NOT NULL, "provider" TEXT NOT NULL, "provider_event_id" TEXT NOT NULL, "event_type" TEXT NOT NULL,
  "payment_id" TEXT, "payload_hash" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'RECEIVED', "processed_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_gateway_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_gateway_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "oiano_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payment_gateway_events_provider_provider_event_id_key" ON "payment_gateway_events"("provider","provider_event_id");
CREATE INDEX "payment_gateway_events_payment_id_idx" ON "payment_gateway_events"("payment_id");
