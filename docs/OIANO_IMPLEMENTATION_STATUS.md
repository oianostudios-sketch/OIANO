# OIANO — implementation status against the audits

One place to check before reopening a finding. Add a row when work lands; do not
delete rows, mark them.

Governing direction: [continuation audit](OIANO_MARKET_ADOPTION_CONTINUATION_AUDIT.md).
Historical evidence: [environment audit](OIANO_ENVIRONMENT_AUDIT.md) (six findings
retracted in its own Corrections section — check there before citing it).

## Phase 1 — trust and continuity

| Finding | Status | Commit | Evidence |
|---|---|---|---|
| **R1** — payment claimed from a URL parameter | **Done** | `1b9fbdb` | Forged `?payment=success` on an UNPAID booking renders "Checking payment status…", then "Payment not recorded yet" with a retry. Payment PAID + booking PENDING renders both truthfully. Browser-verified against an isolated database. |
| **R1b** — wallet top-up announced a URL-supplied amount | **Done** | `1b9fbdb` | The return states no figure; the balance comes from context, which reads the ledger. |
| **R2** — running session invisible (`starts_at >= now`) | **Done** | `b80b90d` | Live `/api/context` returns `SESSION_UNDERWAY` for a session started 20 min ago; `at` is the end time. |
| **R2** — unconfirmed session told to "confirm you're coming" | **Done** | `b80b90d`, `e2a5f5a` | Renders "Integration Studio hasn't confirmed your session yet / Starts in 5 hours." |
| **R2** — generic "Open" button | **Done** | `b80b90d` | Renders "View request"; label is per action kind. |
| **R2** — attention count counted kinds, not items | **Done** | `b80b90d` | `attention_total` live in the payload; per-kind `count` on each entry; the `take: 5` caps that would have truncated the totals are gone. |
| **R2** — rights linked to `/projects` generically | **Done** | `b80b90d` | Links to the agreement's project. |
| **R2** — context failure rendered as nothing | **Done** | `b80b90d` | `NextAction` distinguishes unreachable from all-clear, with a retry. |
| **R3** — failed load rendered as "Nothing in this view" | **Done** | `3f59045` | Per-view state; failure says so; a failed refresh keeps data and marks it stale; nav badge shows an em dash, not 0. |
| **R3/R2** — SSE never refreshed `['context']` or `['communications']` | **Done** | `3f59045` | Refreshed centrally for any recognised event and again on reconnect; booking mutations refresh them directly. |

**Not done in Phase 1, and why**

- **Phase 1 gate, "new work appears without a manual page reload"** — the
  invalidation is wired and unit-reasoned but was **not** observed end to end with
  two live clients and a real server event. Treat as implemented, not proven.
- **Delayed-settlement against a real Stripe webhook** — the settlement check was
  exercised with a database-recorded payment, never a live rail. `STRIPE_ENABLED`
  is false and no live credentials were used.
- **Component tests** — `vitest.config.ts` collects only `src/**/*.test.ts` and
  React Testing Library is not a dependency. The load-bearing rules were extracted
  to pure modules (`lib/paymentReturn.ts`, `sessionAction`/`totalWaiting` in
  `creatorContext.ts`) and tested there instead. Rendered behaviour was checked in
  a browser, not in CI.

## Phases 2–4

Not started. Phase 2's first standardization slice is scoped in the environment
audit §W3 and the continuation audit §T; both name the same four surfaces.

## Verification performed for Phase 1

Both typechecks · API security 53/53 · API intelligence 31/31 · web 57/57 ·
secret scan across 387 tracked files · full build · integration suite 7/7 against
a fresh local Postgres · browser verification of Creator Home and Booking Detail.

Mutation-checked, each confirmed to fail the intended assertion: accepting
`'success'` as a recorded payment state; removing the settlement attempt limit;
treating a started session as future; restoring the old PENDING copy; counting
categories instead of items.

## Note on the verification environment

`apps/api/src/app.ts:50` calls `dotenv.config({ override: NODE_ENV !== 'test' })`,
so an exported `DATABASE_URL` is **silently replaced** by `apps/api/.env` unless
`NODE_ENV=test`. A dev API started with an explicit local `DATABASE_URL` will
therefore connect to whatever `.env` names — during this work that meant the shared
Neon database, for six read-only requests, before it was caught and stopped.

Set `NODE_ENV=test` when pointing a local API at a disposable database, and prove
the binding before trusting a verification run — compare a row the two databases
cannot share, such as the studio id.
