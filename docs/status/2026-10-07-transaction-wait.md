**Every transaction waits for a connection, not just Weave's, 2026-10-07.** Starting an
interactive transaction waits for a pooled connection, 2s by default in Prisma. When opening a
connection takes longer, on a busy host or after Neon drops an idle one, the work fails with
P2028 before it starts. Weave syncs lost bookings that way (fixed for Weave alone in
`2026-10-07-weave-sync-race.md`); 24 other interactive transactions, bookings, payments, room
and engineer checks among them, still used the default.

- **What changed.** `lib/prisma.ts` sets `transactionOptions: { maxWait: 10_000 }` on the
  client, the wait the booking transaction already set for itself. A call that sets its own
  options keeps them. How long a transaction may run (`timeout`) is unchanged.
- **Evidence.** `transaction-wait.integration.test.ts` puts a proxy in front of the test
  database that holds each new connection for three seconds and runs four transactions with
  no options at once. Without the default, three of four fail with P2028; with it, all four
  return. Integration 182 of 182 on a fresh database; the API typecheck passes.
- **Not changed.** Money behaviour: amounts, ledger writes and Stripe calls are untouched; only
  how long a transaction waits to start.
