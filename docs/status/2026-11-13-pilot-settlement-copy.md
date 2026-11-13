**Unpaid pilot bookings now show studio settlement status instead of a generic payment status.**

Booking details identify the cash-provider flow as a studio settlement, label the
displayed amount as the session total, and distinguish amounts due, partially paid,
and paid at the studio. Other providers and the wallet-enabled flow keep existing
payment labels.

## Evidence

| Check | Result |
|---|---|
| `npm run test --workspace=apps/web -- src/lib/bookingPaymentCopy.test.ts src/pages/studioTimeDisplay.test.ts` | 7 passed |
| `npm test --workspace=apps/web` | 286 passed across 34 files |
| `npm run typecheck --workspace=apps/web` | Passed |
| `git diff --check` | Passed |

This is a display-only change. It does not record a payment or change settlement behavior.
