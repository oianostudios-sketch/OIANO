**The current OIANO build passed its automated suites and a local, read-only artist journey; core collaboration value remains unproven in-browser without an active project and contribution fixture.**

## What was validated

The checkout's guarded `npm run dev:local` flow started the web app and API against this checkout's `oiano_dev_test` database on its local PostgreSQL cluster. The API health endpoint returned HTTP 200 with the database connected. No production service, shared database, external integration or participant was used.

The interactive browser session signed in as a local demo Artist and visited Home, Projects, Contributions, Discover, the public artist profile, the Artist Passport, Communications, Account and the studio booking flow. It verified:

- Home shows the person's identity and real next steps, and distinguishes no linked projects or upcoming sessions from loaded work.
- Projects and Contributions render explicit empty states and route toward the next action rather than presenting fabricated work or decisions.
- Discover search narrowed the local roster to two matching profiles; the Pop filter exposed its pressed state and reduced results to one. Opening a profile showed the supplied creative profile and Passport route.
- Passport presented the Artist's creative identity, profile attributes, release and Studio Circle permission explanation.
- Communications showed its five work-context categories and an explicit empty state.
- Account described the signed-in Artist identity, responsibilities and current account-protection state.
- Booking advanced through studio, service, room, date/time and final review. The review showed the selected studio and service, $25 total, the $500-to-$475 post-booking balance, and that credit is deducted only on submission and confirmation remains pending with the studio.

The booking was deliberately **not submitted**. No booking, charge, connection, message, profile edit, contribution decision, rights/consent response or other business mutation was made.

Eight authenticated routes (`/dashboard`, `/projects`, `/contributions`, `/discover`, `/artist/passport`, `/communications`, `/access`, `/book`) were checked at 320, 390 and 1440 CSS px: 24 route/viewport combinations, with no document horizontal overflow.

## Automated evidence

| Check | Result |
|---|---|
| `npm test` | Passed: secrets checks 5/5, API security 128/128, intelligence 31/31, web 223/223 |
| `npm run test:integration:local` | Passed: 264/264 on a fresh checkout-local database |
| `npm run build` | Passed: shared package, API and web production build |
| `npm run typecheck --workspace=apps/api` | Passed |
| `npm run typecheck --workspace=apps/web` | Passed |
| `npm run security:secrets` | Passed across 594 tracked files |
| `git diff --check` | Passed; existing line-ending notices only |

The browser exercise used the integrated VS Code browser against the running local app. It was an interactive rehearsal, not a checked-in Playwright CLI suite with a replayable report or process exit code.

## Service value and limits

The build now makes the service's intended progression legible: establish a creative identity, find people, review contribution invitations, coordinate project work, and request a studio session with its cost and approval boundary visible. This rehearsal verified that the surfaces connect and that empty states explain the next action.

It did **not** prove the central collaboration outcome end-to-end: this Artist had no linked project, active contribution, upcoming session or conversation. Thus project delivery, contributor acceptance, real collaboration, session fulfillment and persistent professional evidence were not demonstrated in this browser session. The fresh-database integration suite passed, but that is complementary evidence and not a substitute for an active seeded user journey.

Separate 27 October browser rehearsals already document a loaded Artist Home → selected project → Passport path, cross-account contributor messaging, and studio scope plus booking attach/detach behavior in [the creative identity journey](2026-10-27-creative-identity-work-journey.md), [the contributor rehearsal](2026-10-27-contributor-browser-rehearsal.md), and [the studio rehearsal](2026-10-27-studio-booking-browser-rehearsal.md). Those are earlier evidence, not flows rerun in this validation.

The local demo database contains records with synthetic/test names from prior rehearsals. Discover and booking pages exposed some of them. They were not changed or removed; do not treat this local roster as a clean production-like service-value sample.

## Not exercised

- Submitting a booking or exercising any ledger, wallet, Stripe, payout or refund behavior.
- Creating and accepting a contribution, opening an accepted workroom, sending a message, or persisting project files and credits in the browser.
- Studio-side approval or session completion, actual availability fulfillment, external storage/mail, deployed production parity, physical devices or participant acceptance.
- A CLI-driven browser suite and reusable E2E test artifacts.

## Cleanup

The demo account was signed out in the browser. The task-owned `dev:local` API and web process was stopped. The checkout-owned PostgreSQL cluster and test databases were left intact; no broad prune or cleanup was run. Existing unrelated worktree changes remain untouched.
