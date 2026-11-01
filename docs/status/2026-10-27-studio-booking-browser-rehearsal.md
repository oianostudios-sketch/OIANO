**T04 local studio scope, booking-message retry and artist attachment/detachment are now browser-rehearsed; the local readiness blocker is cleared, not production readiness.**

This supersedes the unresolved-startup and unexecuted-journey status in
[the previous attempt](2026-10-27-studio-rehearsal-startup-blocker.md).
Those earlier deadline failures remain valid historical results. No product,
permission, schema, payment or infrastructure change was needed.

## Startup diagnosis

The supported `npm run dev:local` runner was traced using a session-only Node
preload. It used the checkout-owned PostgreSQL cluster and `oiano_dev_test`, with
external integrations disabled by the runner.

| Signal, UTC | Observed |
|---|---|
| Local runner process started | 11:38:36.407 |
| API child preload started | 11:39:29.726 |
| API listened on IPv4 port 4000 | 11:41:45.026 |
| First captured successful direct health response | 11:42:00.565; HTTP 200, database connected |
| Follow-up multi-address health observer | Exit 0; `127.0.0.1` and `localhost` both HTTP 200, database connected |

Runner-to-listen was approximately 189 seconds; API-child-to-listen was 135.3
seconds. Synchronous module imports occupied most of the API initialization.
The eager `@sentry/node` load took 62.2 seconds even with Sentry disabled;
the payments route's nested Stripe import took 14.7 seconds. These are inclusive,
nested wall times and must not be added together. The trace writes synchronously,
so these instrumented timings are not an uninstrumented benchmark or production
startup prediction. The underlying machine/dependency-loading slowdown was not
established.

The initial 180-second observer started before npm/local-runner initialization
and expired before the listener existed (exit 1). The already-running process
subsequently became healthy; it was not restarted again. IPv6 loopback refused
connections while both IPv4 loopback and `localhost` succeeded, consistent with
the IPv4 listener. A Vite page or startup banner alone was not used as readiness.
Future rehearsal observers should use a bounded budget of at least 300 seconds
from task launch and still require an actual database-backed health response.
This changes the rehearsal procedure, not application timeouts or infrastructure.

## Browser evidence

Interactive Playwright assertions ran against the real local API and database,
using isolated browser contexts and five synthetic accounts. Fixture setup
independently checked the database name and this checkout's PostgreSQL data
directory before creating three studios, three zero-value bookings and a project.
No payment, wallet, refund or ledger operation was exercised.

| Scenario group | Observed result |
|---|---|
| Staff studio scope | A staff account with two memberships and no active studio was sent to selection. Choosing beta persisted after reload and returned only its booking. Switching to alpha returned only its two bookings. |
| Refused access | Switching to an unrelated studio returned 403 and left the selected studio unchanged. Unrelated staff booking-message GET/POST returned 404; anonymous GET returned 401. |
| Artist booking scope | The artist saw their two bookings across studios, not another artist's booking (404). Producer attachment returned 403 and attaching another artist's booking returned 404. |
| Booking conversation recovery | Injected GET 503 displayed the explicit load error; retry recovered. Injected POST 503 displayed the send error and retained the exact draft. Retry saved exactly one matching message; reload preserved it. Anonymous read returned 401. |
| Artist attach/detach | UI attachment persisted after reload; producer booking and existing message history became readable (200). UI detachment persisted after reload and removed producer booking/message reads and message writes (404). |

All three final scenario groups completed without assertion failures. These are
interactive browser results, **not a CLI E2E suite with an exit code**. Saved
session replay modules were syntax-checked (exit 0), not run as an assembled
module suite. A first booking attempt timed out at the sign-in button; the
successful attempt signed in before installing the injected-failure routes.
An attachment harness initially used an incorrect API mount and failed parsing
its HTML 404 response; correcting it to `/api/artist-projects` allowed the full
scenario to run. Neither failed harness attempt is counted as a pass or evidence
of a product defect.

Existing automated evidence, including the 264-test fresh-database checkpoint,
was not rerun unnecessarily. No product code changed and no new mutation-test
claim is made.

## Cleanup and verification

- Archived the synthetic project, detached the fixture bookings, randomized all
  five password hashes and incremented their authentication versions.
- Verified all five previously issued tokens returned 401, and the previous
  synthetic artist password was refused. Removed the transient fixture manifest
  and browser session-storage credentials; closed all rehearsal contexts.
- Stopped only the verified diagnostic runner's process tree. Checkout-owned
  PostgreSQL remained running; `db:local:status` exited 0.
- Removed the generated task definition, preserving existing local VS Code
  settings, unrelated documentation/proposals and PR #54's original branch.
- Secrets scan and changed Markdown local-link/whitespace checks passed.
- No push, deployment, production access, participant contact or publication.

## Not exercised

Physical-phone/touch verification remains explicitly owner-deferred. This run
did not establish booking-message live-recipient/reconnect behavior, real media
delivery, deployed parity, backup restore, email, payments or real participant
acceptance. T04 remains partial, and the production/canonical migration gates
remain unchanged.

## Observed, not changed

The eager disabled-Sentry import is a measured candidate for a separate, focused
startup improvement, not a proven machine-level root cause or permission to
change enabled error reporting. Stripe behavior was left untouched.

The next priority is owner-sent intake and authorized operational evidence
(T01/T05), not speculative architecture work or a repeated full audit. Booking
live delivery and the agreed physical-device setup remain separate rehearsal
gaps.
