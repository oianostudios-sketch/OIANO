**The artist can take a session back off a project, and a producer cannot rename the artist while that artist's sessions are on it, 2026-10-09.**
Follows up two items under "Observed, not changed" in
[`2026-10-09-artist-links-bookings.md`](2026-10-09-artist-links-bookings.md): sessions
producers linked before that change had no way back, and a producer could rename the
project's artist after the artist attached sessions.

**This is the owner's interim decision (2026-10-09): the artist controls which of their
sessions a producer's project can see.** It holds until Work, Contribution and Agreement
(migration steps 5-8 of the frozen order) replace projects. No schema change.

**What was wrong.**

- The schema does not record who attached a booking, so sessions a producer linked through
  the retired `link-booking` route, without the artist's agreement, stayed open to that
  producer. The artist had no detach.
- `PATCH /api/producer/projects/:id` accepted a new `artist_id` with sessions attached. The
  sessions stayed on the project, so the producer kept reading them, while the first artist
  no longer found the project on their Projects page.

**What changed.**

- `apps/api/src/routes/artist-projects.routes.ts`: new
  `DELETE /api/artist-projects/:id/bookings/:bookingId`. The booking must be the caller's
  and currently on that project. Anything else, including a malformed id, answers 404; a
  producer gets 403 from the router's role check. It answers 204 and sets
  `booking.project_id` to null in one `updateMany` guarded on both conditions. The project
  need not be active or still name the caller: archiving the project, or a rename made
  before this change, cannot keep a session its artist takes back. Detaching only removes
  others' access, so the booking's owner is the only check that matters.
- **What a detach closes.** An attach only ever set `booking.project_id`. The producer
  reached the booking (`GET /bookings`, `GET /bookings/:id`, `/next-action`,
  `/session-summary`), its thread (`GET/POST /bookings/:id/messages`) and its deliverables
  (included with the booking and in `GET /producer/projects`) only through that column, so
  clearing it closes all of them. Deliverables, versions, reviews and booking messages hang
  off the booking, not the project, so no project-scoped copy of them persists. Contributors
  on the project lose the session from their workspace the same way. A producer has no
  route to the artist's files.
- **What a detach leaves, decided conservatively.** Credits and rights agreements that a
  studio's session completion wrote to the project stay. They are the parties' own records
  (credited names, roles, split shares and each holder's decision), carry none of the
  booking's private data beyond the service name in a rights agreement's title, and other
  holders have answered them. Removing them would erase other people's records, which is a
  rights decision for the Agreement step, not a side effect of a detach. The project's
  `last_session_at` and notifications already delivered also stay.
- `apps/api/src/routes/producer.routes.ts`: `PATCH /producer/projects/:id` answers 409 when
  it would change `artist_id` (to another artist or to null) while any booking of the
  currently named artist is on the project. The message says the artist must detach them
  first. Naming the same artist again, other edits, and renaming a project with none of the
  artist's sessions still work.
- Web, `ArtistProjectsPage.tsx`: each linked session gains "Detach", behind a confirm that
  says the producer will no longer see it, its messages or its deliverables. A detach
  invalidates `['artist-projects']`, `['artist-project-sessions']`, `['bookings']` and
  `['availability']`, the same keys as the attach. The list shows every linked session
  instead of the first three, so every one can be detached.
- Nothing in money, Stripe, wallet, payouts or the ledger was touched.

**Evidence.**

- New `apps/api/src/integration/artist-detach.integration.test.ts`, 5 subtests, starting
  from a session linked the old way (project_id set directly, as `link-booking` did), with
  a deliverable and a message:
  - While attached, the producer reads the booking with its deliverable, its thread with
    the message, and the session under the project.
  - Seven refusals change nothing: artist B on A's booking, A through B's project, A on B's
    booking, A on B's booking left on a project naming A, A on a project the booking is not
    on, and a malformed id are each 404; the producer calling the route is 403.
  - After A detaches (204): the producer gets 404 on `GET /bookings/:id`, `GET` and `POST
    /messages`, `/session-summary` and `/next-action`; the session and its deliverable leave
    `GET /producer/projects`, and `GET /bookings` no longer lists it. A second detach is 404,
    the session is back in the artist's available list, and the artist still reads its thread.
  - A detach on an archived project answers 204 and closes the producer's read. Artist B
    takes their session off a project that now names A (204), and the producer, who read
    it before, gets 404.
  - With A's session attached, renaming to artist B or to null is 409 with a message that
    names detaching, and the project still names A, who still sees it. Re-naming A with a
    phase change is 200, a project without A's sessions can be renamed, and after A detaches
    the rename to B is 200.
- Web: `ArtistProjectsPage.test.ts` gains a test. Detach with the confirm refused calls
  nothing; confirmed, it calls `DELETE /artist-projects/project-1/bookings/booking-2`.
- **Mutations**, each restored from a `cp` backup and confirmed with `cmp`:
  - `artist_id` dropped from the detach's `updateMany`: "A detaches B's booking off a
    project naming A: expected 404, got 204".
  - The booking required to be on a project that names the caller and is active (and its
    own `artist_id` check dropped): the refusal subtest failed as above, and the archived
    detach answered 404 instead of 204.
  - The booking required to be on a project that names the caller (own check kept): only
    B's reclaim failed, 404 instead of 204.
  - The 409 check made unreachable (`attached < 0`): the rename subtest failed, 200
    instead of 409.
  - The confirm removed from the web button: the web test failed, confirm called 0 times.
- All checks pass: both typechecks; `npm test` (API unit 119/119, intelligence 31/31, web
  117/117); `npm run test:integration:local` 254 passed, 0 failed, 0 todo on a fresh
  database; `npm run build`; `npm run security:secrets`.

**Observed, not changed.**

- The 409 check and the update are two statements. An artist attaching in the moment
  between them could still land a session on a project that is being renamed. Closing that
  needs a transaction or a guarded update across both tables; the window is narrow and the
  artist can detach afterwards.
- Sessions of a previous artist left on a project renamed before this change do not block
  a rename, because the check counts only the currently named artist's bookings. That
  artist can detach them through the API, but their Projects page lists only projects that
  name them, so the web offers them no button for it.
- The producer's own web pages never send `artist_id` on `PATCH`, so the 409 is reached
  only through the API.

**Not exercised.** The page was not driven in a browser; the web change is covered by the
unit test above.
