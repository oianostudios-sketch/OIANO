**The runsheet offers cash recording only when the server would accept it.**

The studio runsheet previously showed "Record cash" for any positive unpaid booking,
including payments whose state or checkout references made cash recording invalid.
A shared eligibility check now governs both the cash-payment endpoint and the admin
and engineer runsheet responses. The web action is shown only when the server-derived
`can_record_cash` flag is true; checkout references are not included in the response.
The cash endpoint keeps its existing rejection messages and money-writing behavior.

## Evidence

| Check | Result |
|---|---|
| `npm run test:security --workspace=apps/api` | 131 passed |
| `npm run typecheck --workspace=apps/api` | Passed |
| `npm run typecheck --workspace=apps/web` | Passed |
| `npm test --workspace=apps/web` | 289 passed across 35 files |
| `npm run test:integration:local` | 274 passed, including runsheet eligibility on an isolated local database |
| `npm run security:secrets` | Passed |
| `git diff --check` | Passed |

Removing the checkout-reference checks from the shared predicate made the focused
eligibility test fail on an unpaid payment with a checkout reference. The checks were
restored, and the focused test passed (3 tests).

## Not exercised

The engineer runsheet endpoint was not directly exercised by the integration test;
it uses the same predicate as the admin endpoint. No production database or live
payment provider was used.
