**A weekly booking keeps its studio-local time across a clock change, 2026-10-07.** Each
session of a recurring booking was the first session's instant plus 7 × 24 hours
(`bookings.controller.ts`), so a weekly 18:00 session in London became 19:00 after the
clocks went back and 17:00 after they went forward, and the conflict check looked at
those shifted times.

- **What changed.** `lib/studioClock.ts` gains `studioLocalToInstant` and
  `weeklyOccurrences`. Each session is the first one's studio-local date plus 7 × i days
  at the same local start and end times, converted to an instant on its own date in the
  studio's `timezone`; the duration is kept in wall-clock terms, and the first session is
  stored exactly as requested. A local time inside the spring-forward gap moves forward by
  the gap (01:30 becomes 02:30 BST); a time the fall-back repeats takes the earlier
  instant. That is Temporal's 'compatible' rule, and the code comment says so. A session
  that a gap would shrink to nothing is refused with 409. The conflict check still runs
  over every session, now at their real times. Price per session is unchanged.
- **Evidence.** Four new unit tests in `studioClock.test.ts`, with every instant worked
  by hand: London and New York across both their March and October/November changes, an
  overnight New York session on the night the clocks go back, and the gap and overlap
  rules in both zones. `recurring-dst.integration.test.ts` books through
  `POST /api/bookings`: a four-week London series over the October change, a New York
  series over the March change, and a series refused with 409, and the wallet left
  uncharged, because its third session meets a booking only at its real time.
  Mutation: with `main`'s 7 × 24-hour arithmetic restored, all three integration subtests
  fail; choosing the later instant for a repeated time fails the gap/overlap unit test.
  API unit 106 of 106, intelligence 31 of 31, web 88 of 88, both typechecks, the build
  and the secret scan pass. Integration 157 of 159 on a fresh database: the two failures
  are `lifecycle-guards`' "Studio Circle: answers sent together produce one decision" and
  its parent, which fail the same way with `main`'s code in place, a race in Circle
  consent that this change does not touch.
- **Not exercised.** The web booking page only sends `repeat_weeks` and shows the first
  session, so it needed no change and has no new test. Zones that change their clocks by
  other than an hour, or twice within two days, are not tested.
