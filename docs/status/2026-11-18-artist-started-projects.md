**An artist can start a project of their own. It has no producer, and only that artist, and the studios where its sessions are booked, can reach it. Needs migration `20261118120000_artist_started_projects` applied before merge.**

Addresses decision 3 of the 2026-11-18 value audit ("let any creative start a project") for artists only. Producer project creation, invitations and access are unchanged. Payment stays record-only.

## What changed

- `projects.producer_id` is nullable (`prisma/schema.prisma`, migration `20261118120000_artist_started_projects`). Existing rows keep their producer.
- `POST /api/artist-projects` creates a project for the signed-in `ARTIST` with their own artist profile. The body is strict: it takes `title`, optional `phase` and `notes`. It rejects `artist_id`, `producer_id` and `is_public` with 400. An `ARTIST` account with no artist profile gets 404 and nothing is created.
- Code that read `project.producer` now tolerates none:
  - session completion (`PRODUCER` rights holder);
  - contribution and credit response notifications;
  - project message members;
  - live updates;
  - the studio dashboard's current-work rail (`PulseDashboard.tsx`), which would otherwise have thrown on a studio's first artist-started project.
- `/projects` (artist) has a "Start a project" button in the header and the empty state. Navigation labels are unchanged.

## Evidence

| Check | Result |
|---|---|
| `artist-started-project.integration.test.ts` (7 cases) | pass |
| Full integration suite, fresh local database | 281 of 281 pass |
| `npm test` (API unit and web) | pass (164 API, 275 web) |
| Typecheck, API and web; `npm run build`; `npm run security:secrets` | pass |
| Mutation: drop `.strict()` on the create body | smuggled-field case fails |
| Mutation: allow an `ARTIST` with no artist profile | unauthorized-caller case fails |
| Seeded-account rehearsal on `dev:local` (artist, producer, studio admin, engineer, new contributor) | 37 of 39 steps pass; the 2 failures are the Passport gap below |
| Browser, 375px and 1280px, new artist account | form starts a project and selects it; no horizontal scroll; no page errors |

The rehearsal ran these steps:

- Booked two sessions as the artist, both recorded as cash and unpaid.
- Attached one session to a producer's project and one to an artist-started project.
- Confirmed both sessions as studio staff.
- Ran the producer's invitation through claim and acceptance.
- Completed the session with files and a credit.
- Requested changes, delivered version 2, saw approval of version 1 refused with 409, and approved version 2.
- Confirmed the credit as the contributor.
- Repeated delivery and review on the artist-started project, then showed it on the artist's public Passport (verified sessions counted).
- Confirmed that a producer gets 404 on its thread and that a wallet top-up returns 409.

## Not done, or not verified

- **A confirmed credit does not reach the contributor's Passport.** An artist's Passport and portfolio list only projects where they are the named artist; confirmed credits are counted only in network metrics. This predates this change.
- An artist cannot yet invite collaborators, add credits or name a producer on their own project; those routes remain producer-only.
- Deliverables still require a booking (`Deliverable.booking_id`).
- Only artists can start a project. Producers keep their own route, and engineers and studio staff have none.
- Production: the migration has not been applied anywhere but local databases.
