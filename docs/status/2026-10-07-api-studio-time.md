**What the API sends people states session times on the studio's clock, with the zone named, 2026-10-07.**
PR #37 put the room-clash refusal and the booking-status notification on the studio's clock.
The booking emails, the receipt, the completion screen's notification, the creator's
"tomorrow" and the artist's yearly stats still read the server's zone, so an Auckland
session at 09:00 on 15 October reached an artist as 14 October (and "08:00 PM", no zone)
from a server in UTC or anywhere west.

- **What changed.** `lib/studioClock.ts` gains `studioDayLabel` ("Tue, Oct 15") and
  `studioWhenLabel` ("Tue, Oct 15, 09:00–11:00 (Pacific/Auckland)"), built on `studioTime`;
  the booking-status notification now uses `studioWhenLabel` with unchanged text. The
  confirmation, completion and cancellation emails take the studio's `timeZone` (required,
  so no caller can omit it) and state the session's day, studio wall clock and zone; their
  subjects use the studio's day. The receipt states the session's day and times in the
  booking's studio zone, named, and its issue date as a UTC date labelled "UTC" (it records
  when, not an appointment). Each email is now built by a pure function
  (`bookingConfirmedEmail`, `sessionCompleteEmail`, `bookingCancelledEmail`, `receiptEmail`)
  that its `send…` wrapper calls. The completion screen's notification
  (`POST /api/bookings/:id/complete`) states the session with `studioWhenLabel`, as the
  status notification does. A creator's next action says "tomorrow" by the session's
  studio calendar (the query loads the studio's zone). `GET /api/passport/stats` puts each
  session in its studio's year and month; a session in a later year no longer counts as
  "this year". The maintenance growth chart buckets sign-ups and bookings by UTC month,
  not the server's.
- **API.** No schema change; no money, Stripe, wallet or ledger code touched.
- **Evidence.** `lib/studioTimeMessages.test.ts` (7 tests, run with the process zone set to
  Los Angeles) asserts the exact label, the confirmation, completion and cancellation email
  subject and session line, the receipt's day, times and UTC issue date, and the studio
  "tomorrow", for an Auckland studio where the wrong zone gives a different date.
  `integration/studio-time-messages.integration.test.ts` (server zone Los Angeles) asserts
  the completion notification's exact body and that the stats put an Auckland 1 March 00:30
  session in March. Mutations, each restored and confirmed with `cmp`: dropping `timeZone`
  from `studioDayLabel` failed 6 of 7 unit tests; restoring the old `toDateString` "tomorrow"
  and the old receipt issue date failed those 2; restoring the old completion label failed
  the integration test (`Mon, Oct 14` instead of `Tue, Oct 15, 09:00 (Pacific/Auckland)`);
  restoring the server-month stats bucket failed the stats subtest. Integration 189 of 189
  on a fresh database; API unit 119, intelligence 31, web 103, both typechecks, the build
  and the secret scan pass.
- **Hits of the sweep left alone, and why.**
  `bookings.controller.ts:393` and `bookings/session-management.controller.ts:60` read the
  end hour already in `studio.timezone` for the policy check; not message text.
  `studioClock.ts` `zonedParts` is the zone-aware helper itself. `businessSignals.ts:157`
  formats a dollar number, not a date. `pulse.routes.ts:31` computes a 30-day query window,
  never shown. `card.routes.ts` already formats in the booking's studio zone through
  `lib/fmt.ts` (whose `tz` parameter is always passed); its `?? 'America/New_York'`
  fallback is unreachable because `Studio.timezone` is non-null. `maintenance.routes.ts:85-93`
  already bucket by UTC date. `studio-clock.routes.ts:168` stamps DAW notes with an ISO
  UTC time, a record of when. `sessionLog.ts:69` writes `starts_at` to the database, not to
  a person. The AI contexts (`intelligence/context/context-builder.ts`) carry durations and
  counts, no clock times; activity events carry `starts_at` as data, no text.
- **Not exercised.** There are no reminder or reschedule emails or notifications in the API
  today (a reschedule only publishes a live update), so none were changed. The emails are
  tested as built text; SendGrid delivery is blanked locally. `sendDeliveryEmail`,
  `sendTopUpEmail`, the invitation and password-reset emails state no times.
