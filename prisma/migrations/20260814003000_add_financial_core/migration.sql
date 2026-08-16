CREATE TABLE "financial_accounts" (
  "id" TEXT PRIMARY KEY, "owner_type" TEXT NOT NULL, "owner_id" TEXT NOT NULL,
  "currency" TEXT NOT NULL, "account_type" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_accounts_identity_key" UNIQUE ("owner_type","owner_id","currency","account_type")
);
CREATE TABLE "ledger_transactions" (
  "id" TEXT PRIMARY KEY, "reference" TEXT NOT NULL UNIQUE, "payment_id" TEXT,
  "refund_id" TEXT, "event_type" TEXT NOT NULL, "currency" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "oiano_payments"("id")
);
CREATE INDEX "ledger_transactions_payment_id_idx" ON "ledger_transactions"("payment_id");
CREATE TABLE "ledger_entries" (
  "id" TEXT PRIMARY KEY, "transaction_id" TEXT NOT NULL, "account_id" TEXT NOT NULL,
  "direction" TEXT NOT NULL, "amount_minor" BIGINT NOT NULL, "currency" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "ledger_transactions"("id"),
  CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_accounts"("id"),
  CONSTRAINT "ledger_entry_positive" CHECK ("amount_minor" > 0),
  CONSTRAINT "ledger_entry_direction" CHECK ("direction" IN ('DEBIT','CREDIT'))
);
CREATE INDEX "ledger_entries_account_id_created_at_idx" ON "ledger_entries"("account_id","created_at");
CREATE TABLE "payment_allocations" (
  "id" TEXT PRIMARY KEY, "payment_id" TEXT NOT NULL, "beneficiary_type" TEXT NOT NULL,
  "beneficiary_id" TEXT NOT NULL, "amount_minor" BIGINT NOT NULL, "currency" TEXT NOT NULL,
  "allocation_type" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "oiano_payments"("id"),
  CONSTRAINT "payment_allocation_positive" CHECK ("amount_minor" > 0)
);
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");
CREATE TABLE "oiano_refunds" (
  "id" TEXT PRIMARY KEY, "reference" TEXT NOT NULL UNIQUE, "idempotency_key" TEXT NOT NULL UNIQUE,
  "payment_id" TEXT NOT NULL, "amount_minor" BIGINT NOT NULL, "currency" TEXT NOT NULL,
  "reason" TEXT NOT NULL, "provider_refund_id" TEXT, "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completed_at" TIMESTAMP(3),
  CONSTRAINT "oiano_refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "oiano_payments"("id"),
  CONSTRAINT "refund_amount_positive" CHECK ("amount_minor" > 0)
);
CREATE INDEX "oiano_refunds_payment_id_idx" ON "oiano_refunds"("payment_id");
CREATE TABLE "financial_audit_events" (
  "id" TEXT PRIMARY KEY, "actor_id" TEXT, "action" TEXT NOT NULL, "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL, "metadata" JSONB NOT NULL DEFAULT '{}', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "financial_audit_events_entity_type_entity_id_created_at_idx" ON "financial_audit_events"("entity_type","entity_id","created_at");
CREATE TABLE "financial_profiles" (
  "id" TEXT PRIMARY KEY, "owner_type" TEXT NOT NULL, "owner_id" TEXT NOT NULL, "country" TEXT NOT NULL,
  "verification_status" TEXT NOT NULL DEFAULT 'NOT_STARTED', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "financial_profiles_owner_key" UNIQUE ("owner_type","owner_id")
);
CREATE TABLE "payout_destinations" (
  "id" TEXT PRIMARY KEY, "financial_profile_id" TEXT NOT NULL, "type" TEXT NOT NULL, "country" TEXT NOT NULL,
  "currency" TEXT NOT NULL, "provider" TEXT NOT NULL, "provider_destination_id" TEXT NOT NULL,
  "display_name" TEXT NOT NULL, "masked_reference" TEXT NOT NULL, "verification_status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "is_default" BOOLEAN NOT NULL DEFAULT false, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payout_destinations_profile_fkey" FOREIGN KEY ("financial_profile_id") REFERENCES "financial_profiles"("id")
);
CREATE TABLE "oiano_payouts" (
  "id" TEXT PRIMARY KEY, "reference" TEXT NOT NULL UNIQUE, "idempotency_key" TEXT NOT NULL UNIQUE,
  "financial_account_id" TEXT NOT NULL, "destination_id" TEXT NOT NULL, "amount_minor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'REQUESTED', "provider" TEXT NOT NULL,
  "provider_payout_id" TEXT, "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processing_at" TIMESTAMP(3), "completed_at" TIMESTAMP(3), "failed_at" TIMESTAMP(3),
  CONSTRAINT "oiano_payouts_account_fkey" FOREIGN KEY ("financial_account_id") REFERENCES "financial_accounts"("id"),
  CONSTRAINT "oiano_payouts_destination_fkey" FOREIGN KEY ("destination_id") REFERENCES "payout_destinations"("id"),
  CONSTRAINT "payout_amount_positive" CHECK ("amount_minor" > 0)
);
CREATE FUNCTION prevent_ledger_mutation() RETURNS trigger AS $$ BEGIN
  RAISE EXCEPTION 'Ledger entries are immutable; post a reversal instead';
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
