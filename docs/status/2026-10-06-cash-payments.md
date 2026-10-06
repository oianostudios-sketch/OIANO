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
- **No platform fee on cash (owner decision, 2026-10-06).** OIANO takes no fee on cash a
  studio collects for a walk-in. `CASH_PLATFORM_FEE_BPS = 0` in
  `apps/api/src/lib/financialLedger.ts` is the fee the cash path posts with. Card and
  wallet payments, and each studio's `platform_fee_bps`, are unchanged.
- **Ledger** (`apps/api/src/lib/financialLedger.ts`). Both postings run in the same
  database transaction as the payment:
  - The payment posts with the existing `recordBookingPayment` (provider `cash`) at that
    zero fee. With no fee, `bookingAllocation` gives the whole gross to the studio, and
    `recordBookingPayment` writes no line for a zero amount, so no `PLATFORM_REVENUE` line
    exists.
  - That alone would be untrue: the studio, not OIANO, holds the cash, and a payout would
    send it the gross a second time out of OIANO's money. So the new
    `recordStudioCollectedCash` (source `STUDIO_COLLECTED_CASH`, keyed on the payment id)
    debits `STUDIO_PAYABLE` and credits `CASH_CLEARING` by the gross.

  For a $100 cash walk-in at a studio whose card rate is 10%:

  | Transaction | Debit | Credit |
  |---|---|---|
  | `BOOKING_PAYMENT` | `CASH_CLEARING` 100 | `STUDIO_PAYABLE` 100 |
  | `STUDIO_COLLECTED_CASH` | `STUDIO_PAYABLE` 100 | `CASH_CLEARING` 100 |

  Each transaction balances. `STUDIO_PAYABLE` and `CASH_CLEARING` each net to zero: the
  studio is owed nothing and owes nothing for the cash.
- **Permission (a choice the owner can revisit).** Recording requires the studio
  membership's `MANAGE_BOOKINGS` capability, or a `STUDIO_ADMIN` membership with no
  capabilities at all (the legacy owner, the pattern in `studio-policy.routes.ts`). No
  capability names payments; `VIEW_FINANCE` reads money and was judged not to cover
  recording it. The route sits under `adminRouter`, so the user's role must also be
  `STUDIO_ADMIN`.

**Evidence.** `apps/api/src/integration/cash-payment.integration.test.ts` has 10 subtests,
all passing on a fresh local database. They cover the following:

- A walk-in is recorded as paid. The payment is `cash`, `PAID`, for the booking total.
  On a $100 booking at a 10% studio, no `PLATFORM_REVENUE` line is posted. Both ledger
  transactions balance, `STUDIO_PAYABLE` and `CASH_CLEARING` net to zero, and
  reconciliation finds the payment on the ledger. A studio already owed $40 is still owed
  $40, and a payout reserves exactly $40. The audit entry is written.
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
- Without the cash-kept posting, the walk-in test fails (the cash would become payable),
  and so do both races.
- With the studio's own 10% fee on cash, the walk-in test fails (the studio is credited
  90, not 100), and so do both races (payable −5, not 0).
- Accepting a client amount fails the amount test.
- Without the closed-booking refusal, the cancelled/no-show test fails.
- Without the row lock and with an unconditional claim, the walk-in race fails with two
  201s. The no-payment-row race still holds through the unique constraint.
- Without the studio scope in the lookup, the other-studio test fails.
- Without the permission check, the 403 test fails.

These results are after merging `origin/main` (#21–#23). Both typechecks pass. `npm test`
passes: API unit 102/102, intelligence 31/31 and web 88/88.
`npm run test:integration:local` passes 148/148, including the 11 here. `npm run build`
passes, and `npm run security:secrets` passes over 461 files.

**Not exercised.** The runsheet button was typechecked but not driven in a browser. Live
updates after a pending booking is confirmed are not asserted.

**Observed, not changed.**

- Every walk-in still creates a new guest `User` and `Artist` with no password, which no
  one can claim. This is the Identity half of C26.
- A cash payment has no refund path. The refund handling is Stripe's webhook, matched by
  `payment_intent_id`, which a cash payment never has.
- The walk-in route's own conflict check misses a booking that encloses the new one. It
  checks only the edges, as the reschedule route once did.
