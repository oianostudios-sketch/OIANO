**A booking whose Weave sync failed is now counted on the next repair run, 2026-10-07.**
Booking completion runs `syncConnectionFromBooking` but only logs a sync that fails, so a
booking whose sync failed for any reason (a database error, a timeout, a restart mid-request)
stayed out of its artist and studio's connection until a later booking between the same pair
re-synced it, and without one, for good. The 2026-10-07 `weave-sync-race` change removed one
cause and noted there was no repair.

- **What changed.** `lib/weave/repair.ts` adds `repairMissedWeaveSyncs({ limit })`. It finds
  completed bookings with no Weave evidence, oldest first and at most `limit` (default 50),
  and runs the existing `syncConnectionFromBooking` for each. It counts nothing itself. A run
  holds `pg_try_advisory_xact_lock` in a transaction, so on several instances only one runs at
  a time and a run that finds the lock taken does nothing. `index.ts` schedules it a minute
  after start and every ten minutes after, skipped under `NODE_ENV=test` (tests and
  `dev:local`). `prisma/repair-weave.ts` (`npm run db:repair-weave --workspace=apps/api`) runs
  it by hand. No schema change.
- **Evidence.** The new `weave-repair.integration.test.ts` completes bookings through
  `recordBookingCompleted` while a test-only trigger makes their evidence insert fail, and
  checks the connection lacks them. It then checks that a run is skipped while the lock is
  held, that a run with limit 1 repairs only the oldest, and that the next run brings the
  count, evidence and first and last dates of both pairs to exactly the right values. A
  pending booking stays out, and a further run changes nothing. Mutations, each restored from
  backup and confirmed with `cmp`: repair not calling the sync, newest-first order, and
  ignoring the lock each fail the test. Integration on a fresh database: 182 of 182. API unit
  106, intelligence 31 and web 96 pass. Both typechecks, the build and the secret scan pass.
- **Not exercised.** The scheduler itself (it does not run under test), and a run on several
  real instances at once. A booking whose sync fails every time stays at the front of the
  queue, and `limit` such bookings would block the rest. Each failure is logged.
