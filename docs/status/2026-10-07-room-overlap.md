**A booking that contains another in the same room is refused with 409, 2026-10-07.** The
room check on an artist booking (`bookings.controller.ts`), a reschedule
(`bookings/session-management.controller.ts`) and a staff walk-in (`admin.routes.ts`)
asked whether an existing session's start or end fell inside the new one's range, so a new
13:00–16:00 session passed the check against an existing 14:00–15:00 one. The room's
exclusion constraint (`bookings_room_time_no_overlap`) still refused the write, so no room
was ever double-booked, but the artist booking and the walk-in answered 500, and a walk-in
had already created its guest account before the refused booking.

- **What changed.** One check, `lib/roomSchedule.ts` `findRoomClash`, used by all three
  paths: it locks the room's row, then looks for a live booking with
  `starts_at < new end AND ends_at > new start`, the test `lib/engineerSchedule.ts` uses for
  engineers. It runs inside the transaction that writes the booking: the artist booking's
  existing serializable transaction (before the wallet debit), the reschedule's existing
  transaction (after the booking's lock, before the engineer's), and a new transaction that
  now holds the walk-in's guest account and booking together. The artist booking maps a
  constraint refusal (Postgres 23P01) to 409 as the reschedule already did; the mapping moved
  from the reschedule controller into `roomSchedule.ts`. Wallet, ledger and payment writes
  are unchanged.
- **Evidence.** `room-overlap.integration.test.ts`, 9 cases: containing, contained, crossing
  either edge and identical ranges are refused with nothing charged; back-to-back sessions
  are allowed; cancelled and no-show sessions hold no time; a recurring booking whose later
  week contains a session is refused whole; a reschedule into a containing range is refused
  and changes nothing; a containing walk-in is refused and leaves no guest account; five
  nested bookings sent together for one room place one and refuse four with 409, three
  rounds. On `main`'s code 4 cases fail (500 instead of 409 for containing, recurring,
  walk-in and concurrent bookings). Mutation: restoring the start-or-end predicate in
  `findRoomClash` fails 2 cases (the direct check and the containing booking, which is then
  refused by the constraint rather than the check); restored, confirmed with `cmp`.
  Integration 162 of 162 on a fresh database; API unit 102, intelligence 31, web 88, both
  typechecks, the build and the secret scan pass. `lifecycle-guards` "Studio Circle: answers
  sent together produce one decision" failed in one earlier local run on `main`'s code and in
  one with this change, under heavy machine load; it is unrelated and passed in the final run.
  After merging `main` (#27, #28) the suite ran 163 of 165, the two failures being that same
  test and its parent.
- **Not exercised.** The room lock and the 23P01 mapping are each covered by the constraint
  and serializable isolation as well, so removing either one alone changes no test result.
  Display-only overlap reads (availability, studio clock, engineer schedule) already use the
  correct test and were not changed.
