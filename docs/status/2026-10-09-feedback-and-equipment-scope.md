**Feedback is read and triaged by OIANO's operators only, and the facilities writes stay inside the caller's studio, 2026-10-09.**
This closes the two holes listed under "Observed, not changed" in
[2026-10-09-staff-gates-rest.md](2026-10-09-staff-gates-rest.md), and two more of the same
kind found next to the second.

**What was wrong.** Proven against `origin/main` (10a598f) by the new test before any fix:

- `GET /api/feedback` returned every user's feedback, with each reporter's email and
  role, across the whole network, to any `STUDIO_ADMIN` account. `PATCH /api/feedback/:id`
  let that account change any report's status.
- `POST /api/facilities/equipment` accepted another studio's `room_id`, so studio A
  could attach equipment to studio B's room (201).
- `POST /api/facilities/issues` trusted the ids it was given. With no booking, a
  studio A owner filed a CRITICAL issue against studio B's room, which landed in studio
  B and paged B's staff. With a booking, any `STUDIO_ADMIN` account could report against
  any studio's booking, and a caller could pair a booking with another studio's room or
  equipment.
- `PATCH /api/facilities/issues/:id` assigned an issue to any user id. The issues console
  then shows the assignee's email, so studio A could read the address of anyone whose id
  it held.

**What changed.**

- `apps/api/src/routes/feedback.routes.ts`: listing and status changes require
  `OIANO_ADMIN`. Feedback is sent to OIANO from the widget on every page
  (`apps/web/src/components/FeedbackWidget.tsx`), not to a studio, and the web app has no
  screen that reads it, so there was no studio-scoped use to keep and nothing in the web
  app to hide. Sending feedback is unchanged: any signed-in account.
- `apps/api/src/routes/facilities.routes.ts`:
  - Two helpers, `roomInStudio` and `equipmentInStudio`, look an id up inside a given
    studio and answer 404 otherwise, so another studio's room reads as not found.
  - `POST /equipment` checks `room_id` against the studio `attachStudioScope` resolved.
  - `POST /issues` without a booking takes the studio from the caller's staff membership
    (`resolveStaffStudio`), not from the room or equipment named. With a booking, a staff
    member who is not on the booking must hold a membership at the booking's studio. In
    both cases every room and equipment id named must belong to that studio.
  - `PATCH /issues/:id` assigns only to a member of the studio's staff (400 otherwise).
- `apps/api/src/integration/lifecycle-guards.integration.test.ts`: its reassignment test
  assigned to a user with no membership; that user is now made staff of the studio.
- No schema change. Nothing in money, Stripe, wallet or payouts was touched.

**Evidence.** New `apps/api/src/integration/feedback-and-equipment-scope.integration.test.ts`,
4 subtests, two studios with legacy-owner memberships (every capability, so only the studio
boundary can refuse):

- Feedback: a studio A owner and a plain artist each get 403 listing feedback and 403
  changing the status of the artist's report and of a report from studio B's owner; both
  stay `OPEN`. An `OIANO_ADMIN` lists them, with the reporter's email, and resolves one.
- Equipment: studio A attaching to studio B's room gets 404 and nothing is created; its
  own room and no room both get 201.
- Issues: studio A against B's room (404), B's equipment (404), B's booking (403), and
  A's room with B's equipment (404) leave studio B's issue count and B's notifications
  unchanged. The artist on B's booking naming A's room gets 404. A's own room, B's owner
  on B's booking and the artist on B's booking all still get 201.
- Assignment: assigning A's issue to B's owner gets 400 and changes nothing;
  self-assignment still works.

Results:

- **Against `origin/main`:** all 4 subtests failed (feedback listed with 200, equipment
  attached with 201, issue filed in B with 201, outside assignment with 200).
- **Mutations**, each restored from a `cp` backup and confirmed with `cmp`:
  - Original `feedback.routes.ts`: the feedback subtest failed.
  - Only `PATCH /feedback/:id` reopened to `STUDIO_ADMIN`: the feedback subtest failed
    on `STUDIO_ADMIN changed feedback status`.
  - Room check removed from `POST /equipment`: the equipment subtest failed.
  - Both helpers stop filtering by studio: the equipment and issues subtests failed.
  - Booking path back to "any `STUDIO_ADMIN` account": the issues subtest failed on
    `B booking`.
  - Assignee check disabled: the assignment subtest failed.
- All checks pass: both typechecks; `npm test` (API unit 119/119, intelligence 31/31,
  web 113/113); `npm run test:integration:local` 230/230 on a fresh database;
  `npm run build`; `npm run security:secrets`.

**Not exercised.** The facilities page was not driven in a browser. It only reports
against rooms and equipment it lists from the active studio and never sends
`assigned_to`, so its calls are unaffected. A staff member with several studios now
files a booking-less report against the active studio only, as the page already assumes.
