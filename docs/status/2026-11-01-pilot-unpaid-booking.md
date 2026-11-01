**An artist can now book with an empty wallet: while the wallet is frozen, a booking takes no money and is settled at the studio. Findings C1 and H5 of the readiness audit are closed on this branch.**

Implements the owner's decisions of 2026-11-01, recorded in [DECISIONS.md](../internal-rollout/DECISIONS.md): the first pilot moves no money through OIANO, and the wallet is frozen.

## What changed

- `WALLET_ENABLED` is off unless set to `true`. With it off, `POST /api/bookings` debits nothing, posts nothing to the ledger and creates an `UNPAID` payment with provider `cash`. Wallet balances stay as they are.
- Staff settle through the existing `POST /api/admin/bookings/:id/cash-payment`, which posts to the ledger and confirms the booking.
- Wallet top-ups answer 409 while frozen.
- Stripe routes now need `STRIPE_ENABLED=true` as well as a key. A key alone previously opened checkout, top-up and payout routes. A payout refuses before reserving anything.
- A cancelled or no-show session no longer counts as an outstanding balance on `/api/context`.
- `VITE_WALLET_ENABLED` is the web build's matching flag, off unless set. The booking page drops the wallet gate, balance and credit copy and says the artist pays the studio directly. Booking detail replaces the card button on these bookings. Home hides the credit tile.

Studio policies now evaluate these bookings as `{ deposit_percent: 0, timing: 'AT_STUDIO', method: 'CASH' }`, so a studio policy that demands upfront payment will refuse them.

## Evidence

| Check | Result |
|---|---|
| `npm run test:integration:local`, fresh database, 21 migrations | 273 of 273 |
| `npm test` | 5, 128, 31 and 275 pass |
| API and web typechecks, `npm run build`, `npm run security:secrets` | Pass; 634 tracked files scanned |
| Wallet paying again (`walletPays` forced true) | All subtests of the new suite failed; restored |
| Cancelled session counted as owed | "a cancelled session leaves nothing owed" failed; restored |

The suite runner sets `WALLET_ENABLED=true`, because existing suites still hold wallet behaviour for when the freeze lifts. `pilot-unpaid-booking.integration.test.ts` covers the frozen path.

`platform.integration.test.ts` previously cancelled a booking and expected its unpaid balance to lead. It now moves the session 60 days out, which is what its comment describes: removing the time pressure.

The first run of the new test deleted `STRIPE_ENABLED`, and `app.ts` refilled it from `apps/api/.env`, so one checkout request reached Stripe with a fake key and was refused. Nothing was charged. The test now sets its flags explicitly. It also shows that the flag gate is what stops that call.

## Not exercised

Booking at $0 in a browser, the changed screens on a phone, any deployment. The web changes have typecheck, build and existing-suite coverage only. Artist cancellation is still missing (H9), and cancellation terms await decision D3.
