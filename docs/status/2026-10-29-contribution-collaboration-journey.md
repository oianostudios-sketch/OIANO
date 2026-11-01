**A synthetic producer–songwriter pair accepted a contribution and exchanged project messages that persisted across reloads and account switches, closing the collaboration evidence gap in [the service-value validation](./2026-10-29-service-value-validation.md).**

## What was unproven

The earlier browser rehearsal had no active project or contribution, so invitation acceptance and real project collaboration were not demonstrated. This rehearsal used a new checkout-local database and synthetic accounts to test that path through the browser UI.

## Evidence

| Check | Result |
|---|---|
| Startup | API and Vite were running against the checkout-local test database; both served the browser journey. |
| Invitation | A producer created a project and invited a songwriter. The artist claimed the link, reviewed the project and role, and accepted. The contribution appeared as `ACTIVE` in both the artist contribution record and producer project team. |
| Artist message | Project conversation POST returned HTTP 201. The artist's message remained visible after reload. |
| Producer access | After signing in as the producer, the project showed the active songwriter and the artist's persisted message. |
| Producer reply | Project conversation POST returned HTTP 201. The producer's reply remained visible after reload. |
| Artist read-back | After switching back to the artist, both messages were visible in the accepted contribution workspace. |
| Access boundary | Opening the producer project editor as the artist displayed the expected access-boundary screen; the accepted contribution workspace remained available. |
| Database | The fresh local database contained 4 synthetic users, 2 projects, 2 participants and 3 project messages after the rehearsals. |

This was an interactive browser rehearsal, not a checked-in CLI E2E test suite. No project source code was changed. The previous automated test, integration, build, typecheck and secrets results are recorded in [the preceding service-value record](./2026-10-29-service-value-validation.md); they were not rerun here.

An initial browser action reloaded before its message request had completed, so that attempt was not counted. The evidence above comes from retries that awaited HTTP 201 and verified the messages after reload.

## Service value demonstrated

OIANO connected a project lead to a named creative contributor, made the requested role and project context reviewable before acceptance, recorded the accepted participation, and kept a two-sided work conversation attached to the project. The collaboration was visible to both accounts after authentication changes and reloads.

## Not exercised

- An unrelated third account attempting to read or message the project.
- Booking or fulfilling a studio session, deliverables or file exchange.
- Credit assignment, rights proposals, consent, ownership, or any financial flow.
- A deployed environment, external integrations, or physical-device behavior.
- A replayable browser test file or CI E2E report.

## Observed, not changed

- Artist onboarding's “Not Yet” choice persisted as `UNAVAILABLE` for the account used in this rehearsal.
- The browser's notification-stream request was aborted during logout/navigation; no application failure was observed.
- Synthetic accounts and project records remain in the checkout-local test database. The database was not pruned.
- The wording and personality of the login experience were not changed during this validation.
