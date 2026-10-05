**A studio can record a cash payment, through the ledger, 2026-10-06.** This closes the
payment half of C26 in
[`OIANO_CANONICAL_ARCHITECTURE_V1_RECONCILIATION.md`](../OIANO_CANONICAL_ARCHITECTURE_V1_RECONCILIATION.md) §8.
The other half, the unclaimable guest account each walk-in creates, is left to the
Identity migration.

**What was wrong.** `POST /api/admin/walkin` books a walk-in with a `cash` payment marked
`UNPAID`, and nothing could ever mark it paid: `PAID` was written only by the wallet
path, the Stripe webhook and payouts. A studio that took cash had no truthful way to say
so, and the ledger never saw the money.

**What changed.**

- `POST /api/admin/bookings/:id/cash-payment` (`apps/api/src/routes/admin.routes.ts`).
  The body must be empty: an amount or anything else is refused with 400, not ignored.
  The amount is the booking's stored `total_usd`. The booking is looked up within the
  caller's studio (`attachStudioScope`, which uses `resolveStaffStudio`), so another
  studio's booking is 404. A cancelled or no-show booking is refused with 409, as is a
  booking already paid, or one whose payment was ever sent to a card checkout or is in
  any state but `UNPAID`. A walk-in's existing `UNPAID` cash row becomes `PAID`; a booking
  with no payment row gets a new `cash` row. A `PENDING` booking becomes `CONFIRMED`; any
  other status is left as it is, the rule the webhook follows (A03). An admin audit entry
  `booking.payment.cash_recorded` is written, and the runsheet shows a "Record cash"
  button for unpaid, open bookings.
- **Concurrency.** The booking row is locked `FOR UPDATE` before the payment is read. The
  claim of an existing row only matches `UNPAID` with no checkout reference, and
  `Payment.booking_id` is unique. Ledger posting is idempotent on the payment id.
- **Ledger** (`apps/api/src/lib/financialLedger.ts`). The payment posts with the existing
  `recordBookingPayment` (provider `cash`), in the same database transaction, so the studio
  is credited its net and OIANO its fee exactly as for a card or wallet payment. That
  alone would be untrue, though: the studio, not OIANO, holds the cash, and a payout would
  then send the studio its net a second time out of OIANO's money. So a second posting,
  the new `recordStudioCollectedCash`
  (source `STUDIO_COLLECTED_CASH`, keyed on the payment id), debits `STUDIO_PAYABLE` and
  credits `CASH_CLEARING` by the gross. The net effect is that `CASH_CLEARING` is
  unchanged, `PLATFORM_REVENUE` gains the fee, and the studio's payable falls by the fee.
  The studio owes OIANO its fee, which comes out of its next card or wallet payout.
- **Permission (a choice the owner can revisit).** Recording requires the studio
  membership's `MANAGE_BOOKINGS` capability, or a `STUDIO_ADMIN` membership with no
  capabilities at all (the legacy owner, the pattern in `studio-policy.routes.ts`). No
  capability names payments; `VIEW_FINANCE` reads money and was judged not to cover
  recording it. The route sits under `adminRouter`, so the user's role must also be
  `STUDIO_ADMIN`.

**Evidence.** `apps/api/src/integration/cash-payment.integration.test.ts` has 10 subtests,
all passing on a fresh local database. They cover the following:

- A walk-in is recorded as paid. The payment is `cash`, `PAID`, for the booking total.
  Both ledger transactions balance, reconciliation finds the payment on the ledger, and
  the studio's payable is −10 on a $100 booking at 10%. A payout is refused, and the
  audit entry is written.
- A pending booking is confirmed by the payment.
- A second recording is refused with 409 and changes nothing.
- Two concurrent recordings, forced through the money-integrity barrier, produce one 201
  and one 409, with one payment, one posting of each kind and one audit entry. This is
  tested for a walk-in and for a booking with no payment row.
- Cancelled and no-show bookings are refused with 409, including a walk-in cancelled
  through the status route.
- Another studio's staff get 404.
- Staff with `VIEW_FINANCE`/`MANAGE_CALENDAR` only, and an `ENGINEER` membership, get 403.
- A client-supplied amount is refused with 400, and the amount paid is the booking total.
- A booking with a card checkout under way is refused.

Each rule was put back with a scripted mutation. The file was restored from a `cp` backup
each time, and `cmp` confirmed it byte-identical. Each mutation failed its intended test:

- Without the ledger posting, 5 subtests fail, including the walk-in balance test and both
  races.
- Without the cash-kept posting, the walk-in test fails (payable +90, payout reserved), and
  so do both races.
- Accepting a client amount fails the amount test.
- Without the closed-booking refusal, the cancelled/no-show test fails.
- Without the row lock and with an unconditional claim, the walk-in race fails with two
  201s. The no-payment-row race still holds through the unique constraint.
- Without the studio scope in the lookup, the other-studio test fails.
- Without the permission check, the 403 test fails.

Both typechecks pass. `npm test` passes: API unit 102/102, intelligence 31/31 and web
85/85. `npm run test:integration:local` passes 125/125, which is 114 before plus the 11
here. `npm run build` passes, and `npm run security:secrets` passes over 449 files.

**Not exercised.** The runsheet button was typechecked but not driven in a browser. Live
updates after a pending booking is confirmed are not asserted. A cash payment on a studio
whose `platform_fee_bps` is 0 posts only the gross pair, and no test covers it.

**Observed, not changed.**

- Every walk-in still creates a new guest `User` and `Artist` with no password, which no
  one can claim. This is the Identity half of C26.
- A cash payment has no refund path. The refund handling is Stripe's webhook, matched by
  `payment_intent_id`, which a cash payment never has.
- Charging OIANO's platform fee on cash taken at the desk is a commercial position. It
  follows from posting cash like every other booking payment, and the owner may decide
  otherwise. A studio whose payable goes negative this way cannot be paid out until card
  or wallet income covers the fee: `reserveStudioPayout` refuses at zero or below.
- The walk-in route's own conflict check misses a booking that encloses the new one. It
  checks only the edges, as the reschedule route once did.
