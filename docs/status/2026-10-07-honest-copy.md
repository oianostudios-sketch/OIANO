**Three screens and one refusal say only what is true, 2026-10-07.** Signup and
professional onboarding promised that a creative account could also hold studio staff
positions, which it cannot today (audit C04). A recurring booking refused for a room clash
named the clashing date in the server's zone, so an Auckland session on the 15th could read
as the 14th. The artist dashboard greeted someone without a name by the part of their email
address before the `@`.

- **What changed.** `EnterPage` and `ProfessionalOnboardingPage` now say that, for now,
  running a studio or working on a studio's staff needs a separate studio account, and
  onboarding adds that the creative profile cannot hold studio access. This is C04's interim
  action; contextual authorization (migration step 5) is what lets one identity hold both.
  The room-clash 409 in `POST /api/bookings` reads, for example, "Time slot not available on
  2030-10-15, 09:00–11:00 (Pacific/Auckland)": the clashing booking's date and times on the
  studio's clock, and the zone. `lib/studioClock.ts` gains `studioTime` (HH:MM in a zone), and
  `findRoomClash` also returns the clash's `ends_at`. The dashboard greeting uses the alias or
  name and otherwise omits the name (`lib/greetingName.ts`); no part of the email is shown.
  Reschedule and the admin walk-in refusals name no date and are unchanged.
- **Evidence.** `booking-conflict-zone.integration.test.ts` books against a CONFIRMED session
  at 20:00–22:00Z on 14 October 2030 in an Auckland studio and asserts the exact 409 text.
  Putting the server-zone `toLocaleDateString()` back fails it ("on 14/10/2030"); restored and
  confirmed with `cmp`, it passes. `studioClock.test.ts` adds a `studioTime` test (3
  assertions). `pages/studioAccessCopy.test.ts` renders the signup (creative professional
  selected) and onboarding pages and checks the new statements and the absence of the old
  promises; putting the old copy back fails both tests. `lib/greetingName.test.ts` has 2
  tests. Integration 184 of 184 on a fresh database; API unit 107, intelligence 31, web 100,
  both typechecks, the build and the secret scan pass.
- **Not exercised.** The dashboard page itself is not rendered in a test; the helper is.
  `AcceptStudioInvitePage` still says accepting "adds a studio-specific position and
  permissions to your existing OIANO identity", which is untrue for an artist or producer
  account for the same reason (C04); it was outside this change. The booking status
  notification ("Your session on Tue, Oct 14…") still formats its date in the server's zone.
