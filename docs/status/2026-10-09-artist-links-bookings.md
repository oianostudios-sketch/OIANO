**Only the artist puts their session on a project: a producer naming an artist no longer opens the artist's bookings, 2026-10-09.**
Closes the deferral in [`2026-10-09-tenancy-sweep.md`](2026-10-09-tenancy-sweep.md)
("a producer can name any artist, and the name is trusted").

**This is the owner's interim decision ("Artist links", 2026-10-09).** It holds until Work,
Contribution and Agreement (migration steps 5-8 of the frozen order) replace projects and
record each party's agreement properly. No schema change: the project still records only
the artist the producer named, so the artist's own action is the only agreement there is.

**What was wrong.** `POST` and `PATCH /api/producer/projects` take any `artist_id`, and the
artist never agrees to it. Two producer routes trusted that name.
`GET /api/producer/projects/:id/available-sessions` listed the named artist's unattached
bookings at every studio (times, studio, room, service, notes, total).
`POST /api/producer/projects/:id/link-booking` attached one to the producer's project.
That opened the booking, its thread and its deliverables to the producer. It could also
move a booking off another project.

**What changed.**

- `apps/api/src/routes/producer.routes.ts`: both routes are removed. A comment stands in
  their place, as for the retired studio artist-delete route. Any call now answers 404, the
  same as any route that does not exist. No producer-side detach existed, so none is
  retired.
- `apps/api/src/routes/artist-projects.routes.ts`, two new artist routes.
  `GET /api/artist-projects/:id/available-sessions` lists the caller's own bookings that
  are on no project (20, newest first, the same as the old list).
  `POST /api/artist-projects/:id/bookings` with `{ booking_id }` attaches one. The project
  must name the caller's artist record and be active. The booking must be the caller's.
  Anything else answers 404. A booking already on another project answers 409 instead of
  being moved, and attaching it again to the same project answers 200. The write is guarded
  on the booking still being unattached, so two attaches cannot race a booking from one
  project to another.
- What an attach opens is unchanged. It sets `booking.project_id`, as `link-booking` did, so
  the producer reads the booking (without the artist's email, per the sweep), its thread and
  its deliverables, exactly as before. Only who starts it changed.
- Web, producer side (`ProjectDetailPage.tsx`): the "+ Link a session" picker is gone. The
  Sessions section now says the artist attaches their own sessions from their Projects page.
- Web, artist side (`ArtistProjectsPage.tsx`): "Linked sessions" gains "+ Attach a session"
  on an active project. It lists the artist's unattached sessions, says that attaching
  shares the session, its messages and its deliverables with the producer, and invalidates
  `['artist-projects']`, `['bookings']` and `['availability']` after an attach.
- Comments in `resourceAuthorization.ts` and `bookings.controller.ts` that pointed at
  `link-booking` now point at the artist route.
- Nothing in money, Stripe, wallet, payouts or the ledger was touched.

**Audit: producer routes that trust `project.artist_id`.**

| Route | What the name gives the producer | Verdict |
|---|---|---|
| `POST /producer/projects`, `PATCH /producer/projects/:id` | Records the name. No check | Unchanged by decision: naming stays one-sided until Agreement. It opens nothing private now |
| `GET /producer/projects/:id/available-sessions` | The artist's unattached bookings, every studio, with notes and totals | HOLE — removed (404) |
| `POST /producer/projects/:id/link-booking` | Attaching the artist's booking, and through it the booking, thread and deliverables | HOLE — removed (404); the artist attaches instead |
| `GET /producer/me`, `GET /producer/projects` | The artist's id, name, alias and avatar, which are public profile fields; bookings only once attached | OK |
| `GET /bookings`, `GET /bookings/:id`, `/next-action`, `/session-summary`, `GET/POST /bookings/:id/messages` | Only bookings on the producer's own project, which now only the artist puts there | OK (the reach now rests on the artist's attach) |
| `POST /producer/projects/:id/promotional-consents` | Notifies the named artist with the producer's name and project title. The producer gets back only the request and, later, the answer | OK: the notification stays; nothing of the artist's goes to the producer |
| `POST /producer/projects/:id/rights-agreements` | Notifies the named artist. The answer lists the artist's share and decision under the artist's account id (`holder_ref_id`, `holder_user_id`) | OK for notifying; account id observed, below |
| `GET/POST /projects/:id/messages` | The producer and the named artist share the project thread | OK: the artist shares only what they post there. The producer can write to an artist who never agreed, the same as a notification |
| `POST /bookings/:id/complete` | Rights holders come from the booking's own project | OK: the booking is there by the artist's attach |

**Evidence.**

- `apps/api/src/integration/tenancy-sweep.integration.test.ts`: the todo subtest is now a
  normal test. A producer names artist X on a new project. Both old routes answer 404, X's
  booking stays off the project, and the producer cannot read it or see it in
  `GET /bookings`. The routes are also 404 on the producer's own project with artist Y.
- New `apps/api/src/integration/artist-links-bookings.integration.test.ts`, 4 subtests:
  - Before the artist acts, the producer cannot read the booking or its thread, and
    `GET /producer/projects` does not carry it.
  - The artist's list holds only their own unattached booking. Another artist's project or
    an archived one is 404, and a producer calling it gets 403.
  - Five attaches answer 404 and change nothing: another artist's booking, the caller's
    booking on another artist's project, on a project with no artist, on an archived project,
    and artist B on A's project. A producer calling gets 403, and a bad id 400.
  - The artist's own attach answers 200, and again 200. Moving it to another project
    answers 409. The producer then reads the booking with its deliverable and without the
    artist's email, reads its thread, and sees it on the project.
- Web: `ProjectDetailPage.test.ts` has a new test. With a named artist the page shows the
  explanation, offers no "+ Link a session", and calls neither old route. New
  `ArtistProjectsPage.test.ts`, 2 tests: the attach lists sessions only when opened and posts
  `{ booking_id }` to the project; an archived project offers no attach.
- **Mutations**, each restored from a `cp` backup and confirmed with `cmp`:
  - The ownership check came out of the attach (`artist_id` dropped from both the
    `findFirst` and the guarded `updateMany`). Two subtests failed: "A attaches B's booking
    to A's project: expected 404, got 200", and the later attach test.
  - The producer page went back to `origin/main`. The new web test failed: no explanation,
    and "+ Link a session" present.
  - The todo subtest needs no fresh mutation. On `origin/main` it was a todo because it
    failed: the old routes listed X's booking and linked it.
- All checks pass: both typechecks; `npm test` (API unit 119/119, intelligence 31/31, web
  116/116); `npm run test:integration:local` 242 passed, 0 failed, 0 todo on a fresh
  database; `npm run build`; `npm run security:secrets`.

**Observed, not changed.**

- **Bookings that producers already linked stay linked.** The schema does not record who
  attached a booking, so a producer's link cannot be told from the artist's own booking on
  a project (`POST /bookings` with `project_id`). The artist has no detach. A detach did not
  exist before, so none was added. If the owner wants artists to be able to withdraw a
  session, that is a small follow-up route.
- A producer can still `PATCH` a project's `artist_id` after the artist attached a session.
  The session stays on the project. If the producer then names another artist, the first
  artist loses sight of the project and its thread, but the producer still reads the
  session. Only the Agreement step can fix this properly.
- Rights agreements store and return a holder's account id (`holder_ref_id`,
  `holder_user_id`), so the producer learns the named artist's account id. The public
  artist profile deliberately withholds that id. It is an identifier, not a credential or
  booking data, and it is the same on a project the artist agreed to. Changing it touches
  how rights decisions are matched, so it is left for the Agreement migration.
- `GET /bookings` for a producer still includes the whole `artist` row and `payment`. That is
  the same as before, and it is reached now only through the artist's attach.

**Not exercised.** Neither page was driven in a browser. The web changes are covered by the
unit tests above.
