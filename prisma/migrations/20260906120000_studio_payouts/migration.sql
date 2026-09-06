-- Studio payouts: the settlement record for money leaving OIANO.
-- STUDIO_PAYABLE has accrued in the ledger since the first booking with no way
-- out. A payout row is created in the same transaction that debits that payable,
-- which is what prevents two concurrent requests from paying the same balance
-- twice; status tracks the external transfer, which can fail after the ledger
-- has already moved.
CREATE TABLE "studio_payouts" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL,
    "amount_usd" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "stripe_transfer_id" TEXT,
    "failure_reason" TEXT,
    "requested_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_payouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "studio_payouts_studio_id_created_at_idx" ON "studio_payouts"("studio_id", "created_at");

CREATE INDEX "studio_payouts_status_idx" ON "studio_payouts"("status");

ALTER TABLE "studio_payouts" ADD CONSTRAINT "studio_payouts_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
