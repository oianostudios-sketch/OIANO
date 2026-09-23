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

Not started, and **paused behind the stabilization track below** (decided
2026-09-12): the frozen architecture rules out UI redesign during stabilization.
Phase 2's first standardization slice stays scoped in the environment audit §W3
and the continuation audit §T.

## Stabilization track — frozen architecture

Target: [frozen architecture](OIANO_FROZEN_ARCHITECTURE.md). No canonical schema
migration starts until Session 5 reports every gate passed.

| Session | Status | Deliverable |
|---|---|---|
| 1 — Architecture delta | **Done** 2026-09-12 | [Architecture delta](OIANO_ARCHITECTURE_DELTA.md): 58 models classified, 25 contradictions, 10 migration risks |
| 2 — Migration and type safety | **Done** 2026-09-12 | Prisma ranges aligned to the installed 5.22.0; all 20 `prisma as any` removed, hiding no type errors; dead WebSocket client removed (no server existed and it was never configured) |
| 3 — Invitation and Weave tests | **Done** 2026-09-13 | Expired invitations are rejected and change nothing; the Weave backfill records exactly one evidence row per completed booking and a second run changes nothing, on real Postgres; A08 confirmed as a todo test. Backfill logic moved into `lib/weave/backfill.ts` so it can be tested |
| 4 — Booking, payment and engineer-scope tests | **Done** 2026-09-13 | Wallet guard, lifecycle and cross-studio scope, Stripe signature, replay and amount checks; A02 (twice) and A03 confirmed as todo tests. A credential leak found on the way is fixed (below) |
| 5 — Stabilization gate | **Done** 2026-09-13, **not passed** | [Stabilization gate](OIANO_STABILIZATION_GATE.md): seven gates yes; gate 2 no, because the tracked migrations build a database that differs from `schema.prisma` in nine tables. Six redundant schema casts removed on the way |

Every new assertion in Sessions 3 and 4 was mutation-checked: the protected code was
broken in seven runs, each run failed the intended test, and every file was restored
byte-identical. Integration files now run one at a time, because they share a database.

**Fixed in Session 4 — booking detail leaked credentials.** `GET /api/bookings/:id`
returned the artist's whole User row, password hash and encrypted MFA secret included,
and let any producer read any booking by id. That was reachable by anyone: producer
signup is open, and booking ids are broadcast to every connected client (A01). The
response now carries only the artist user's `id` and `email`, and a producer reaches a
booking only through a project they own, on all three booking read endpoints.

**Observed, not changed.** An engineer sees every booking at their own studio, including
unassigned ones; the test characterises this so narrowing it is a decision, not drift.
Re-syncing an already-synced booking is verified to change nothing on real Postgres. The
architecture audit's §7 caution still applies to future edits: a statement added after the
duplicate-evidence catch in `lib/weave/sync.ts` would run inside an aborted transaction.
*No longer applies: the A08 fix below removed that catch.*

**Fixed after Session 4 — A02 and A03.**

- **A02.** `lib/bookingTransitions.ts` is the one statement of which status a booking may
  move to. COMPLETED, CANCELLED and NO_SHOW are closed, and every move a dashboard offers
  stays legal. The status route, the completion screen, file delivery and the Stripe
  webhook all go through it, writing only from the status they read, so a repeated or
  racing completion is UNCHANGED and runs nothing twice, and a closed booking gets a 409.
  Delivery is refused for cancelled and no-show bookings.
- **A03.** A payment records money; it no longer decides booking state. It confirms only a
  PENDING booking; money for a cancelled or no-show booking is recorded and the studio is
  asked to refund it; a refunded payment never flips back to paid. A late failure event
  cannot overwrite a paid payment, and asynchronous checkout failures are matched by session
  (matching by payment intent alone meant the handler could find nothing but paid
  payments). Checkout refuses cancelled, no-show and refunded bookings, hands back an open
  session instead of opening a second payable one, and a second session that pays an
  already settled booking is flagged for refund.
- **Evidence.** The three todo tests pass, five integration tests were added, and the API
  security suite grew from 53 to 80 with the new unit tests. Eight defects were put back at
  once and every one failed its test. **Not exercised:** checkout's calls to Stripe to reuse
  or expire an open session — typechecked, with the decision unit-tested, but never run
  against Stripe.

**Fixed after Session 4 — A01.**

- Live updates no longer go to every connected user. `broadcastAll` is gone, so nothing
  can reach every stream, and `services/liveUpdates.ts` decides who hears each event, looked
  up when it is sent, so someone removed from a studio stops hearing about it at once.
  - A booking update reaches the people who can read the booking: its artist, its studio's
    admins and engineers, the producer who owns its project, and platform operators.
  - An announcement reaches the studio's staff and the artists who have booked there.
  - An artist's availability reaches staff at the studios that artist has booked with.
  - A studio membership alone does not make a producer staff, matching the booking routes.
- The artist used to receive each status change twice, once addressed and once in the
  broadcast; now once. The "your session is confirmed" toasts show only to artists, because
  staff, producers and operators now receive the same event to refresh what they see
  (`lib/bookingUpdateToast.ts`).
- **Evidence.** One integration test opens real streams for ten users across two studios.
  It changes a booking, posts an announcement and changes an artist's availability at one
  studio, changes a booking at the other, and checks what each stream heard, in order and
  exactly once. Nine defects were put back one at a time and every one failed it, and every
  file was restored byte-identical. The toast rule is unit-tested, and removing its role
  check fails that test. **Not exercised:** the toasts in a browser, and the updates from
  reschedule, the completion screen and walk-in bookings, which call the same publisher as
  the tested status change.

**Fixed after A01 — reading announcements.**

- An artist reads a studio's announcements only if they have booked there, the same artists
  who hear them live. Naming another studio returns an empty list; naming none still gives
  the studio of their latest booking.
- Staff are no longer answered "Artist not found": the artist-facing route passes everyone
  else on to the admin route mounted after it, so a studio admin reads their own studio's
  list. Engineers, who hear announcements live, are still refused the list, now with a 403
  (read in the code, not tested).
- **Evidence.** Two integration tests failed before the fix, one per defect. Eight defects
  were put back one at a time, both originals and the admin router mounted first among
  them; each failed its intended assertion and nothing else, and every file was restored
  byte-identical. **Not exercised:** the announcement on the artist dashboard in a browser.

**Observed while fixing A01, not changed** (read in the code, not tested):

- A payment confirmed by Stripe still sends its live update only to the artist, so staff
  dashboards learn of it on their next refresh.
- A stream is checked only when it opens, so a revoked session keeps receiving its own
  updates until the stream closes.

**Fixed after Session 4 — A08.**

- A Weave connection's count and dates are derived from its evidence on every sync, never
  incremented or taken from the booking being synced. Syncing an older booking no longer
  moves last activity backwards, first activity is no longer whichever booking synced
  first, and a wrong count is corrected by the next sync for that artist and studio.
- Work is dated by when the session started, the date the Studio Circle already uses, not
  by `updated_at`, which moves whenever a booking is edited. A completed booking cannot be
  rescheduled, so that date is fixed.
- A booking already recorded is skipped instead of raising an error, so the recount after it
  always runs. The duplicate-evidence catch behind the §7 caution above is gone.
- Two syncs for the same artist and studio take turns: the connection row is locked before
  counting. Without the lock, syncs running together each counted only the evidence they
  could see, and a booking went uncounted.
- **Evidence.** The todo test passes, and two tests were added: a corrupted count and dates
  are repaired by the next sync, and 48 bookings synced six at a time over eight rounds are
  all counted. The backfill test now also checks first and last activity against the
  sessions. Seven defects were put back one at a time, each failed at least one test, and
  `sync.ts` was restored byte-identical every time. The missing lock was caught in one run
  of three by the first version of the concurrency test, and in five of five once it was
  given eight rounds.
- **Not done.** Stored rows, production's included, keep their old counts and dates until a
  booking for that artist and studio is synced again. `prisma/backfill-weave.ts` corrects
  every connection that has a completed booking; nothing was run against production.

**Observed while fixing A08, not changed.**

- Evidence is never retracted. A booking completed and then moved to another status before
  A02 keeps its evidence and still counts toward the Weave, while the Studio Circle counts
  only completed bookings, so the two can disagree about that history.
- A node or connection is created by a select followed by an insert: Prisma issues no
  single upsert statement here. When the first two syncs for a new artist and studio land
  at the same moment, one fails and is logged, and its booking's evidence waits for the
  next backfill.

**Stabilization pass, 2026-09-14 — the base made ready to build.** What gets built next
is in [build direction](OIANO_BUILD_DIRECTION.md).

- **Announcements.** The fix above, committed on its own branch on 2026-09-13, is now on
  `main`.
- **Payouts.** A studio is owed, and paid, in the currency the money was earned in, which
  is USD today; the payout and its ledger posting no longer take `Studio.currency`. A
  payable with entries in any other currency is refused until someone reconciles it: its
  dollar total cannot be trusted, and paying it could pay the same money twice.
  `GET /api/payouts/balance` reports the payable's currency and anything needing
  reconciliation.
- **A04, rights decisions.** A decision is written only while it is still pending, and the
  agreement row is locked first. Two answers from one holder record one, and holders
  answering together settle the agreement from every decision.
- **A07, standing.** An artist's tier counts the ratings engineers gave their sessions, not
  the ratings the artist gave engineers, and only connections the artist accepted.
- **A06, passport score.** The stored score is the total of the breakdown the artist reads
  (`lib/passportScore.ts`), so a delivered project still marked active no longer counts
  twice.
- **A09, studio clock.** Only a confirmed session within its time, or one still in
  progress, is live, so overtime can now be shown. The day runs from the studio's own
  midnight in its time zone and includes sessions that cross midnight
  (`lib/studioClock.ts`).
- **A10.** The project page calls the sum of its sessions' prices "Booked value", not
  "Revenue".
- **Evidence.** The integration suite passes all 39 tests on a fresh database, including
  new ones for announcements, payouts, A04 and A07. Eight new unit tests hold A06 and A09,
  among them a day the clocks go back and a day they go forward. Eleven defects were put
  back one at a time, the two A04 races three times each, and every one failed its intended
  test; every file was restored byte-identical. **Not exercised:** the studio clock and the
  booked-value label in a browser, and a payout against Stripe.

**Schema redesign:** designed for review in [schema redesign](OIANO_SCHEMA_REDESIGN.md),
against the owner decisions of 2026-09-12. No migration is written; implementation
waits for Session 5.

**Open defect, found while designing money:** studio payouts sum a studio's payable
across currencies and transfer it in `Studio.currency` (`lib/studioPayout.ts:14–27,60`;
`routes/payouts.routes.ts:110–113`), while booking payments post as USD. Latent while
payouts are off; it must be fixed before a studio with a non-USD currency takes a payout.
*Fixed in the stabilization pass of 2026-09-14, above.*

**Money guards, 2026-09-21 — what the ledger did not see.** Three findings from a
read-only architecture audit at `682d052`. The owner chose each answer on 2026-09-15,
before any of it was written.

- **Studio-issued wallet credit is gone.** `POST /api/admin/wallet/credit` let any studio
  admin, holding no finance capability, put up to $10,000 per request into an artist's
  wallet with no ledger posting and no cumulative cap. A wallet belongs to the artist and
  is spent at any studio, so that money became `STUDIO_PAYABLE` at whichever studio the
  artist booked next, and payouts treat a payable as money owed. The route, the
  credit-request routes that fed it (`POST /api/admin/credit-request`,
  `GET /api/admin/credit-requests`) and the dashboard's credit buttons, requests panel and
  modal are removed. Only a paid top-up funds a wallet.
- **A reschedule keeps the booked length.** `PATCH /api/bookings/:id/reschedule` wrote only
  `starts_at` and `ends_at`, so a paid one-hour booking could become eight hours at the
  same price, with its payment and ledger posting untouched. A different length is refused
  with 409; only the start time moves, and the artist's dialog no longer offers an end
  time.
- **A clash is a 409, not a 500.** The conflict check runs before the write, misses a
  session sitting wholly inside the new time, and can lose a race to another booking. Both
  end at the room's exclusion constraint, which Prisma 5.22 reports as an unknown request
  error carrying Postgres `23P01`, or `40P01` when two such writes deadlock — neither is
  the `P2004` `createBooking` looks for. Both now answer 409.
- **A payout reserves its balance once.** `reserveStudioPayout` read the payable and
  reserved it at default isolation with no lock, so two requests at the same moment each
  reserved the whole balance and drove the payable negative. It now locks the studio row
  first (`FOR NO KEY UPDATE`, so a booking's foreign-key check is not held up).
- **A payout is recorded once, and only if it was reserved.** `markPayoutPaid` wrote with
  no guard: it would mark a released (FAILED) payout PAID, and a second transfer id
  overwrote the first. Only a PENDING payout becomes PAID, the same transfer recorded
  again changes nothing, and anything else is a 409. `POST /api/payouts` now releases the
  reservation only when the rail itself refuses: once Stripe has accepted a transfer, a
  failure to record it leaves the payout PENDING and reserved for someone to reconcile,
  instead of making the same money payable a second time (`transferReservedPayout`).
- **Seeds post their demo money.** `prisma/seed.ts` and `prisma/seed-ecosystem.ts` funded
  wallets through the same unledgered path; both now post `SEED_WALLET_GRANT`
  (DEMO_FUNDING → WALLET_LIABILITY) in the same transaction as the wallet movement.
- **Evidence.** Eleven integration tests in `money-integrity.integration.test.ts` were
  written first, and all eleven failed against the code at `682d052`, each for its own
  reason; the suite now passes 51 of 51 on a fresh database. Concurrency is forced rather
  than hoped for: a `SHARE` lock on the table under test holds every request at its first
  write until all of them have read, and each race asserts that it was actually held
  (`throughBarrier`). Seven defects were then put back one at a time — the credit route, the length guard, the clash mapping, the payout lock, the PENDING guard, the idempotent re-record and the release-only-on-rail-failure — and every one failed exactly the tests it was meant to and no others, with each file restored byte-identical. Both typechecks, API unit 88, intelligence 31,
  web 75, the secret scan across 420 tracked files and the build all pass. Seeding a fresh
  local database leaves all seven wallets equal to their ledger balance, with five grants
  balancing at 995.00. Browser-verified against a local database: the admin dashboard
  carries no credit control and logs no console error, and a session moved from 4 PM to
  6 PM keeping its hour and its $25, while a two-hour attempt returned the 409.
- **Not done.** Credit already issued in production stays in its wallet: nothing was
  backfilled and no production data was touched. Neither `reconcileFinancialLedger` nor
  `findWalletDrift` can see it — one compares a wallet only against its own transactions,
  the other never looks at wallets — so this read-only query is what finds it:

  ```sql
  SELECT a.name AS artist, w.balance_usd, l.on_ledger, (w.balance_usd - l.on_ledger) AS unbacked
  FROM wallets w
  JOIN artists a ON a.id = w.artist_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(CASE WHEN e.direction='CREDIT' THEN e.amount_usd ELSE -e.amount_usd END), 0) AS on_ledger
    FROM financial_ledger_entries e
    WHERE e.account_code='WALLET_LIABILITY'
      AND ((e.owner_type='WALLET' AND e.owner_id=w.id) OR (e.owner_type='ARTIST' AND e.owner_id=a.id))
  ) l
  WHERE w.balance_usd <> l.on_ledger
  ORDER BY unbacked DESC;
  ```

- **Observed, not changed.**
  - `createBooking` maps `P2004` and `P2034` for a room clash. On the evidence above the
    clash arrives as an unknown request error carrying `23P01`, so that mapping probably
    never matches (read in the code, not tested). `POST /api/admin/walkin` has the same
    narrow conflict check and no mapping at all, so a clash there is a 500.
  - `releaseFailedPayout` reads a payout's status and then writes unconditionally, so a
    release racing a `markPayoutPaid` could overwrite a PAID payout. No caller can do that
    today — each request owns the payout it created — but it needs the same claim-first
    guard if a webhook or a retry ever calls either.
  - `prisma/seed-ecosystem.ts` also writes `Payment` rows marked PAID with no booking
    payment posting; that demo money stays off the ledger.
  - A wallet's ledger owner is inconsistent: a top-up credits `WALLET_LIABILITY` under the
    wallet, a wallet-paid booking debits it under the artist, so reading what a wallet
    holds means looking under both.
  - **Not exercised:** a payout against Stripe. No rail was called; the tests supply the
    transfer as a function.

**Fixed after the stabilization pass — the integration suite on a fresh checkout,
2026-09-24.** `npm run test:integration:local` could not pass after `npm ci` until
someone had built `packages/shared` by hand.

- The API imports `@oiano/shared`, which resolves through that package's `main`,
  `dist/index.js`. `dist` is gitignored and no install step writes it, so on a fresh
  checkout the four integration files that import it failed to load with
  `MODULE_NOT_FOUND`. The fifth, `stabilization.integration.test.ts`, does not import
  it: it loaded and passed, so the run still read like a suite that works.
- The import resolves through `node_modules/@oiano/shared` rather than from source
  because the runner registers `tsconfig-paths` with the repository root as its working
  directory, and the root `tsconfig.json` declares no `baseUrl` or `paths`. The
  `@oiano/shared` mapping lives only in `apps/api/tsconfig.json`.
- `scripts/run-api-integration-tests.js` now builds `packages/shared` when
  `dist/index.js` is missing. That runner is the one path both CI and
  `npm run test:integration:local` take, so neither caller has to remember; CI's own
  "Build shared package" step still runs first and this finds its work done. The
  database-name checks are unchanged and still run before it. A `dist` that is present
  but stale is left alone, exactly as `npm run dev:local` leaves it.
- **Evidence.** With `packages/shared/dist` deleted: before the change, 11 tests with
  four of the five files failing to load; after it, all five files load and 39 of 39
  pass on a fresh local database. The defect was put back once — the runner restored to
  its committed version, `dist` deleted again — and the run failed four of 11 as before.
  Both typechecks, API security 88/88, API intelligence 31/31, web 75/75, secret scan
  across 419 tracked files, full build.
- **Not done.** `npm test` cannot pass in a worktree that has no `.env`:
  `src/lib/creatorContext.test.ts` reaches `lib/prisma.ts`, which builds a
  `PrismaClient` at import time and throws when `DATABASE_URL` is unset. It was run here
  with the unreachable, credential-free URL CI uses, never with `.env` present.

**Rate limits count a caller, 2026-09-24 — a venue is not one person.** Every limiter
counted an address (`middleware/rateLimit.middleware.ts`), and read it from the first
`X-Forwarded-For` value, which the caller writes. A studio, an office and an event venue
each reach the API from one public address, so the global 300 requests a minute,
booking's 20 and sign-in's 10 were budgets a whole room shared: fifty people at a venue
had ten sign-in attempts between them.

- **Who a limit counts** is now decided in `lib/rateLimitKey.ts`: the subject of a token
  the request can prove, and only otherwise the address. The token is verified rather
  than decoded — an unverified `sub` would let anyone mint themselves a fresh budget by
  inventing a subject, which is worse than counting by address.
- **The address is the one the proxy reports.** `app.set('trust proxy', …)` makes `req.ip`
  authoritative instead of a header the caller wrote; `TRUST_PROXY_HOPS` changes the hop
  count if another proxy is ever put in front. The global ceiling is 600 a minute, per
  caller, sized for a room of anonymous callers rather than for one person.
- **Sign-in cannot be counted per caller**, because it is anonymous by definition. An
  account keeps ten attempts a minute, scoped to the address so nobody can lock someone
  out of their own account from elsewhere, and the address keeps 120 of its own. Guessing
  one account from one machine is unchanged at ten a minute; what a shared address buys
  is room for everyone else behind it. A request naming no account (an MFA challenge, a
  reset token) is still counted by address, as every auth route was.
- **Evidence.** Six unit tests hold the key itself, including a forged subject, an expired
  token and a token signed with another secret, each counted by address. Two integration
  tests hold it end to end: one artist's 21 booking attempts refuse only the 21st and
  leave a second artist's budget untouched, and 11 sign-in attempts on one account refuse
  only the 11th while the next account from the same address still gets its 401. Both
  defects were put back one at a time, each failed only its own test, and both files were
  restored byte-identical. 54 of 54 integration tests on a fresh database; unit suites 94,
  31 and 75.
- **Not changed.** The counter still lives in this process, so a second API instance would
  enforce its own share of every budget (`SCALE_READINESS_ROADMAP.md` Tier 1.2). With
  `trust proxy` on, the address is only as trustworthy as the proxy in front of it — one
  hop matches today's deployment.

**Corrections to earlier records, found while doing this.**

- `SCALE_READINESS_ROADMAP.md` Tier 0.3 says direct-to-R2 upload is not started. It
  exists: `POST /api/artists/:id/files/presign` returns a short-lived PUT URL, the browser
  uploads straight to R2, and `/files/complete` verifies the object is there and no larger
  than was authorized before recording it, deleting the stray if not. What has never
  happened is an upload with real R2 credentials; without R2 configured, presign answers
  501 and uploads take the buffered fallback.
- Tier 1.8's request timeout exists: `apps/web/src/lib/api.ts` times out at 20 seconds.
  Pagination is still not wired into the frontend's lists.

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
