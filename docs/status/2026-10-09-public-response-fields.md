**Public studio responses and the Circle's current work list their fields, so engineers' logins and pay rates, studio internals and producers' private notes no longer leave the API, 2026-10-09.**
Follows the "Noted, not changed" items in [2026-10-09-tenancy-sweep.md](2026-10-09-tenancy-sweep.md).

**What was wrong.** Found by reading the routes on `origin/main` (241ca5f). The new test
fails against the old `/studio/:id` query (see the mutation below); the other routes were
not run against the old code.

- `GET /api/studio/:id` and `GET /api/studio/passport/:slug` need no sign-in, and
  `GET /api/studio/current` answers any artist who has booked at the studio. They returned
  whole `Engineer`, `Room` and `ServiceOffering` rows, and the whole `Studio` row with only
  `stripe_account_id` and `platform_fee_bps` removed. That published each engineer's login
  (`user_id`) and the rate the studio pays them (`hourly_rate_usd`), plus the studio's own
  phone and email, its passport mint counter (`mint_letter`, `passport_seq`) and the
  services' `max_price_usd`. The engineer rate is not what an artist pays: a booking is
  priced from the service (`bookings.controller.ts`), and the only screen that showed the
  rate is the booking wizard's engineer step, which is unreachable.
- `GET /api/studio/passport/:slug` also spread the raw `circle_members` rows next to the
  presented `circle`. Those rows carried each consenting member's artist id, full name,
  alias, avatar and passport code even when the artist had chosen to appear as initials
  only.
- `GET /api/studio-circle/current-work` returned whole `Project` rows, including the
  producer's private `notes`, to every studio the project had booked, and whole `Booking`
  rows for the unlinked sessions.

**What changed.**

- `apps/api/src/routes/studio.routes.ts`: explicit `publicStudioSelect`, `publicRoomSelect`,
  `publicEngineerSelect` and `publicServiceSelect`, following the convention in
  `artists.routes.ts`, used by `/:id`, `/passport/:slug` and `/current`. They keep what the
  booking page, the studio passport and the staff screens read: studio id, slug, name,
  timezone, currency, operating hours, address, logo, hero image (and the derived
  `image_url`), amenities; rooms with their displayed `hourly_rate`; engineers' name,
  specialties, bio and avatar; services with `min_price_usd`, the price an artist pays.
  `/current` still adds `platform_fee_bps` for the studio's own operators only. The
  passport drops the raw `circle_members` and keeps only the consent-filtered `circle`.
- `apps/api/src/routes/studio-circle.routes.ts`: `current-work` selects the project's id,
  title, phase, last session, artist, producer and recent bookings, and the session's id,
  times, status, artist, engineer, room and service. That is what `PulseDashboard.tsx`
  renders.
- `apps/web/src/pages/BookingPage.tsx`: the unreachable engineer step no longer renders
  an engineer rate.
- No schema change.

**Evidence.**

- New `apps/api/src/integration/public-response-fields.integration.test.ts`, 5 subtests.
  Each response is walked recursively, and none of the internal keys may appear at any
  depth. The private values seeded into the studio, project and bookings must not appear
  anywhere in the JSON. Each response must still carry every field its web screen reads.
- Mutation: with `GET /studio/:id` put back to `include: { rooms: true, engineers: true,
  services: true }`, the `/studio/:id` subtest fails. The failure names `user_id`,
  `hourly_rate_usd`, `phone`, `email` and the other leaked keys. The file was restored from
  a `cp` backup, and `cmp` confirmed it byte-identical.
- Both typechecks pass.
- `npm test`: API unit 119/119, intelligence 31/31, web 113/113.
- `npm run test:integration:local`: 242 passed, 0 failed, 1 todo (the tenancy sweep's
  owner-decision todo), on a fresh database.
- `npm run build` passes.
- `npm run security:secrets` passes over 511 files.

**Not exercised.** No page was driven in a browser. The booking page, the passport page and
the Pulse dashboard were checked by reading which fields they use, by typecheck and build,
and by the test's assertions that those fields are still present.

**Observed, not changed.**

- `GET /api/engineers` and `GET /api/engineers/:id` still return `hourly_rate_usd` to
  any signed-in account that passes a `studio_id`. No web page calls either route.
- A studio's public contact phone and email are no longer published. No screen showed
  them; publishing them would be a product decision.
