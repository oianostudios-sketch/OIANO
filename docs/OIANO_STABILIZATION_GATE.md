# OIANO — stabilization gate

Session 5 of the stabilization track in [implementation status](OIANO_IMPLEMENTATION_STATUS.md).
Measured on 2026-09-13 at `109c4d9`, plus the cast removals described under gate 4. The
[frozen architecture](OIANO_FROZEN_ARCHITECTURE.md) lets the canonical migration begin only
when every gate below is yes.

**Result: not passed.** Seven gates are yes and gate 2 is no. Do not begin the canonical
Identity migration yet.

## Checks run

| Check | Result |
|---|---|
| API and web typechecks | Both pass |
| API security suite | 80 of 80 |
| API intelligence suite | 31 of 31 |
| Web tests | 60 of 60, in 8 files |
| Integration suite on a freshly created database | A new PostgreSQL 16 cluster and an empty database: all 20 tracked migrations applied, then 30 of 30 tests passed, none todo, skipped or cancelled |
| Secret scan | Passed across 406 tracked files |
| Latest CI run on `main` | Run 34747868628 at `109c4d9`: the verify and integration jobs, and every step in them, succeeded |
| Migrations against `schema.prisma` | `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code` exits 2: they differ |
| Client generation from the tracked schema | Prisma Client 5.22.0 generated with exit 0, into a scratch directory so the shared client was left alone |

No test in the repository is marked todo, skip or only. Nothing was run against production.

## Gates

### 1. Existing critical flows are reproducibly tested — yes

The 30 integration tests run on real Postgres, pass on a freshly built database, and pass in
CI. They cover signup, login and session checks; a booking paid from the wallet; the wallet
guard; booking lifecycle and cross-studio scope; Stripe settlement, replay, signature and
amount checks; checkout refusals; session completion with deliverables and rights; passport
privacy and session counting; creator and contribution invitations; Weave evidence; and who
receives live updates.

Known defects held as todo tests: none. A02, A03 and A08 began as todo tests and are fixed.
Not exercised: checkout's calls to Stripe to open, reuse or expire a session, and the wallet
top-up webhook. Stripe is disabled in production.

### 2. A fresh database builds from tracked migrations — no

All 20 migrations apply to an empty database and every test passes on it, but the database
they build is not the one `schema.prisma` describes. `prisma migrate diff` finds differences in
nine tables:

- **Key column types.** The migrations create `financial_transactions.id`,
  `financial_ledger_entries.id`, `financial_ledger_entries.transaction_id` and
  `session_completion_requests.id` as `UUID`. The schema declares all four as text.
- **Defaults only the database has.** Generated ids on `financial_transactions`,
  `financial_ledger_entries`, `policy_exceptions`, `rights_decisions`, `studio_policies` and
  `studio_staff_invitations`, and a current-time default on `updated_at` in
  `communication_threads` and `rights_decisions`.
- **An index only the database has**, on `studio_staff (studio_id, position)`.

Why this blocks: `prisma migrate dev` compares the same two things, so the first canonical
migration it generates would carry these changes too. It would change the key types of both
ledger tables and of session completion requests, drop and re-create those keys, and drop
eight defaults and an index, all inside an Identity migration. CI does not check for this.

The differences come from hand-written SQL in `20260820090000_session_completion_idempotency`,
`20260824120000_identity_bound_rights`, `20260824130000_financial_reconciliation_ledger`,
`20260825120000_studio_policy_engine`, `20260825130000_staff_positions_and_capabilities`,
`20260825140000_studio_staff_invitations` and `20260829120000_canonical_communications`.

### 3. The Prisma client generates cleanly — yes

Generation from the tracked schema succeeded locally, `prisma validate` passes, and CI's
"Validate Prisma schema" and "Generate Prisma client" steps succeeded at `109c4d9`.

### 4. No schema type bypasses remain in touched areas — yes, after a trivial fix

Across the 27 code files changed since the architecture was frozen (`8a0ae66`), no Prisma
client is cast to `any`. The one `db as any` is the fake client inside
`lib/bookingTransitions.test.ts`.

Six casts on rows returned by Prisma hid nothing today, because every field they read exists
on the generated type. They would, however, keep compiling after the money migration renames
a field such as `total_usd`. They were removed from `bookings.controller.ts`,
`artists.routes.ts` and `webhooks.routes.ts`, and both typechecks pass without them. The
remaining `as any` casts in those files type Express requests, uploaded files and Stripe
payloads, not the schema.

### 5. Invitation logic is verified — yes

Creator invitations are created and listed; inviting or accepting yourself is refused; an
invitation is accepted once, a replay gets 410, and of two simultaneous claims exactly one
wins; guessed tokens and anonymous invites are refused. An expired invitation is refused and
changes nothing. A contribution invitation is accepted into its workspace.

### 6. Weave logic is verified — yes

The backfill records exactly one evidence row per completed booking, and a second run changes
nothing. Completing a booking creates its connection, and syncing it again adds nothing. A
connection's count and dates come out the same whatever order bookings sync in, a wrong count
is repaired by the next sync, and bookings synced at the same moment are all counted. The A08
assertions were mutation-checked.

### 7. No unrelated local work was destroyed — yes

`main`'s reflog since the freeze shows only forward commits, and there is no stash. Every
worktree and branch is still present: the uncommitted `DashboardPage.tsx` change and untracked
`AGENTS.md` in the `amazing-merkle-5179c2` worktree, and the announcements commit `f4cee88` on
its branch. The payout worktree `distracted-shamir-410d90` has never had a commit or a change.
The stabilization commits went to `main` only.

### 8. Booking, payment and passport behaviour still works — yes

On the freshly built database and in CI:
- a booking paid from the wallet takes the amount exactly once, and a booking the wallet
  cannot cover is refused and changes nothing;
- closed bookings cannot be reopened;
- Stripe settlement happens once however often it is delivered, and unsigned events are
  rejected;
- cancelled and refunded bookings cannot be paid;
- the public passport keeps location private until the artist opts in, and counts only
  sessions that happened.

## Recommendation

Gate 2 blocks. The smallest task that clears it: make `schema.prisma` declare what the tracked
migrations already build, until the drift check above exits 0:
- `@db.Uuid` on the four key columns;
- the eight database defaults;
- the `studio_staff` index.

That changes the schema file only, with no migration and no database change. Do it on a
branch, and before merging:

- confirm production was built by these same migrations, with a read-only `prisma migrate diff`
  from production's URL to `prisma/migrations`. It reads production, so it is the owner's call;
- add the drift check to CI, so drift cannot come back unnoticed.

Then run this gate again.

## Open, but not gates

- Studio payouts still add amounts across currencies (the open defect in implementation
  status). No fix exists yet.
- The announcements read fix is committed on `claude/affectionate-engelbart-b72fb4` and not
  merged.
- The notes observed but not changed while fixing A01 and A08 stand.
- The earlier disposable Postgres cluster lost a system file under `template1`
  (`base/1/4171`), so it can no longer create databases. This gate ran on a new cluster.
