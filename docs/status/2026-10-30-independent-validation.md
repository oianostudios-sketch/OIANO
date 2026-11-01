**The current creative-work service has three repeatable multi-account lifecycle journeys, role-correct legacy profile routes and account-isolated client state. All local release checks pass; production migration remains gated.**

Completed the [independent work plan](2026-10-30-independent-work-plan.md).
This adds verification and repairs the current product; it does not introduce a
second identity model, public opportunities or canonical SKY.

## What changed

- Added three automatically discovered API integration files and a shared local
  journey fixture. Each creates synthetic identities and a project, uses real HTTP
  actions against real PostgreSQL, checks missing-auth/unrelated-account boundaries
  and reads persisted results. Servers and Prisma connections close in teardown.
- `/profile` and `/passport` now authenticate before resolving the destination:
  artist Passport, professional Passport, or the existing operational Home for
  engineers/studio/platform operators. Sign-in retains the original alias/query;
  authenticated redirects retain query and fragment. Explicit artist/professional
  page permissions remain unchanged.
- The real browser account switch exposed a confirmed defect: the lead's
  authenticated API response named the lead while Passport still displayed the
  previous collaborator's cached profile. An account-keyed query provider now owns
  a separate cache per identity, remounts component/draft/toast state on account
  change and clears old query/mutation caches. Same-account token refresh preserves
  the current cache and draft.
- Closely related interceptor regressions proved that a late old-session 401 could
  log out the new account and an old 409 could redirect it to studio selection.
  Those global effects now require the request's bearer token to match the current
  session. The original error still reaches its caller.

## Service value verified

| Journey | Verified result |
|---|---|
| Invitation -> claim -> accept | Claiming alone grants no workspace or project conversation. Acceptance enables authorized collaboration. |
| Decline/correction -> replacement invitation | Correction requires a note; both answers remain distinct from accepted work. Notes persist. Answered links cannot silently reopen participation; removal/new invitation preserves old records. |
| Active work -> messages -> removal | Lead and contributor exchange persisted messages. Outsider/anonymous writes fail. Removal revokes workspace and message access without erasing the conversation. |
| Contribution -> credit | Confirmed attribution remains public and cannot be withdrawn by the lead; a disputed credit remains separate and nonpublic. |
| Contribution -> rights decision | Only named, accepted identities respond. Dispute requires explanation. Approved/disputed agreements and decision evidence persist independently of credits. |
| Account switch | New account sees its own profile without reload; old private cache, drafts and late authentication failures do not carry into it. |

## Evidence

All commands below exited 0 in the final run.

| Verification | Result |
|---|---|
| `npm test` | 5 secret-scanner tests, 128 API library tests, 31 intelligence tests, 275 web tests in 30 files; no failures |
| `npm run test:integration:local` | 267 passed, 0 failed/skipped/cancelled/todo; all 21 migrations applied to a fresh checkout-local database |
| Both workspace typechecks | Passed |
| `npm run build` | Shared package, API and web passed; Vite printed a nonblocking plugin-timing diagnostic |
| `node --test scripts/production/safety.test.cjs` | 37 passed; no production connection |
| `node --test scripts/production/readonly.database-test.cjs` with explicit local `INTEGRATION_DATABASE_URL` | 1 passed: actual restricted reader, denied writes/privilege regressions, parity success and intentional schema-drift refusal |
| Fresh local migration/schema comparison | 21 migrations; `prisma migrate diff --from-url <explicit-local-test-url> --to-schema-datamodel prisma/schema.prisma --exit-code`: exit 0, no difference |
| `npm run db:verify-baseline` with explicit local `DATABASE_URL` and `NODE_ENV=test` | 41 baseline tables, 55 foreign keys; scratch schema removed |
| `npm run security:secrets` | Passed across 594 tracked files; new task files additionally scanned using the same scanner |
| `git diff --check` | Passed |

### Tests proved against defects

- Legacy routes: 10 of the original 14 new assertions failed before the route fix.
  Final route suite has 16 passing tests, including query/fragment retention.
- Account cache boundary: both original tests failed with the old shared-cache
  behavior; final suite has three passing tests, including Strict Mode and
  same-account token refresh.
- Late-session interceptor: both new 401/409 cases failed before the token guard.
- Temporarily admitted claimed-but-unaccepted workspaces: access journey failed
  on 200 instead of 404.
- Temporarily allowed withdrawing confirmed credits: evidence journey failed
  on 200 instead of 409.
- Temporarily allowed reopening an answered invitation, with workspace checks
  restored: response journey failed on 200 instead of 409.
- All temporary backend mutations were restored; the three existing backend
  source files have no final diff. A new full integration run then passed 267/267.
- The first broad run's only failure was a new test expecting `sender_id` instead
  of the established `sender.id` response. The test contract was corrected, not
  the API. Final counts above are from the subsequent successful run.

### Real browser

Used task-owned API 4187 and web 5187 on a new, migrated checkout-local database.
Both returned HTTP 200 before browser actions. No response fixtures or mocked API
data were used.

- Three synthetic accounts created over HTTP. Professional signs in through
  `/profile?section=credits`, reaches its own Passport, claims the link, explicitly
  accepts and opens its workspace.
- Contributor sends a message; POST 201 followed by reload/read-back proves
  persistence. Accepted collaboration appears on professional Home.
- Lead signs in, reads the contributor's message, replies and proposes a credit
  through the UI. Contributor signs back in without a page reload, sees the correct
  profile, reads the lead's reply and confirms the credit. Reload shows CONFIRMED.
- After removal, sending from the already-open workspace receives 404, displays
  an explicit send failure and retains the unsent draft. Reload shows Workspace
  unavailable. Final HTTP read-back confirms three saved messages, no rejected
  draft, one confirmed credit, outsider 404 and anonymous 401.
- Home, Network, Discover and the accepted workspace had no horizontal overflow
  at 320, 390 and 1440 pixels: 12 layout assertions.
- The integrated browser tool does not expose a process exit code or produce a
  standalone replay suite. Successful final assertions are recorded here; the
  three persisted API journey files are the repeatable automation. Earlier
  selector/response-shape mistakes in browser snippets were corrected.

## Not exercised

- Production schema parity, production privileges, deployment, external billing,
  email delivery, storage uploads, real settlement or legal enforceability.
- Browser UI for rights proposals, deliverable review and declined/correction
  paths; API journeys and existing integration suites cover their relevant
  contracts, not all browser presentations.
- Offline mode did not reliably force an HTTP failure: the browser queued the
  request until connectivity returned. Do not treat this as proof of offline retry.
  The actual revoked-access failure/draft-retention path was verified instead.
- Full accessibility conformance, load testing and exhaustive coverage of every
  role/screen are not established by this batch.

## Observed, not changed

The legacy professional Passport still shows a profile-completeness percentage.
This batch did not turn it into network reputation or alter the frozen architecture.
Local schema parity does not waive the production parity/configuration and complete
gate sign-off requirements in the [stabilization gate](../OIANO_STABILIZATION_GATE.md).

## Cleanup and persistence

Synthetic browser auth and the task's session fixture were removed. Task-owned
API/web processes were stopped. Disposable test databases remain local for
diagnosis; the existing PostgreSQL cluster and other worktree changes were left
alone. No staging, commit, push, production access, schema change or money write
behavior change was performed.
