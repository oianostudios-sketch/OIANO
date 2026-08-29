# Oiano Payments

OIANO records operational payment state and posts every settled money movement
to an immutable double-entry reconciliation ledger. `Payment` remains the
booking-facing status record; `FinancialTransaction` and
`FinancialLedgerEntry` provide the accounting evidence beneath it.

Two things share the `/api/payments` prefix, and they're not the same
system:

## Booking payments — Stripe Checkout, one-shot

- `POST /api/payments/stripe/checkout-session` — creates a Stripe Checkout
  session for a single booking's total. On success, Stripe redirects back
  and the webhook below marks the booking paid.
- The record of a booking payment is the legacy `Payment` model
  (`prisma/schema.prisma`), one row per booking (`booking_id` is unique).
  `Payment.status` answers "did this booking get paid?" while the financial
  ledger allocates cash or wallet liability to studio payable and configured
  OIANO platform revenue.

## Wallet — a real signed ledger, not a payment gateway

- `POST /api/payments/wallet/top-up` — Stripe Checkout for adding funds to an
  artist's wallet (separate from paying for a specific booking).
- `GET /api/payments/wallet/transactions` — reads the ledger.
- Every wallet balance change, from any source (top-up, booking debit, admin
  credit), goes through one function: `apps/api/src/lib/walletLedger.ts`'s
  `applyWalletDelta()`. It writes a signed `WalletTransaction` row
  (positive = credit, negative = debit) and updates `Wallet.balance_usd` in
  the same operation — this is why `SUM(WalletTransaction.amount_usd)` always
  equals the wallet balance, and why `findWalletDrift()` (same file) can
  cheaply detect if the two ever disagree.

## Webhooks

- `POST /api/webhooks/stripe` — the only Stripe webhook endpoint. Raw body,
  signature-verified, mounted in `app.ts` *before* `express.json()` runs
  (Stripe signature verification needs the untouched raw body). Idempotency
  is enforced via `StripeWebhookEvent` (unique on the Stripe event ID) —
  replays are detected and skipped, not double-processed.

## Reconciliation ledger

- Wallet bookings: debit wallet liability; credit studio payable and any
  configured platform revenue.
- Stripe bookings: debit cash clearing; credit studio payable and platform
  revenue.
- Wallet top-ups: debit cash clearing; credit wallet liability.
- Partial and full refunds reverse the corresponding studio payable and
  platform revenue allocation and credit cash clearing.
- Each source can post only once. Every transaction must balance to the cent.
- `/api/maintenance/finance` reports unbalanced transactions, missing payment
  entries, missing top-up entries, account balances and wallet drift.

The current system still uses Stripe and wallet funding directly rather than
a multi-provider gateway abstraction. Studio payouts are recorded as payable
but payout execution is a separate controlled phase.
