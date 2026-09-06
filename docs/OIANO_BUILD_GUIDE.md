# OIANO — Build Guide: three loops to self-operation

Execution record for [`OIANO_COMPLETION_BRIEF.md`](OIANO_COMPLETION_BRIEF.md).
Started from commit `52b41a6`, 2026-09-06.

## How completion is graded

Percentages are **evidence-weighted, not effort-weighted**. A loop is scored on what
has been *proven*, not on how much code exists. The rubric is fixed before building so
the grade cannot be rationalised afterwards.

Per loop:

| Weight | Earned when |
|---|---|
| 25% | Domain implemented — schema/logic in place, typechecks |
| 25% | Wired end to end — a real request reaches it and persists |
| 30% | Proven against a fresh Postgres in the integration suite |
| 20% | Mutation-checked — the bug reintroduced, the test observed failing |

**Anything depending on live external credentials that this environment does not have
cannot exceed 75%.** Code that has never run against the real service is not proven,
and grading it as complete would be dishonest. That ceiling is stated per loop below.

Overall = mean of the three loops.

---

## Status

| Loop | Scope | Grade |
|---|---|---|
| 1 — Studio self-onboarding | Signup creates Studio + first STUDIO_ADMIN | **100%** |
| 2 — Platform fee | `platform_fee_bps` becomes real; `PLATFORM_REVENUE` credited | **0%** |
| 3 — Payouts | Connect onboarding + settle `STUDIO_PAYABLE` | **0%** (ceiling 75%) |
| | | **Overall 33%** |

### Loop 1 evidence

- Domain: `lib/studioOnboarding.ts` — `registerStudioWithOwner()` creates Studio,
  first `STUDIO_ADMIN`, membership and `active_studio_id` in one transaction.
- Wired: `POST /api/auth/signup` accepts `role: 'STUDIO_ADMIN'` with `studio_name`.
- Proven on fresh Postgres: registration returns 201 with a token; slug derived from
  the name; membership and active studio set; **the new operator gets 200 from
  `/studio-clock` immediately** — no provisioning, no 409 selection prompt; a duplicate
  studio name still registers with a distinct slug; a nameless registration is a 400
  that leaves no user behind.
- Mutation-checked: removing the slug-collision retry makes the twin registration
  return **409 instead of 201**, and the suite fails.

---

## Loop 1 — Studio self-onboarding

**Problem.** No API route creates a `Studio`; `prisma.studio.create` exists only in seed
scripts and tests, and signup admits `ARTIST | PRODUCER` only. Every studio requires an
operator with database access.

**Plan.** Admit `STUDIO_ADMIN` to signup. In one transaction create the `User`, the
`Studio` (slug derived from name, uniqueness enforced), the `StudioStaff` membership,
and set `User.active_studio_id` so `resolveStaffStudio` resolves immediately without
the 409 selection prompt. Team invitations then work unchanged.

**Risk.** Low. No money. Additive to a well-covered signup path.

---

## Loop 2 — Platform fee

**Problem.** `Studio.platform_fee_bps` defaults to `0` and is written by no route, so
`bookingAllocation()` always computes a zero fee and `PLATFORM_REVENUE` has never been
credited.

**Plan.** A platform default in shared constants, applied at studio creation. No change
to `lib/financialLedger.ts` arithmetic — it already allocates correctly, enforces
balance and is idempotent. Prove it with a ledger assertion at a non-zero rate.

**Risk.** Medium — money arithmetic, though the arithmetic itself is untouched.

---

## Loop 3 — Payouts

**Problem.** `Studio.stripe_account_id` is modelled and read nowhere. No transfers.
`STUDIO_PAYABLE` accrues as a liability forever.

**Plan.** Connect onboarding to populate the account id, and a payout settling the
outstanding payable with matching ledger entries. Idempotent per payout,
balance-enforced, never mutating a prior transaction.

**Risk.** Highest in the product — money leaving the system. A replayed webhook or a
double payout is a financial loss, not a bug report.

**Ceiling: 75%.** Stripe is not authorised in this environment and `STRIPE_ENABLED` is
`false`, so the Connect calls cannot be exercised against the real service here. The
ledger half is fully provable; the Stripe half is not.
