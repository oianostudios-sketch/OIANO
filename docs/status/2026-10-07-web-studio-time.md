**Session times read in the studio's zone on the remaining web pages, 2026-10-07.** Booking
and runsheet pages already used the studio's zone (C29), but the booking detail page, the
receipt, both dashboards, the studio status bar and ticker, the studio clock, the calendar,
the artist profile, the producer's project page and the maintenance booking table still
formatted session times in the browser's zone. An artist in Los Angeles looking at a 3 PM
Auckland session saw 7 PM the day before.

- **What changed.** `lib/fmt.ts` gains `studioClock`, `studioMinutes`, `studioWallClock`,
  `zoneName`, `studioZoneLabel`, `fmtStudioTime` and `fmtStudioRange`. Session times on the
  pages above are formatted in the booking's studio zone, and carry the zone's short name
  ("GMT+13", "EDT") when the viewer's own clock reads differently; the receipt and the
  cross-studio maintenance table always name it. "Today" on the dashboards, the status bar
  and the engineer dashboard is the studio's day. The studio clock dial, its room arcs, its
  needle and its hour persona use the studio's zone, as the server's outer ring already did.
  The calendar places each session at its own studio's wall clock, and staff see their
  studio's "now" and "today". Rescheduling from the booking page now starts from, and sends,
  the studio's date and time; it used to mix the UTC date with the browser's time. The admin
  walk-in form does the same with the studio's wall clock. The booking page's review step
  no longer shows the day before for a viewer west of UTC (`new Date('YYYY-MM-DD')` is UTC
  midnight).
- **API.** No schema change. The studio's `{ id, name, timezone }` is added to `GET
  /api/bookings`, the sessions in `GET /api/artists/:id`, the producer's projects and
  available sessions, the artist's projects and `GET /api/maintenance/bookings`; the
  maintenance search's booking hit gains `studio_timezone` and `GET /api/studio-clock` gains
  `timezone`.
- **Evidence.** `fmt.test.ts` runs with the viewer's zone set to Los Angeles and a studio in
  Auckland (4 new tests); `pages/studioTimeDisplay.test.ts` renders the booking page, its
  reschedule form and the receipt, and checks the dial angle (4 tests). Putting the
  browser-zone code back fails all 4 page tests; removing the same-clock check from
  `studioZoneLabel` fails 2 helper tests. `studio-zone-responses.integration.test.ts` checks
  the list (artist and staff), profile and clock responses carry exactly the studio's id,
  name and zone; removing the additions fails all three subtests. Integration 156 of 156 on
  a fresh database; API unit 102, intelligence 31, web 96, both typechecks, the build and the
  secret scan pass.
- **Left in the browser's zone, deliberately.** Message, notification, file-upload, activity
  and audit timestamps, "generated at"/"checked at" stamps and relative times are events the
  viewer witnessed, not studio appointments. Greetings, the dashboard date line, the ambient
  sun arc, the second hand and the focus face's countdown progress are the viewer's own
  clock. A project's "last session" date names no single studio. The onboarding formation
  slot is always empty today. The calendar shows no zone label, and an artist's calendar
  keeps the browser's "now" and "today", since one artist's sessions can span studios.
