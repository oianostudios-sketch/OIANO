# OIANO — build direction

What gets built next, in what order, and what "done" means at each stage. The target is
[`OIANO_FROZEN_ARCHITECTURE.md`](OIANO_FROZEN_ARCHITECTURE.md); the table-level design is
[`OIANO_SCHEMA_REDESIGN.md`](OIANO_SCHEMA_REDESIGN.md); what has landed, with evidence, is
[`OIANO_IMPLEMENTATION_STATUS.md`](OIANO_IMPLEMENTATION_STATUS.md).

## The base, as of 2026-09-14

- **Audit findings A01–A11 are fixed** and held by tests on a real database. A05 and A11
  were fixed inside the architecture audit itself; the rest are recorded in implementation
  status.
- **Stabilization gate: seven of eight gates pass.** Gate 2 is fixed on branch
  `claude/gate-2-schema-declarations`: `schema.prisma` declares what the migrations build,
  and CI fails on any drift. It merges after one read-only check against production.
- **Payouts are held to USD**, the currency every amount is earned in today, and refuse a
  studio whose ledger shows another currency until someone reconciles it. Settlement in any
  currency arrives with step 17.
- Development runs on a local database (`npm run dev:local`, `npm run
  test:integration:local`), so no agent or test touches the shared one.

## Stage 0 — the starting line

1. Run the production comparison on the gate 2 branch
   (`docs/OIANO_STABILIZATION_GATE.md`, "Before merging"). Exit 0: merge. Any difference:
   reconcile first.
2. Open a pull request for the branch so CI runs, then merge.
3. Run the stabilization gate again. When all eight gates pass, it recommends "Begin
   canonical Identity migration".
4. Optional, and the owner's call: run `prisma/backfill-weave.ts` against production, so
   stored Weave counts and dates are recomputed from evidence (A08).

## Stages 1–7 — the migration

The frozen order, grouped into stages that each end at something a person can do.

| Stage | Steps | Done when | Experience that can follow |
|---|---|---|---|
| 1. Identity | 1 Person · 2 CreativeProfile · 3 Discipline · 4 Organization and membership | Every Artist, Producer and Engineer id resolves to a CreativeProfile and every User to exactly one Person; one person can hold several disciplines; a studio records its pricing currency and payment media, and a professional joins a studio only by accepting | Profile and passport read from Person and CreativeProfile |
| 2. Formation | 5 Work · 6 Contribution · 7 Requirement · 8 Agreement · 9 MAKE v1 | An artist starts BAD HABITS alone; a producer Requirement opens; Malik accepts as a Contribution; terms are agreed between contributions | **MAKE** |
| 3. Discovery | 10 SKY v1 · 11 Work-specific invitation | People, studios and services are matched against a real Requirement; an invitation names the Work it is for | **SKY** |
| 4. The work | 12 Booking bridge · 13 WorkEvent · 14 Deliverable · 15 Version | A booked session records its price and currency and belongs to a Work; a recording happens as a WorkEvent; Mix 01, Mix 02 and the master are versions of one deliverable | Session and file views in Work context |
| 5. Money | 16 Economic Obligation · 17 Settlement | Producer and studio obligations carry amount, currency and due terms, and settle through a recorded medium; payouts settle per currency | Balances shown in their own currency |
| 6. Proof | 18 Credit · 19 Evidence · 20 Weave v2 | Credits and contributions are confirmed; Evidence records provenance; Weave relationships are recomputed from evidence | Verified marks backed by evidence |
| 7. Surfaces | 21 ME · 22 NOW · 23 Intelligence | The Golden Journey runs end to end | **ME**, **NOW**, recommendations |

The first slice is steps 1 and 2 together, with no route changes, as specified in
`OIANO_SCHEMA_REDESIGN.md` §7: expand, backfill, verify, and test backfill idempotency, the
parity check, and a user who holds both an Artist and a Producer row.

Screens keep today's names until their surface's step lands. Labelling a legacy screen NOW,
MAKE, SKY or ME before then presents a mechanism that does not exist yet.

## How every step ships

1. **On a branch.** `main` deploys automatically and migrations are applied by hand.
2. **Strangler order.** Add the new structure beside the old; backfill; move reads; move
   writes; verify parity; remove the old dependency; only then retire legacy tables.
3. **Tests before merge.** Backfill idempotency, a parity check against the legacy data,
   and every load-bearing assertion mutation-checked: put the defect back, watch the test
   fail, restore.
4. **Green checks.** Typechecks, unit and web suites, the integration suite on a fresh
   database, the build, the secret scan, and CI's migration drift check.
5. **Applied, then merged.** The migration runs against the database the code will use
   before the branch merges.
6. **Recorded.** An entry in implementation status: what landed, and its evidence.

## Decisions the owner still holds

| Decision | Needed by |
|---|---|
| Can a studio keep scheduling engineers who have no login? (proposed: yes, as unclaimed memberships) | Step 4 |
| Should an engineer see every booking at their studio, including unassigned ones? (today: yes) | Step 4 |
| Should a backfilled project make its artist a lead? (proposed: no) | Step 6 |
| Is evidence from a booking completed and then reversed before A02 retracted? | Step 19 |
| Which payment providers come first beyond Stripe cards, and who bears conversion when a rail settles in another currency? | Step 17 |
