**A credit an invited contributor confirmed on someone else's project now reaches their Passport. It shows publicly only when both existing consents hold, and it stays private otherwise. No schema change.**

Follows the 2026-11-18 rehearsal recorded in [2026-11-18-artist-started-projects.md](2026-11-18-artist-started-projects.md) (PR #59), where these two steps failed:
- "Contributor portfolio lists the confirmed work"
- "Public Passport shows the confirmed credit"

## Where it dropped out

- **What worked:** the contributor confirms the credit (`PATCH /api/contributions/credits/:id/respond`), which sets `status = CONFIRMED` and `is_public = true` on `ProjectCredit`. The credit was then counted only in `GET /api/network-metrics`, and only for engineers.
- **Where it stopped:** `GET /api/passport/portfolio` and `GET /api/passport/public/:code` read only `artist.projects`, which are projects where the contributor is the named artist. No Passport read looked at `project_credits`.

## Publication consent: existing fields

| Field | Who sets it | How |
|---|---|---|
| `ProjectCredit.is_public` | The credited contributor only | Their own CONFIRM (`contributions.routes.ts`); staff completion always writes `false` |
| `Project.is_public` | The project's named artist only | `PATCH /api/passport/projects/:id/visibility`, scoped by `artist_id` |

`PromotionalConsent` covers promotional use of assets, not credits, so it is not used.

A credit shows on the public Passport only when it is CONFIRMED, its own `is_public` is true, and its project's `is_public` is true. Ownership goes through the participation the contributor claimed with the invitation link (`participant_ref_id`), as network metrics already do, never through a matching name.

## What changed

- `apps/api/src/lib/contributorCredits.ts` lists a contributor's confirmed credits:
  - **Their own view:** every confirmed credit, each with `published` and the project's id and title.
  - **Public view:** published credits only, with `role`, `credited_name`, `scope` and the project title. No project id, notes, phase, producer or bookings.
- `GET /api/passport/portfolio` returns `credits` for the signed-in user's own view; `GET /api/passport/public/:code` returns `artist.credits` for the public view.
- `artist.projects`, scoring and visibility rules are unchanged.
- **Web pages:**
  - The private Passport has a "Credits" panel marking each credit "ON PASSPORT" or "PRIVATE".
  - The public Passport has a "Credits" section.

## Evidence

| Check | Result |
|---|---|
| `contributor-passport-credits.integration.test.ts` (7 cases) | pass |
| Full integration suite, fresh local database | 280 of 280 pass |
| API unit (164) and web (275) suites, typechecks, build, secrets scan | pass |
| Mutation: drop the project-visibility condition | 6 cases fail |
| Mutation: drop the credit's own `is_public` condition | the contributor-consent case fails |
| Rehearsal rerun on `dev:local`, seeded producer, artist and studio admin plus a new contributor | both failed steps now pass; see below |

The rerun ran the same setup:
- a producer project naming the demo artist;
- an invitation, claimed and accepted;
- a session booked, attached, confirmed and completed with a credit;
- the credit confirmed by the contributor.

| Step | Project private | Artist made it public | Made private again |
|---|---|---|---|
| Contributor portfolio lists the confirmed work | PASS, `published=false` | PASS, `published=true` | PASS, `published=false` |
| Public Passport shows the confirmed credit | hidden, as required | PASS, title and role only | withdrawn |

## Open

- Confirming a credit also gives the contributor's consent to publish it. If the owner wants confirmation and publication as separate decisions, the contributor needs a separate publish action.
- A producer-led project with no named artist can never be made public, so its credits stay private.
- The new Passport sections were not checked in a browser.
