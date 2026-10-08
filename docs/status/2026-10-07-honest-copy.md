**Screens, a refusal and a notification say only what is true, 2026-10-07.** Signup,
professional onboarding and the studio invitation page promised that a creative account
could also hold studio staff positions, which it cannot today (audit C04). A recurring
booking refused for a room clash, and the notification an artist gets when a booking's
status changes, named the date in the server's zone, so an Auckland session on the 15th
could read as the 14th. The artist dashboard greeted someone without a name by the part of
their email address before the `@`, and someone who skipped the name at signup as "New
artist".

- **What changed.** `EnterPage` and `ProfessionalOnboardingPage` now say that, for now,
  running a studio or working on a studio's staff needs a separate studio account, and
  onboarding adds that the creative profile cannot hold studio access.
  `AcceptStudioInvitePage` tells an artist or producer account that accepting adds them to
  the team but gives no studio access, and tells a studio account it receives the position
  and permissions the studio chose. This is C04's interim action; contextual authorization
  (migration step 5) is what lets one identity hold both.
  The room-clash 409 in `POST /api/bookings` reads, for example, "Time slot not available on
  2030-10-15, 09:00–11:00 (Pacific/Auckland)": the clashing booking's date and times on the
  studio's clock, and the zone. The status notification reads "Your session on Tue, Oct 15,
  09:00 (Pacific/Auckland) is confirmed." `lib/studioClock.ts` gains `studioTime` (HH:MM in a
  zone), and `findRoomClash` also returns the clash's `ends_at`. Reschedule and the admin
  walk-in refusals name no date and are unchanged.
  The signup placeholder names (PR #32) move to `packages/shared/src/placeholderNames.ts`
  with `isSignupPlaceholderName`; the API's signup and the web app (greeting and the
  onboarding name field) use them, the web app importing the file from source because its
  Render build does not build `packages/shared`. The dashboard greeting uses the alias or
  name, treats a placeholder as no name, and otherwise omits the name
  (`lib/greetingName.ts`); no part of the email is shown.
- **Evidence.** `booking-conflict-zone.integration.test.ts` uses an Auckland studio with a
  session at 20:00–22:00Z on 14 October 2030 and asserts the exact 409 text and the exact
  CONFIRMED notification body. Putting the server-zone formatting back fails each: the 409
  read "on 14/10/2030", the notification "Mon, Oct 14"; restored and confirmed with `cmp`,
  both pass. `studioClock.test.ts` adds a `studioTime` test (3 assertions).
  `pages/studioAccessCopy.test.ts` renders signup (creative professional selected),
  onboarding and the invitation page for artist, producer and studio accounts (4 tests);
  the old copy fails all of them. `lib/greetingName.test.ts` has 3 tests; dropping the
  placeholder check fails one. Integration 186 of 186 on a fresh database; API unit 107,
  intelligence 31, web 103, both typechecks, the build (and the web build alone) and the
  secret scan pass.
- **Not exercised.** The dashboard page itself is not rendered in a test; the helper is.
  Booking emails were not checked for the same zone problem.
