**Weave syncs wait for a slow database connection instead of giving up, 2026-10-07.** The
Weave test "bookings synced at the same moment are all counted" failed now and then on a busy
machine. The cause was not a lost count. The recorded failure (a local integration run on
2026-10-07) was `P2028: Unable to start a transaction in the given time`, thrown from
`syncConnectionFromBooking`. Each sync running at once needs its own pooled connection, and
opening one took longer than Prisma's default 2 s `maxWait`. Booking completion only logs a
failed sync, so in use that booking would have gone uncounted until a later sync of the same
pair.

- **What changed.** `lib/weave/sync.ts` starts its transaction with `maxWait: 10_000`, the
  value the booking transaction already uses. The counting logic is unchanged.
- **Why the count was already right.** The sync locks the connection row (`SELECT ... FOR
  UPDATE`) before it inserts evidence. It then recounts from the evidence in a new statement,
  and under READ COMMITTED that statement sees every earlier sync's committed evidence. A
  harness that ran 500 syncs in rounds of 10 at once lost no counts. With `FOR UPDATE`
  removed, 19 of 20 rounds lost a count, so the harness can catch the race.
- **Evidence.** The new file `weave-sync-slow-connections.integration.test.ts` routes the
  database through a local proxy that holds back each new connection for 3 s, then syncs six
  bookings at once. On `main`'s code it fails every time: 5 of 6 syncs throw P2028, the error
  from the original failure. With the fix all six succeed, and count, evidence and dates are
  exact. Restored from backup and confirmed with `cmp`. Integration on a fresh database:
  181 of 181. API unit 106, intelligence 31 and web 96 pass. Both typechecks, the build and
  the secret scan pass. A first `npm test` run failed once. Its output was truncated, so the
  failing test is unknown, and a full rerun passed.
- **Not changed.** Other interactive transactions still use the 2 s default `maxWait`.
  Booking completion still logs and skips a sync that fails for any other reason. There is no
  retry or repair job.
