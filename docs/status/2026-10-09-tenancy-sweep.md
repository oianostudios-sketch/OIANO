**A sweep of every API route that takes an id: studio staff stay inside their own studio, and three person-to-person gaps are closed, 2026-10-09.**
PRs #41, #43 and #44 each found one more route that acted on an id from the request
without checking that the row belonged to the caller. This record checks all 37 route
modules and the booking controllers at once, against `origin/main` (e9f911c), instead of
waiting for the next one.

**Method.** Every handler a studio staff member (`STUDIO_ADMIN` or `ENGINEER` account,
or a `StudioStaff` membership) can call was read, with every id it takes from the path,
query or body, and how it ties that id to the studio `resolveStaffStudio` resolves (or,
for artist and producer routes, to the caller). Routes open only to `OIANO_ADMIN`
(`maintenance.routes.ts`, feedback triage), the Stripe webhook and the public reads are
listed once at the end. Every OK below that names a 404 or 403 is also called in the new
test, unless the row says otherwise.

**What was wrong.** Proven by the new test against `origin/main` before any fix:

- `PATCH /api/bookings/:id/reschedule` answered another artist's booking with 403 "Not
  authorised" and a missing one with 404, so any artist could tell which booking ids
  exist.
- `PATCH /api/bookings/:id/artist-review` read `req.user`, which `authenticate` never
  sets, so every review, by anyone, ended in a 500. The review form
  (`apps/web/src/components/ArtistReviewForm.tsx`) has never been able to save, and the
  ownership check it carried (`req.user.artistId`) could never run.
- `GET /api/bookings/:id` returned the artist's account email to a producer whose project
  the booking is linked to. A project makes the producer a party to the work, not to the
  artist's account, and no web screen reads that field.
- Producer projects trust an artist link the artist never agreed to. Deferred, below.

**What changed.**

- `apps/api/src/controllers/bookings/session-management.controller.ts`: another artist's
  booking is "Booking not found" (404), like a missing one.
- `apps/api/src/routes/artist-review.routes.ts`: reads `req.userRole`, and finds the
  booking through the caller's own artist record (`artist: { user_id }`), so another
  artist's booking is 404. Only an artist reviews, and only a completed session with an
  engineer, as before.
- `apps/api/src/controllers/bookings.controller.ts`: `getBookingById` drops
  `artist.user` (id and email) from a producer's answer. Studio staff and the artist
  still receive it.
- No shared `studioScope` helper was added: no new studio-side hole was found, so
  nothing needed `roomInStudio`/`equipmentInStudio` beyond `facilities.routes.ts`.
- No schema change. Nothing in money, Stripe, wallet, payouts or the ledger was touched.

**The table.** "Scoped" means the row is looked up with the caller's resolved studio in
the `where` (`findFirst({ id, studio_id })` or the same in raw SQL), so another studio's
row is not found.

| Route | Ids taken | Check | Verdict |
|---|---|---|---|
| `GET /bookings` | none | staff: `studio_id` of resolved studio; artist: own `artist_id`; producer: own projects | OK |
| `GET /bookings/:id`, `/next-action`, `/session-summary` | booking | staff: `booking.studio_id` compared with resolved studio; artist and producer: ownership; all 404 | OK (producer email removed, above) |
| `GET /bookings/:id/card.png` | booking | artist: `artist.user_id`; others: resolved studio in `where` | OK |
| `POST /bookings` (artist) | studio, room, service, project, policy exceptions | room and service `findFirst` with the named studio; project with own `artist_id`; exceptions with studio and own artist | OK |
| `PATCH /bookings/:id/status` | booking | `MANAGE_BOOKINGS` on membership; scoped | OK |
| `PATCH /bookings/:id/engineer` | booking, engineer | `MANAGE_BOOKINGS`; booking and engineer both scoped | OK |
| `PATCH /bookings/:id/session-notes` | booking | scoped | OK |
| `POST /bookings/:id/deliver` | booking | scoped | OK |
| `POST /bookings/:id/complete` | booking, participant ids, rights holder ids | booking scoped; participants counted inside the booking's project; holders resolved only from the booking's own artist, producer and participants | OK |
| `PATCH /bookings/:id/deliverables/:deliverableId/review` | booking, deliverable | deliverable `findFirst` with booking id and own `artist_id` | OK |
| `PATCH /bookings/:id/reschedule` | booking | own artist | HOLE (existence) — fixed, 404 |
| `PATCH /bookings/:id/artist-review` | booking | none could run (500) | HOLE (broken) — fixed, 404 for others |
| `GET/POST /bookings/:id/messages` | booking | `canAccessBookingMessages`: staff need a membership at the booking's own studio; others by party; 404 | OK |
| `GET/POST /projects/:id/messages` | project | party to the project, or staff with a membership at a studio holding one of its bookings; 404 | OK |
| `POST /payments/stripe/checkout-session` | booking | staff: resolved studio; artist: own booking; 404 before any Stripe call | OK |
| `GET /payments/wallet/transactions`, `POST /wallet/top-up` | none | own artist | OK |
| `GET/POST /payouts`, `/balance`, `/connect` | none | `VIEW_FINANCE` on resolved studio; studio never from the request | OK (not called in the test) |
| `POST /admin/walkin` | room | `MANAGE_BOOKINGS`; room scoped | OK |
| `POST /admin/bookings/:id/cash-payment` | booking | `MANAGE_BOOKINGS`; `SELECT … WHERE id AND studio_id FOR UPDATE` | OK |
| `GET /admin/analytics`, `/runsheet`, `GET/POST /admin/announcements` | none | `attachStudioScope` | OK |
| `GET /admin/announcements` (artist) | `studio_id` query | only a studio of the artist's own bookings | OK (not called in the test) |
| `POST /studio-clock/sessions/:id/activity` | booking | scoped | OK |
| `GET /studio-clock` | none | `attachStudioScope` | OK |
| `GET /studio-setup`, `POST/PATCH/DELETE /rooms`, `/services`, `/engineers` | room, service, engineer | `MANAGE_POLICIES` for writes; every id scoped | OK |
| `GET /studio/team`, `POST /team/invitations` | none | `MANAGE_STAFF`; resolved studio | OK |
| `PATCH/DELETE /studio/team/:membershipId`, `DELETE /team/invitations/:id` | membership, invitation | `MANAGE_STAFF`; scoped | OK |
| `POST /studio/team/invitations/accept` | token | token hash, and the invitation's email must be the caller's | OK (not called in the test) |
| `PATCH /studio/active` | studio | caller's own membership at that studio, else 403 | OK (403 is deliberate: the caller names the studio) |
| `GET /studio/current`, `/memberships`, `/navigation-intelligence` | none | resolved studio or own memberships | OK |
| `GET /studio-policies`, `POST /`, `POST /evaluate`, `GET /exceptions` | none | resolved studio; capability for writes | OK |
| `POST /studio-policies/exceptions` | policy | policy scoped; `target_id` is a label, looked up nowhere | OK |
| `PATCH /studio-policies/exceptions/:id/decision` | exception | scoped; approval checks capability | OK |
| `GET /studio-circle/studio`, `/current-work` | none | `attachStudioScope` | OK |
| `POST /studio-circle/:id/request` | circle member | scoped | OK |
| `PATCH /studio-circle/:id/consent` (artist) | circle member | own `artist_id` | OK |
| `GET /facilities/rooms`, `/equipment`, `/issues` | none | `attachStudioScope` | OK |
| `POST /facilities/equipment` | room | `MANAGE_POLICIES`; `roomInStudio` | OK (PR #44) |
| `POST /facilities/issues` | booking, room, equipment | booking: party to it or staff of its studio (403 otherwise); room and equipment inside that studio | OK (403 for another's booking is pinned by PR #44's test) |
| `PATCH /facilities/issues/:id` | issue, assignee | issue scoped; assignee must be a member of the studio | OK |
| `GET /engineers`, `/engineers/:id` | engineer, `studio_id` query | staff: resolved studio, ignoring the query; others: public profile fields of the named studio | OK |
| `GET /engineers/runsheet`, `/engineers/me` | none | resolved studio; own engineer record | OK |
| `GET /artists` | `q` | artists with a booking at the resolved studio | OK |
| `GET /artists/:id` | artist | self: whole record; staff: 404 without a booking at the resolved studio, else that studio's bookings and logs; others: public profile | OK |
| `GET /artists/:id/summary` | artist | self, or staff working with the artist at the resolved studio; 403 otherwise | OK |
| `POST/DELETE /artists/:id/files…`, `access-ticket`, `presign`, `complete` | artist, file | self, or staff with a booking with the artist at the resolved studio (engineer: assigned); file must be the artist's; 403 otherwise | OK (403: artist profiles are public, so the artist's existence is not secret) |
| `GET /artists/:id/files/:fileId/content` | file | ticket bound to the file id | OK (not called in the test) |
| `PATCH /artists/me/status` | none | own artist | OK |
| `GET /artist-projects`, `PATCH /:id/promotional-consents/:consentId`, `/:id/rights-agreements/:agreementId` | project, consent, agreement | `project: { artist_id: own }` | OK |
| `/passport` (artist), `/releases/:id`, `/projects/:id/visibility` | release, project | own `artist_id` | OK |
| `/connect`, `/connect/:id`, `/:id/messages`, `/:id/status` | connection, artist | own side of the connection; status only by the recipient | OK |
| `/contributions/*` | participant, credit, agreement, token | `participantBelongsToUser`, active membership of the project, token hash | OK (covered by the contribution suites) |
| `/notifications/:id/read`, `DELETE /:id` | notification | `updateMany/deleteMany` with own `user_id` | OK |
| `/invitations` | token | own invitations; token hash | OK (not called in the test) |
| `/producer/me`, `/tracks…`, `/projects/:id` (PATCH, DELETE), `/participants…`, `/credits…` | project, participant, credit, track | `producer_id: own`; child rows inside that project | OK |
| `POST /producer/projects`, `PATCH /producer/projects/:id` | `artist_id` | none | HOLE — deferred, below |
| `GET /producer/projects/:id/available-sessions`, `POST /link-booking` | project, booking | own project; booking's artist must equal the project's artist, which the producer set | HOLE — deferred, below |
| `POST /producer/projects/:id/promotional-consents`, `/rights-agreements` | project, holder ids | own project; holders only the project's artist, the producer and its active participants | OK, but they notify whichever artist the producer named (same deferral) |
| `GET /network-exchange`, `/network-metrics`, `/network/pulse`, `/network/orbit`, `/context`, `/passport/stats`, `/studio/pulse`, `/artists/discover` | none | caller's own record or resolved studio; network figures are aggregates | OK |
| `GET /studio/options`, `/studio/:id`, `/studio/passport/:slug`, `/availability`, `/passport/public/:code` | studio, room, code | public by design; room must be in the named studio | N/A (public) |
| `/maintenance/*`, `GET/PATCH /feedback` | various | `OIANO_ADMIN` only | N/A (platform operators) |
| `/auth/*`, `/webhooks/stripe` | credentials, signed event | not tenant-scoped | N/A |

**Private fields.** Emails reach a studio account only for people it has a relationship
with: its own team and invitations, its customers (`GET /artists`, a booking's artist),
reporters and assignees of its own facility issues, and its own staff on policy
exceptions. The one field found outside that, the artist's email in a producer's booking
read, is removed above.

**Evidence.** New `apps/api/src/integration/tenancy-sweep.integration.test.ts`, 6
subtests and one marked todo, table-driven: two studios, each with a room, service,
engineer, equipment, legacy-owner, a second staff member, a pending invitation, a policy,
an exception and an issue; three artists with a booking, deliverable, Circle membership,
release, file and notification each; a producer project for artist Y with a promotion
request and a rights agreement.

- Studio A's owner against studio B's ids: 36 calls (bookings and every booking action,
  messages, cash, walk-in, clock, checkout, rooms, services, engineers, team,
  invitation, active studio, issue, policy exception, Circle, artist, brief, file,
  project thread). Each answers its listed status, and a snapshot of studio B's and
  artist Y's rows is identical before and after.
- 17 studio lists, read by studio A's owner, carry none of studio B's or artist Y's ids
  or emails.
- Artist X against artist Y's (and Z's) ids: 26 calls, the same snapshot unchanged, and
  Z's completed session not rated.
- An artist still reschedules their own booking (200) and reviews their own completed
  session (200, stored on the session log); a studio account reviewing gets 403, and a
  session not completed 400.
- A producer reads the booking linked to their project without the artist's email; the
  booking's studio still gets it.

Results:

- **Against `origin/main`:** 3 subtests failed: reschedule of Y's booking 403, review of
  Z's session 500, the artist's own review 500, and the artist's email in the producer's
  read.
- **Mutations**, each restored from a `cp` backup and confirmed with `cmp`, all three at
  once: the reschedule 403 put back, the artist-review lookup without `artist: { user_id }`
  (X then rated Z's session, 200) and the producer branch disabled. The artist subtest
  failed on both of its rows and the producer subtest failed.
- All checks pass: both typechecks; `npm test` (API unit 119/119, intelligence 31/31,
  web 113/113); `npm run test:integration:local` 236 passed, 0 failed, 1 todo (the deferral below) on a fresh database;
  `npm run build`; `npm run security:secrets`.

**Deferred: a producer can name any artist, and the name is trusted.** `POST` and `PATCH
/api/producer/projects` take `artist_id` with no check. That one-sided link is then
trusted by `GET /producer/projects/:id/available-sessions`, which lists the artist's
unlinked bookings at every studio (times, studio, room, service, notes, total), and by
`POST /link-booking`, which attaches one of them to the producer's project. Once linked,
the producer reads the booking, its thread and its deliverables, and the promotion and
rights routes notify the artist. The test's todo subtest reproduces it: a producer with no
relationship to artist X names X and sees X's booking. Closing it needs the artist's
agreement to a project that names them, which the schema does not record (for example an
acceptance on the project, or links proposed by the producer and confirmed by the
artist). Which of those is an owner decision, so it is not changed here; the todo subtest
states the intended behaviour and turns into a normal test when it is decided.

**Observed, not changed.**

- `POST /facilities/issues` answers 403 for a booking the caller is not on, where most
  routes answer 404. PR #44's test pins the 403; the booking ids are UUIDs.
- `GET /studio/:id` (public) and `GET /studio/current` return whole `Engineer` rows,
  including `user_id` and `hourly_rate_usd`. Not an email or secret, but more than a
  public page needs.
- `GET /studio-circle/current-work` returns whole `Project` rows (including the
  producer's `notes`) for any project with a booking at the studio.

**Not exercised.** The review form and the producer project page were not driven in a
browser. Payout routes, the artist announcements read, staff invitation acceptance, file
content tickets and creator invitations are covered by reading, not by this test.
