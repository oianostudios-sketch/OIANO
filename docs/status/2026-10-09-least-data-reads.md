**Engineer reads and a producer's booking reads list their fields: an engineer's pay rate stays with the studio's staff, and a producer no longer receives the artist's account, the artist's booking notes or the payment record, 2026-10-09.**
Follows the "Observed, not changed" items in
[2026-10-09-public-response-fields.md](2026-10-09-public-response-fields.md) and
[2026-10-09-artist-links-bookings.md](2026-10-09-artist-links-bookings.md).

**What was wrong.** Found by reading the routes on `origin/main` (05b6ead). The new test fails
against the old producer list (see the mutation below).

- `GET /api/engineers` and `GET /api/engineers/:id` returned `hourly_rate_usd`, the rate the
  studio pays the engineer, to any signed-in account that passed a `studio_id`. No web page
  calls either route; `platform.integration.test.ts` calls the list as studio staff.
- `GET /api/bookings` for a producer used the staff include: the whole `artist` row (its
  `user_id` and `onboarding_completed_at`), the whole `engineer` row (login and rate), the
  whole `room` and `service` rows, the artist's booking `notes`, `total_usd`, and the whole
  `payment` row (Stripe checkout and payment-intent ids, amounts, refund fields).
- `GET /api/bookings/:id` for a producer dropped only the artist's `user` (email). It still
  returned the rest of the artist row, the whole `Studio` row (Connect account, fee, phone,
  email, passport counter), the engineer's login and rate, the payment row, the booking notes,
  and the session log with the artist's private rating and testimonial.

**What changed.**

- `apps/api/src/routes/engineers.routes.ts`: `publicEngineerSelect` (id, name, bio,
  specialties, avatar), the fields `/studio/:id` publishes. `STUDIO_ADMIN` and `ENGINEER`
  callers, whose studio comes from their membership, also get `hourly_rate_usd`, as before.
  `/me` and `/runsheet` are unchanged.
- `apps/api/src/controllers/bookings.controller.ts`: `producerBookingSelect` for the producer's
  list: ids, times, status; the artist's id, name, alias, avatar; studio id, name, timezone;
  room, engineer and service id and name; the project's id, title, phase. That is what the
  calendar (`CalendarPage.tsx`) and the status bar (`StudioState.tsx`, `StudioStatusBar.tsx`)
  read. No producer screen reads a price or payment from the list.
- `GET /bookings/:id` for a producer reads `producerBookingDetailSelect`: the list's fields plus
  what `BookingDetailPage.tsx` shows every viewer. **That page shows the producer the session's
  total and payment status, so `total_usd` and `payment.status` are kept** (only the status,
  not the payment row). It also keeps the engineer's session log notes and tracks, the
  project's producer, and the deliverables with versions and reviews, which the artist's
  attach opens to the producer. The booking `notes` are dropped: the page shows them only when
  present, so a producer now sees no Notes box.
- Staff, artist and OIANO admin reads are unchanged. No schema change; nothing in money,
  Stripe, wallet, payouts or the ledger was touched.

**Evidence.**

- New `apps/api/src/integration/least-data-reads.integration.test.ts`, 5 subtests. An artist
  and a producer each read the engineer list and one engineer: the profile is present and
  `hourly_rate_usd`, `user_id`, `studio_id`, `credits` appear at no depth. The studio's admin
  still reads the rate (42). A producer's list and single session are walked recursively for
  25 forbidden keys (accounts, studio internals, payment provider fields, private ratings; the
  list also `notes`, `total_usd`, `payment`, `session_log`), the seeded private values appear
  nowhere, and every field the calendar, status bar and session page read is present. The
  artist and the studio admin still read the booking notes, payment status and the artist's
  email.
- Mutation: with the producer list put back to `include: staffInclude`, the list subtest fails
  ("producer /bookings must not carry user_id, onboarding_completed_at, hourly_rate_usd, …,
  notes, total_usd, payment"); 252 passed, 2 failed (the subtest and its parent). The file was
  restored from a `cp` backup, and `cmp` confirmed it byte-identical.
- Both typechecks pass.
- `npm test`: API unit 119/119, intelligence 31/31, web 116/116.
- `npm run test:integration:local`: 254 passed, 0 failed, 0 todo, on a fresh database.
- `npm run build` passes.
- `npm run security:secrets` passes over 516 files.

**Not exercised.** No page was driven in a browser. The producer's calendar, status bar and
session page were checked by reading which fields they use, and by the test's presence
assertions.

**Observed, not changed.**

- A producer still sees a session's total and payment status on the session page, because the
  page shows it to every viewer. Hiding it would be a product decision and a web change.
- An `ENGINEER` reads every colleague's rate from `/engineers`, as before; the brief kept staff
  on the full shape. Restricting it to a capability would be a staff-permission change.
- Deliverable versions and reviews carry `created_by` and `reviewed_by`, user ids of the studio
  staff and the artist, to the producer. Unchanged here; it is the same reach as before.
