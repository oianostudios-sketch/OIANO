**R1: concurrent Stripe refunds now serialize cumulative payment state and ledger posting.**

Prepared on `fix/r1-stripe-refund-concurrency`, 2026-10-21; uncommitted and awaiting owner review.

The refund handler read `Payment.refunded_usd` before its transaction. Two distinct
`charge.refunded` events could both read zero. After one updated the payment, the
other's optimistic `updateMany` matched no row and returned successfully. The route
then marked that event COMPLETED, so replaying it could not recover the missing refund.
For cumulative refunds of $20 and $50, a $20 winner left $30 unrecorded: cash clearing
was overstated by $30, studio payable by $27 and platform revenue by $3 at a 10% fee.
Payment and ledger could agree with one another while both understated Stripe's refund.

The handler now selects the eligible payment with a parameterized `SELECT ... FOR UPDATE`
inside the transaction, reads its current state under that lock, and posts only a positive
delta. The lock lasts through the payment update and `postFinancialTransaction` call.
Larger totals advance the refund; equal or older totals are no-ops. A full refund remains
terminal. The existing allocation, source keys, webhook signature validation and replay
handling are unchanged. No schema change or migration was introduced.

**Evidence**

- New signed-HTTP/PostgreSQL regression uses a SHARE table-lock barrier and observes
  both requests waiting before releasing them. It covers cumulative $20/$50, reversed
  delivery order, and equal $20/$20 totals, plus event replay, new events with equal
  totals and stale events. It asserts payment status, cumulative amount, completed
  event claims, balanced postings and cash/payable/revenue totals.
- Observed before repair: in the recorded baseline run, both different-total cases
  failed with `20 !== 50`; the equal-total case passed. Both concurrent HTTP responses
  were 200. Fixture setup errors were corrected before this baseline run.
  These are observed failures, not a guarantee that both delivery orders fail on
  every old-code run. The barrier establishes concurrent database lock waits but
  does not guarantee which update wins after release. With both events reading the
  same prior total, a $20 winner can cause the $50 event to lose its claim and leave
  $30 unrecorded; a $50 winner can leave the correct cumulative amount and let the
  assertion pass. Request start order alone does not determine the winner.
  The evidence establishes the defect under an observed interleaving, not a
  deterministic old-code failure or failure rate for either delivery order.
- After repair: all 4 reported tests pass (three subtests and their parent), including
  a targeted rerun after the final query change and the full suite.
- `npm run test:integration:local`: 264/264 pass, zero failed/skipped/cancelled/todo,
  on a fresh database in this checkout's verified local PostgreSQL cluster at
  127.0.0.1:55432. All 21 tracked migrations applied only to this local database.
- An earlier full run had 251 passes and two module-load failures because a concurrent
  build temporarily removed shared/dist. The final run was performed after the build
  finished and passed all 264 tests; those two files contain additional subtests.
- Shared package build, API and web typechecks, and `npm run build`: pass.
- `npm test`: 5 secret-scanner tests, 128 API security tests, 31 intelligence tests,
  117 web tests in 17 files, all pass.
- `npm run security:secrets`: pass across 536 tracked files; the same scanner is also
  run explicitly on the new test and this untracked status record before handoff.
- The five pre-existing documentation changes were preserved byte-for-byte, checked
  using SHA-256 hashes. Nothing staged, committed, pushed, merged or deployed.

**Not exercised:** live Stripe delivery and production data reconciliation. Signed
fixtures exercise the real webhook endpoint against isolated PostgreSQL. This repair
prevents future lost updates; it does not discover or repair previously missed refunds.

**Observed, not changed:** existing USD/Decimal representation, per-delta fee rounding,
and current studio fee selection. Frozen architecture and other financial flows remain
outside this repair.

**Financial risks for a separate follow-up issue (outside R1)**

- Refunds arriving before settlement: the handler finds only PAID or
  PARTIALLY_REFUNDED payments. If settlement has not yet made the payment eligible
  (or stored its payment-intent ID), the refund can be acknowledged without a
  posting and its event marked COMPLETED. Later settlement does not replay that
  refund. Define durable deferral or reconciliation and test reordered delivery.
- Stuck PROCESSING webhook claims: the event claim is created before processing.
  A process crash can leave the claim behind; duplicate delivery then returns
  success without checking whether processing completed. Define safe recovery for
  abandoned claims while preventing concurrent processing and duplicate postings.
- Historical Stripe reconciliation: R1 does not identify or repair refunds missed
  before the fix. A separately authorized reconciliation should compare Stripe's
  authoritative refund history with payment state and ledger entries, then define
  reviewed, idempotent corrective postings. No production comparison or correction
  was performed as part of R1.
- Decreasing refund totals: equal or lower cumulative amounts are currently no-ops,
  and fully refunded payments are excluded. This protects against stale deliveries
  but cannot distinguish them from an authoritative correction or refund reversal
  that requires an accounting adjustment. Define how to verify such discrepancies,
  alert or reconcile them, and post any required adjustment without blindly undoing
  money on receipt of an older event. No such Stripe behavior was established by
  the R1 tests; the gap is in discrepancy handling and financial reconciliation.

Documentation correction on 2026-10-22 following independent review: clarified the
limits of the old-code timing evidence and recorded follow-up risks. Application
code and tests were not changed or rerun for this documentation-only correction;
the verification results above are the recorded R1 runs.
