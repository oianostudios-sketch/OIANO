**Walk-ins and payouts need the staff member's own permission, not only the account role, 2026-10-09.**
This closes C34 in
[`OIANO_CANONICAL_ARCHITECTURE_V1_RECONCILIATION.md`](../OIANO_CANONICAL_ARCHITECTURE_V1_RECONCILIATION.md) §8.

**What was wrong.** `POST /api/admin/walkin` and every `/api/payouts` route asked only for
the `STUDIO_ADMIN` account role. A member whose studio membership granted `VIEW_FINANCE`
alone could book walk-ins, and a receptionist with `MANAGE_BOOKINGS` alone could request
the studio's payout, start its payout onboarding, and read its balance and history. Team
management and cash payments already checked the membership. Wallet credit, the third
action the audit named, was removed in d6252bd and has nothing left to gate.

**What changed.**

- `apps/api/src/lib/staffPermission.ts` holds the one rule. The caller's `StudioStaff`
  row for the studio the request acts on must hold the capability. A `STUDIO_ADMIN`
  membership with an empty capabilities list also passes: that is the legacy owner, which
  is how a self-registered owner is created. Otherwise the request gets 403.
- `POST /api/admin/walkin` needs `MANAGE_BOOKINGS`. `POST /api/admin/bookings/:id/cash-payment`
  keeps the same rule and now calls the helper instead of its own copy.
- `GET /api/payouts/balance`, `GET /api/payouts`, `POST /api/payouts/connect` and
  `POST /api/payouts` need `VIEW_FINANCE`. No capability names paying out, and
  `VIEW_FINANCE` is the only finance one. The owner and manager presets on the team page
  carry it; the reception preset does not.
- The studio is still resolved from the caller's membership (`resolveStaffStudio`), never
  from the request. A capability held at another studio does not count.
- The dashboard's walk-in form shows the server's refusal message instead of a generic
  failure.
- No capability codes were added. The schema, amounts and ledger behaviour are unchanged.

**Evidence.** `apps/api/src/integration/staff-capability-gates.integration.test.ts` has 4
subtests. Each one checks that a member with the capability is allowed, the legacy owner
is allowed, and members without it get 403:

- **Walk-in.** A member with `VIEW_FINANCE` only, and an `ENGINEER` membership, are
  refused, and no booking is written.
- **Payout request.** Members with `MANAGE_BOOKINGS` only, with an `ENGINEER` membership,
  or with `VIEW_FINANCE` held at a different studio are refused, and no payout row is
  written.
- **Payout onboarding.** The refused members get 403 and no Stripe account is recorded.
- **Payout balance and history.** The refused members get 403.

Results:

- **Against `main`'s routes (cb027e8):** all 4 subtests fail. The narrow members got 201,
  409, 503 and 200 where 403 was expected, which shows the gap was real.
- **Mutation: walk-in gate removed.** Only the walk-in subtest fails.
- **Mutation: legacy-owner clause removed from the helper.** All 4 subtests here fail,
  and so do 5 of the 10 cash-payment subtests.
- Each mutated file was restored from a `cp` backup, and `cmp` confirmed it byte-identical.

All checks pass:

- Both typechecks.
- `npm test`: API unit 119/119, intelligence 31/31, web 103/103.
- `npm run test:integration:local`: 194/194 on a fresh database.
- `npm run build`.
- `npm run security:secrets`, over 497 files.

**Not exercised.** A payout against Stripe. The dashboard still shows the walk-in form to
members who will be refused, because hiding it would need the dashboard to read the
caller's capabilities, which it does not do today.

**Observed, not changed.** Other `STUDIO_ADMIN` routes still rely on the account role
alone. These include announcements, analytics, the runsheet and the facilities and
studio-circle routes. None of them moves money; each should get the same check when its
own migration step comes.
