# OIANO — Completion Brief

**Verified against commit `565227b`, 2026-09-06.**
Companion to [`OIANO_DIRECTION.md`](OIANO_DIRECTION.md), which defines what OIANO is.
This file defines the shortest path to OIANO running **without an external operator**
and **earning**, and — more importantly — what must not be built to get there.

---

## 1. What OIANO OS is now

A complete, verified operations system for a studio that **someone else provisions**,
which can take money **in** but cannot pay money **out**, and which **charges nothing**.

The product works. The business does not yet exist. Evidence:

| Loop | State | Proof |
|---|---|---|
| Artist / producer onboarding | **Self-serve** | `auth.controller.ts:20` — `role: z.enum(['ARTIST','PRODUCER'])` |
| Studio onboarding | **Operator-only** | No route creates a `Studio`. `prisma.studio.create` appears only in `prisma/seed*.ts` and tests |
| Booking → session → delivery → rights → credits | **Complete, tested** | Postgres-backed integration suite |
| Money in | **Works** | `payments.routes.ts:59,126` — real Stripe Checkout; webhook posts to the ledger |
| Platform revenue | **Structurally zero** | `Studio.platform_fee_bps @default(0)`, never written by any route. `if (platformFee > 0)` never fires, so `PLATFORM_REVENUE` is never credited |
| Money out to studios | **Does not exist** | `STUDIO_PAYABLE` accrues as a liability forever. `Studio.stripe_account_id` is declared and **never read anywhere** |
| Verified relationship record | **Real** | Weave: Node / Connection / Evidence, rebuildable |

So OIANO needs a human at exactly **three** points: to create a studio, to set a fee,
and to move money to a studio. Nothing else in the daily loop requires one.

That is the whole gap. It is much smaller than it looks from the size of the codebase.

---

## 2. What it must be

**A creative can find a studio, book it, work, be credited, and be paid — and a studio
can join, operate, and receive its money — with no OIANO staff involved in any of it,
while OIANO takes a defined cut automatically.**

Three loops close it:

1. **A studio onboards itself.** Signup creates the `Studio`, its slug, and its first
   `STUDIO_ADMIN` in one flow. Existing team invitations then work unchanged.
2. **The platform charges.** `platform_fee_bps` becomes real — a platform default
   applied at studio creation, visible to the studio, recorded on every payment. The
   ledger already computes and posts it correctly the moment it is non-zero.
3. **Studios get paid.** Stripe Connect: onboarding link, `stripe_account_id` populated,
   and a transfer that settles the `STUDIO_PAYABLE` balance the ledger already tracks.

Everything else already exists.

---

## 3. Do not build

This is the load-bearing half of the brief. Each of these is a real future; none is
required for OIANO to operate and earn, and each one delays that.

- **Discovery, search ranking, recommendations.** A studio that self-onboards and an
  artist who can already book do not need to be matched by an algorithm yet.
- **Skills / agentic assistance.** Build on clean truth ownership, not before it.
- **Portable passport export, credential verification, external identity.** The evidence
  is already accumulating; the artifact can come later without re-modelling anything.
- **Multi-market / geo expansion features.** Geo is private-by-default and city-level.
  Leave it.
- **Any social surface** — following, likes, feeds, popularity, network visualisation.
  Permanently out of scope, not merely deferred.
- **React component test suite.** Real gap, not on this path.
- **Event versioning, status enums, reconciliation lifecycle.** Known debt
  (`OIANO_DIRECTION.md` §6). None blocks operation or revenue.
- **A second studio's worth of features.** Multi-studio already works structurally.
- **Rebuilding anything that currently passes.** 117 tests and a green pipeline are
  the reason this scope can be this small.

---

## 4. The completion prompt

> Close the three loops that make OIANO self-operating and revenue-generating. Build
> nothing else. The system is already complete for daily use — booking, sessions,
> delivery, rights, credits, wallet and a double-entry ledger all work and are covered
> by a Postgres-backed integration suite. Do not extend features, do not refactor what
> passes, do not start discovery, skills, passport export or any social surface.
>
> **Loop 1 — Studio self-onboarding.** Today no API route creates a `Studio`; only seed
> scripts do, so every studio requires an operator. Add a studio signup path that
> creates the `Studio` (unique slug, timezone, currency) and its first `STUDIO_ADMIN`
> in one transaction, and admits `STUDIO_ADMIN` to the signup role enum. Existing team
> invitations (`studio.routes.ts:159`) then work unchanged. Reuse the signup validation
> and error contract already in `auth.controller.ts`.
>
> **Loop 2 — Platform fee.** `Studio.platform_fee_bps` defaults to `0` and is never
> written, so `bookingAllocation()` always computes a zero fee and `PLATFORM_REVENUE` is
> never credited. Apply a platform default at studio creation and expose the studio's
> own rate read-only to it. Change no arithmetic: `lib/financialLedger.ts` already
> allocates and posts correctly, enforces balance, and is idempotent. Prove it with a
> ledger assertion at a non-zero rate — gross = studioNet + platformFee, and
> `PLATFORM_REVENUE` credited exactly once.
>
> **Loop 3 — Payouts.** `Studio.stripe_account_id` is modelled and read nowhere;
> `STUDIO_PAYABLE` accrues forever. Add Stripe Connect onboarding to populate it, and a
> payout that settles the outstanding payable and posts the matching ledger entries.
> Idempotent per payout, balance-enforced, never mutating a prior transaction. Money
> out is the highest-risk code in the product: it gets its own integration coverage,
> including a replayed webhook and a double-payout attempt.
>
> **Rules.** Forward commits only. Zod parses every body. `AppError` for domain
> failures. The ledger stays the only writer of money. The Weave never defines money.
> Verify against a freshly created Postgres, not typechecking. Mutation-check every new
> assertion by reintroducing the bug and confirming failure — a green run is not proof.
>
> **Done means:** a studio signs up, sets nothing, receives bookings, and is paid out,
> while OIANO's cut lands in `PLATFORM_REVENUE` — with no human touching the database.

---

## 5. Then, and only then

Release gating is already known and external to the code: Render is on `plan: free`;
`NODE_ENV` stays `staging` until `lib/env.ts`'s production checklist is genuinely
satisfied — notably a real backup restore recorded in `BACKUP_RESTORE_TESTED_AT`; R2 and
SendGrid have never run against live credentials; and `STRIPE_ENABLED` is `false`, which
Loop 2 and Loop 3 obviously require to be `true`.

The first thing worth building after these three loops is whatever the first ten real
studios ask for — not the next item on any list written before they arrived.
