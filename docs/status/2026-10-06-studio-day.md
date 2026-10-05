**Availability and the runsheets answer for the studio's own day, 2026-10-06 (closes C29 in
part; `AvailabilitySlot` stays unread and unwritten until migration step 6).** A day at a
studio now runs from the studio's midnight to the next in its own time zone, the one the
studio clock already used (A09), and a session belongs to every day it overlaps.

What was wrong:

- `GET /api/availability` answered for the UTC day, `00:00Z` to `23:59:59Z`. For a studio
  in Auckland or Los Angeles that is mostly a different day, so the booking page showed
  sessions from the wrong day as taken and left the right day's sessions open.
- `GET /api/engineers/runsheet` and `GET /api/admin/runsheet` cut the day at the server's
  midnight (`setHours`), and with no date they used the server's today. The server's zone
  is not any studio's.
- All three counted only sessions starting inside the day, so a session running across
  midnight was missing from the day it ran into.
- The booking page read the chosen date and hour in the browser's zone, while the booking
  policy reads the end hour in the studio's zone (`bookings.controller.ts`). The runsheet
  page always sent the UTC date as today and printed times in the browser's zone.

What changed:

- `lib/studioClock.ts` gains `studioDateBounds(date, timeZone)` (a named day's start and
  end at the studio) and `studioDate(moment, timeZone)` (the studio's date at a moment);
  `studioDayBounds` now uses them, with the same results.
- Availability selects bookings with `starts_at < end` and `ends_at > start` for the named
  day at the studio. The response keeps `{ date, bookings }`, with the same four fields
  per booking, and adds `timezone`. `date` and `studio_id` are still required.
- Both runsheets do the same; with no date they use today at the studio. `date` in the
  response is the day asked for, and they add `timezone`.
- Web: the booking page converts the chosen date and hour slots in the studio's zone for
  the slot grid, the conflict check and the booking it creates, and its date picker's
  earliest day is today at the studio (`studioTimeToIso`, `studioDate` in `lib/fmt.ts`).
  The runsheet page sends no date for today, takes the date from the response, prints
  times in the studio's zone, and steps days by calendar date.
- Nothing claimed `AvailabilitySlot` was read: the availability route now says it reads
  bookings only, and `businessDefinitions.ts` already called the model dead schema.

**Evidence.**

- `apps/api/src/integration/studio-day.integration.test.ts`, "availability and the
  runsheets answer for the studio's own day": Auckland on 29 September 2030 (clocks
  forward, a 23-hour day) and Los Angeles on 3 November 2030 (clocks back, a 25-hour day),
  with sessions across the opening midnight, early morning still on the previous UTC day,
  late evening, one ending exactly at midnight, one just after the closing midnight, and a
  cancelled one. Availability (with and without a room) and both runsheets return exactly
  the expected sessions; the neighbouring days each hold the overnight session. With no
  date, both runsheets return today at studios in `Pacific/Kiritimati` (UTC+14) and
  `Pacific/Pago_Pago` (UTC-11), whose dates always differ, so no single server day passes.
- Unit tests: `studioClock.test.ts` (a named date in Auckland and Los Angeles, the 25-hour
  day, a year end; the studio's date against the UTC date) and `apps/web/src/lib/fmt.test.ts`
  (wall time to instant in both zones, `24:00`, both DST days; the studio's date).
- Defects put back, each restored from a copy and confirmed byte-identical with `cmp`:
  - availability on the UTC day: Auckland and Los Angeles fail (`['late', 'next day']`
    for Auckland);
  - availability counting only sessions that start in the day: both fail, the overnight
    session missing;
  - availability on a fixed 24-hour day from the studio's midnight: both fail (Auckland
    gains `next day`, Los Angeles loses `last hour`);
  - engineer runsheet on the server's day (`setHours`, run in `Europe/Bucharest`): all
    three runsheet tests fail, including today at Kiritimati (`2026-10-05` for
    `2026-10-06`);
  - engineer runsheet counting only sessions that start in the day: both dated tests fail;
  - admin runsheet on the server's day: all three runsheet tests fail;
  - web conversion in the browser's zone: both new `fmt` conversion tests fail.
- Verify table: both typechecks pass; `npm test` passes (API unit 104, intelligence 31,
  web 88 in 12 files); `npm run test:integration:local` passes 119 of 119 on a fresh
  database; `npm run build` and `npm run security:secrets` pass.

**Not exercised.** The web pages were not driven in a browser; their changes are covered
by the typecheck and the `fmt` unit tests only. A server whose own zone is UTC (as in
production) was not run; the today test does not depend on the server's zone.

**Observed, not changed.**

- Recurring bookings repeat at fixed 7×24-hour steps (`bookings.controller.ts`), so a
  series crossing a DST change moves an hour on the studio's clock.
- `GET /api/admin/analytics` counts days in UTC, and `studio.routes.ts` builds a "today"
  end with the server's `setHours`.
- Other pages (booking detail, dashboards) print booking times with `fmtTime` and no zone,
  that is in the browser's zone.
- The date parameters accept any `YYYY-MM-DD`, so `2026-02-31` is read as 3 March.
- The runsheet's "Generated" time is printed in the browser's zone.
- `studio-setup` counts a room's or engineer's `AvailabilitySlot` rows before deleting it;
  that count is the model's only read.
