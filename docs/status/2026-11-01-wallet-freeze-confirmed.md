**The wallet freeze is confirmed on the live API: a signed-in top-up request is refused, and commit `b6dbcc2` is the live deploy.**

Follows [2026-11-01-pilot-unpaid-booking.md](2026-11-01-pilot-unpaid-booking.md), which listed deployment as not exercised. This record closes that item for the wallet freeze only.

## Evidence

| Check | Result |
|---|---|
| Render dashboard, `oiano-api` | `b6dbcc2` on `main`, shown as live |
| Live web bundle, read without signing in | Built 07:27 UTC, one minute after the merge; the booking page chunk carries "Nothing is charged here" |
| `POST /api/payments/wallet/top-up`, signed in, sent by the owner from the browser console | 409, "Wallet top-ups are not available" |

The refusal is the first statement in the route after authentication, so a 409 proves the deployed code is running with `WALLET_ENABLED` not set to `true`. It writes nothing and calls no payment provider.

## Not exercised

- `STRIPE_ENABLED` on the live service. `render.yaml` sets it to `false`, but the dashboard value was not read back for this record.
- A booking at $0 in a browser or on a phone. The API and web tests cover it; no live booking was made.

`VITE_WALLET_ENABLED` on `oiano-web` was not read back either. The live site's wallet screens were not inspected, so the web flag rests on its default of off.
