**The frozen-wallet flow labels unpaid studio-settled sessions as booking summaries, not receipts.**

Booking details now link to a "Booking summary" while wallet payments are frozen.
The printable document identifies the session and, for cash-provider records, labels
the state "DUE AT STUDIO" or "PAID AT STUDIO" according to the payment record.
The receipt wording remains for the explicitly enabled wallet flow.

## Evidence

| Check | Result |
|---|---|
| `npm run test --workspace=apps/web -- src/lib/bookingDocument.test.ts src/pages/studioTimeDisplay.test.ts` | 7 passed |
| `npm test --workspace=apps/web` | 283 passed across 33 files |
| `npm run typecheck --workspace=apps/web` | Passed |
| `git diff --check` | Passed |

This changes presentation only and does not record, settle, or alter any payment.
