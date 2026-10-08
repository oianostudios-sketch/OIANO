**A booking whose Weave sync failed is now counted on the next repair run, 2026-10-07.**
Booking completion runs `syncConnectionFromBooking` but only logs a sync that fails, so a
booking whose sync failed for any reason (a database error, a timeout, a restart mid-request)
stayed out of its artist and studio's connection until a later booking between the same pair
re-synced it, and without one, for good. The 2026-10-07 `weave-sync-race` change removed one
cause and noted there was no repair.

- **What changed.** `lib/weave/repair.ts` adds `repairMissedWeaveSyncs({ limit, since })`.
  - It finds completed bookings with no Weave evidence, oldest session first, at most `limit`
    (default 50), and runs the existing `syncConnectionFromBooking` for each. It counts
    nothing itself, and no schema changes.
  - **Repair, not backfill.** By default it considers only bookings that completed in the
    last 7 days. Booking has no completion timestamp, so the window is measured on
    `updated_at`, which every completion path sets through Prisma. An edit to an old completed
    booking also moves `updated_at` and can bring that one booking into the window. Bookings
    completed before the Weave existed stay out; syncing them remains
    `prisma/backfill-weave.ts`, by the owner's decision.
  - A booking whose repair fails is skipped for an hour by that process, so it cannot keep
    newer missed bookings out of a bounded run. The record is in memory and a restart clears
    it.
  - A run holds `pg_try_advisory_xact_lock` in a transaction, so on several instances one runs
    at a time and a run that finds the lock taken does nothing.
  - `index.ts` schedules it a minute after start and every ten minutes after, skipped under
    `NODE_ENV=test` (tests and `dev:local`).
  - `prisma/repair-weave.ts` (`npm run db:repair-weave --workspace=apps/api -- [limit]
    [--days=N | --all]`) runs it by hand, with the same 7-day default.
- **Evidence.** The new `weave-repair.integration.test.ts` completes bookings through
  `recordBookingCompleted` while a test-only trigger makes their evidence insert fail, and
  checks the connection lacks them. It then checks:
  - a run is skipped while the lock is held;
  - with limit 1, the oldest missed booking, which keeps failing, is tried and fails, and the
    next run skips it and repairs the next one;
  - a run with the scheduled defaults brings both pairs' count, evidence and first and last
    dates to exactly the right values, and leaves alone a booking completed 30 days ago and a
    pending booking;
  - a further run changes nothing;
  - a run with `since: null` reaches the 30-day-old booking.

  Mutations, each restored from backup and confirmed with `cmp`: repair not calling the
  sync, newest-first order, ignoring the lock, no window, and not skipping failed bookings
  each fail the test. Integration on a fresh database: 182 of 182. API unit 106, intelligence
  31 and web 96 pass. Both typechecks, the build and the secret scan pass.
- **Not exercised.** The scheduler itself (it does not run under test), the CLI, and a run on
  several real instances at once. A sync missed by more than 7 days is not repaired by the
  scheduled run.
