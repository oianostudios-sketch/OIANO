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

**Credit record, 2026-09-28 — a confirmed credit belongs to the contributor.** Two
findings from the canonical reconciliation report (§1, finding 5).

- **The lead can no longer delete a confirmed credit.** `DELETE
  /api/producer/projects/:id/credits/:creditId` hard-deleted any credit, so a producer could
  erase a contribution the credited person had confirmed, with no trace and no notice. The
  lead may still withdraw a credit nobody has confirmed (DRAFT) or one the contributor
  disputed; a confirmed one is a 409. The delete is guarded on the status in the same
  statement, so a confirmation that lands after the lead's read still wins. The project
  page no longer offers removal on a confirmed credit, and a refused removal now says why
  and refreshes the sheet instead of failing silently.
- **An engineer's confirmed credits are their own.** `GET /api/network-metrics` counted every
  confirmed credit whose `credited_name` matched the engineer's name, so a namesake's credits
  counted and the engineer's own, credited under another spelling, did not. It now counts
  confirmed credits on participations the engineer's account accepted — the same link that
  lets them confirm a credit.
- **Evidence.** `credit-record.integration.test.ts`, four tests, registered in the runner; the
  suite passes 44 of 44 on a fresh local database. Four defects were put back one at a time,
  and each failed exactly its intended test: the unguarded delete, a guard that also refuses
  disputed credits, a read-then-delete with its window widened by 15 ms, and name matching
  for the engineer count. Every file was restored byte-identical. Both typechecks, API unit
  88, intelligence 31, web 75, the build and the secret scan pass.
- **Not exercised.** The read-then-delete race without a widened window passed the race test
  in three of three runs, so that test catches the race only when it is forced; the
  single-statement guard is what holds it. The project page's hidden control was not seen in
  a browser: `oiano-local` launches from the main checkout, not this branch's worktree.
- **Observed, not changed.**
  - Artist and producer "Confirmed credits" count confirmed credits on projects they own,
    including credits to other people, rather than credits confirmed by them. Changing that
    changes both numbers, so it is a decision.
  - Once confirmed, a credit has no correction path: neither side can retract or amend it.
    A retraction that keeps the record (Evidence, step 19) is the likely answer.
  - `POST /api/producer/projects/:id/credits` still binds a credit to an active participant
    by display name when no participant is named. The participant must still confirm it.

**Standing from work, 2026-09-30 — C18 and C19.** Owner decision of 2026-09-30: an
artist's tier rests only on work other people took part in. This completes A07, whose audit
row already said "DM interest is not completed work"; the 2026-09-14 pass had kept accepted
connections in the tier.

- **TRADED comes from recent work, not contacts.** It used to need two accepted message
  connections in 30 days, and replying to a message request accepts it
  (`connect.routes.ts`). It now needs PRECIOUS standing and completed sessions at two or
  more distinct studios that started in the last 30 days, read from the Weave's evidence
  joined to its bookings. The connection's stored `last_activity_at` is not used, because it
  can lag until its next sync (A08). Evidence whose booking is no longer COMPLETED, left by
  a reversal before A02, does not count.
- **Completeness no longer gates standing.** A tier used to appear only above 60% profile
  completeness, a score the artist raises by filling in their own profile. CUT now needs
  one completed session, and PRECIOUS and TRADED are unchanged apart from the above.
- **Discovery breaks ties by completed sessions**, not by completeness
  (`lib/discoveryRanking.ts`). Completeness is still returned for the profile prompt.
- **Evidence.** The A07 connection test is replaced by three: accepted connections leave an
  artist PRECIOUS; recent work makes one TRADED only across two studios, within the window,
  and only while its bookings are completed; an artist at 0% completeness with ten rated
  sessions is PRECIOUS. Two unit tests hold the discovery order. Integration 46 of 46 on a
  fresh local database; API unit 90, intelligence 31, web 75, both typechecks, the build
  and the secret scan pass. Six defects were put back one at a time: the previous tier rule
  whole, no window, no status filter, a threshold of one studio, evidence rows counted
  instead of distinct studios, and completeness as the tie-break. Each failed its intended
  test; the fifth survived the first version of the test, which gained a second session at
  one studio to catch it. Every file was restored byte-identical.
- **Not done.** Artists who are TRADED today through contacts become PRECIOUS on their next
  read; nothing is stored, so nothing is migrated. Tiers read Weave evidence, so an artist
  whose completed bookings were never synced (before the Weave, or after a failed sync)
  counts none of that work toward TRADED until `prisma/backfill-weave.ts` runs; nothing was
  run against production. Not seen in a browser.
- **Observed, not changed.** Replying to a message request still accepts it; it no longer
  affects standing. Discovery still ranks only the first 50 artists the database returns,
  in no set order (C39, step 14). The studio market view still counts profiles above 60%
  completeness as "qualified"; it is an aggregate, not anyone's standing.

**Fixed 2026-09-15 — what an artist's profile and brief disclose.** Found in a read-only
audit at `682d052`, and reproduced first: against the routes as committed, seven of the
eight new integration tests failed.

- **Profile, to other accounts.** `GET /api/artists/:id` answers anyone signed in, and
  discovery hands out artist ids, so whatever it returns to someone other than the artist
  is public. It returned the artist's last ten session logs (engineer notes, both ratings,
  private testimonials, session summaries), the whole passport row including a location the
  artist had not published, and the account id. It now returns listed fields only
  (`publicArtistSelect` and `publicArtistProfile()` in `routes/artists.routes.ts`): name,
  alias, bio, avatar, availability, join dates and tier, and from the passport its code,
  creative DNA, score, photo, bio, links and collaboration interests, with the location and
  the AI brief only when the artist has published them.
- **Profile, to a studio admin.** An admin at a studio the artist has booked reads that
  public profile, their own studio's bookings with the artist, those sessions' logs, and the
  artist's files, which the files routes already open to them. They no longer read the
  wallet, which holds the artist's money for every studio, or bookings and session logs from
  other studios, and the artist's privacy choices now hold for them too. Whether an admin may
  read the artist was decided from the artist's 50 newest bookings anywhere, so an artist
  busy elsewhere was "not found" by a studio they had booked; every booking counts now.
- **The artist** still reads their whole record.
- **Profile views.** `profile_views` is written only by `GET /api/passport/public/:code`, as
  the count of `PassportView` rows. The profile route also added one for every signed-in
  read, so the two writers disagreed.
- **The AI brief.** `GET /api/artists/:id/summary` let any account make the model write
  about any artist, store the text on that artist's passport, and read a brief the artist
  had hidden or replace it with a new one. It now answers only the artist and the staff who
  work with them: an admin at a studio the artist has booked, or an engineer assigned to one
  of those bookings, the people the files routes let read the artist's files. Anyone else,
  platform operators included, gets 403, and so do staff when the artist keeps the brief
  private. Like the other AI capabilities it is off unless `OIANO_AI_ENABLED` is `true`, and
  answers 501 while off.
- **Web.** The profile page says why a brief could not be generated instead of doing
  nothing, and no longer shows admins a wallet panel, which would now have read $0.00.
- **Consequence.** `render.yaml` sets `OIANO_AI_ENABLED` to `false`, while the brief route
  called Anthropic whenever `ANTHROPIC_API_KEY` was set. Where that is the deployed
  configuration, new briefs stop until the flag is turned on; stored briefs still show.
- **Evidence.** `integration/artist-profile.integration.test.ts` holds each rule on real
  Postgres. Every call it causes to Anthropic is answered by a stand-in and counted, so no
  run reaches the model. Thirteen defects were put back one at a time — each disclosure, the
  wallet, other studios' bookings and logs, the missing booking check, the view count, the
  open brief, unassigned engineers, the hidden brief and the AI gate — and each failed its
  intended assertion; the routes file was restored byte-identical every time. The
  integration suite passes 48 of 48 on a fresh database; the API security suite passes 88,
  the intelligence suite 31 and the web suite 75; both typechecks, the build, `prisma
  validate` and the secret scan pass. `npm test` was run with CI's placeholder
  `DATABASE_URL`: without one, as in a worktree with no `.env`, `creatorContext.test.ts`
  fails at import. **Not exercised:** the profile and connect pages in a browser. Both need
  a signed-in user, so every field they read was traced against the new responses instead.

**Observed while fixing this, not changed** (read in the code, not tested, unless noted):

- The studio roster, `GET /api/artists`, still returns each artist's whole passport, private
  location and hidden brief included, and their wallet; the admin dashboard shows the balance
  and offers a wallet credit. Whether a studio may see an artist's balance is an owner
  decision. *Fixed 2026-09-30, below.*
- The profile page treats every artist as the owner of whatever profile they open. Another
  artist sees Edit on the brief, which saves to their own passport, and upload and delete
  controls the files routes refuse. *Fixed 2026-09-30, below.*
- The brief's cache is never used, observed with a probe against a local database. A stored
  brief is served only when `ai_summary_updated_at` is later than the passport's
  `updated_at`, but the write that stores a brief, and the artist's own edit, move
  `updated_at` a few milliseconds past it. Every request that reaches generation calls the
  model again and replaces the stored brief, an edited one included. The page asks for a
  brief only when it has none to show, so this takes a direct call to the route.

**Landed 2026-09-30.** The fix above sat uncommitted in a worktree from 2026-09-15. It was
carried onto `main` at `6ad78b1` unchanged apart from two append-only merges (this document
and the integration runner), and re-verified: integration 59 of 59 on a fresh database, API
unit 90, intelligence 31, web 75, both typechecks, the build, `prisma validate` and the
secret scan. With the routes reverted to `main`, 9 of the 11 privacy tests fail. The schema
change is to comments only; no migration.

**Fixed 2026-09-30 — the studio roster.** `GET /api/artists` returned each artist's whole
passport row, private location and hidden brief included, and their wallet, to every admin
at every studio the artist had booked. Reproduced 2026-09-15 by
`artist-roster.integration.test.ts`, written then and left uncommitted until the profile
helpers above landed.

- Each row is now `publicArtistProfile()`, so the artist's privacy choices hold, plus the
  account email a studio uses to reach its own customer. No wallet: it holds the artist's
  money from every studio (owner decision, 2026-09-15). The admin dashboard no longer shows
  a balance column, which would otherwise have read $0.
- **Evidence.** The three roster tests fail against `main`'s route; returning the raw rows
  fails the privacy test and adding the wallet back fails the wallet test, each alone, with
  the file restored byte-identical. **Not exercised:** the dashboard in a browser.
- **Not changed.** The dashboard's `+# OIANO — implementation status against the audits

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

**Credit record, 2026-09-28 — a confirmed credit belongs to the contributor.** Two
findings from the canonical reconciliation report (§1, finding 5).

- **The lead can no longer delete a confirmed credit.** `DELETE
  /api/producer/projects/:id/credits/:creditId` hard-deleted any credit, so a producer could
  erase a contribution the credited person had confirmed, with no trace and no notice. The
  lead may still withdraw a credit nobody has confirmed (DRAFT) or one the contributor
  disputed; a confirmed one is a 409. The delete is guarded on the status in the same
  statement, so a confirmation that lands after the lead's read still wins. The project
  page no longer offers removal on a confirmed credit, and a refused removal now says why
  and refreshes the sheet instead of failing silently.
- **An engineer's confirmed credits are their own.** `GET /api/network-metrics` counted every
  confirmed credit whose `credited_name` matched the engineer's name, so a namesake's credits
  counted and the engineer's own, credited under another spelling, did not. It now counts
  confirmed credits on participations the engineer's account accepted — the same link that
  lets them confirm a credit.
- **Evidence.** `credit-record.integration.test.ts`, four tests, registered in the runner; the
  suite passes 44 of 44 on a fresh local database. Four defects were put back one at a time,
  and each failed exactly its intended test: the unguarded delete, a guard that also refuses
  disputed credits, a read-then-delete with its window widened by 15 ms, and name matching
  for the engineer count. Every file was restored byte-identical. Both typechecks, API unit
  88, intelligence 31, web 75, the build and the secret scan pass.
- **Not exercised.** The read-then-delete race without a widened window passed the race test
  in three of three runs, so that test catches the race only when it is forced; the
  single-statement guard is what holds it. The project page's hidden control was not seen in
  a browser: `oiano-local` launches from the main checkout, not this branch's worktree.
- **Observed, not changed.**
  - Artist and producer "Confirmed credits" count confirmed credits on projects they own,
    including credits to other people, rather than credits confirmed by them. Changing that
    changes both numbers, so it is a decision.
  - Once confirmed, a credit has no correction path: neither side can retract or amend it.
    A retraction that keeps the record (Evidence, step 19) is the likely answer.
  - `POST /api/producer/projects/:id/credits` still binds a credit to an active participant
    by display name when no participant is named. The participant must still confirm it.

**Standing from work, 2026-09-30 — C18 and C19.** Owner decision of 2026-09-30: an
artist's tier rests only on work other people took part in. This completes A07, whose audit
row already said "DM interest is not completed work"; the 2026-09-14 pass had kept accepted
connections in the tier.

- **TRADED comes from recent work, not contacts.** It used to need two accepted message
  connections in 30 days, and replying to a message request accepts it
  (`connect.routes.ts`). It now needs PRECIOUS standing and completed sessions at two or
  more distinct studios that started in the last 30 days, read from the Weave's evidence
  joined to its bookings. The connection's stored `last_activity_at` is not used, because it
  can lag until its next sync (A08). Evidence whose booking is no longer COMPLETED, left by
  a reversal before A02, does not count.
- **Completeness no longer gates standing.** A tier used to appear only above 60% profile
  completeness, a score the artist raises by filling in their own profile. CUT now needs
  one completed session, and PRECIOUS and TRADED are unchanged apart from the above.
- **Discovery breaks ties by completed sessions**, not by completeness
  (`lib/discoveryRanking.ts`). Completeness is still returned for the profile prompt.
- **Evidence.** The A07 connection test is replaced by three: accepted connections leave an
  artist PRECIOUS; recent work makes one TRADED only across two studios, within the window,
  and only while its bookings are completed; an artist at 0% completeness with ten rated
  sessions is PRECIOUS. Two unit tests hold the discovery order. Integration 46 of 46 on a
  fresh local database; API unit 90, intelligence 31, web 75, both typechecks, the build
  and the secret scan pass. Six defects were put back one at a time: the previous tier rule
  whole, no window, no status filter, a threshold of one studio, evidence rows counted
  instead of distinct studios, and completeness as the tie-break. Each failed its intended
  test; the fifth survived the first version of the test, which gained a second session at
  one studio to catch it. Every file was restored byte-identical.
- **Not done.** Artists who are TRADED today through contacts become PRECIOUS on their next
  read; nothing is stored, so nothing is migrated. Tiers read Weave evidence, so an artist
  whose completed bookings were never synced (before the Weave, or after a failed sync)
  counts none of that work toward TRADED until `prisma/backfill-weave.ts` runs; nothing was
  run against production. Not seen in a browser.
- **Observed, not changed.** Replying to a message request still accepts it; it no longer
  affects standing. Discovery still ranks only the first 50 artists the database returns,
  in no set order (C39, step 14). The studio market view still counts profiles above 60%
  completeness as "qualified"; it is an aggregate, not anyone's standing.

**Fixed 2026-09-15 — what an artist's profile and brief disclose.** Found in a read-only
audit at `682d052`, and reproduced first: against the routes as committed, seven of the
eight new integration tests failed.

- **Profile, to other accounts.** `GET /api/artists/:id` answers anyone signed in, and
  discovery hands out artist ids, so whatever it returns to someone other than the artist
  is public. It returned the artist's last ten session logs (engineer notes, both ratings,
  private testimonials, session summaries), the whole passport row including a location the
  artist had not published, and the account id. It now returns listed fields only
  (`publicArtistSelect` and `publicArtistProfile()` in `routes/artists.routes.ts`): name,
  alias, bio, avatar, availability, join dates and tier, and from the passport its code,
  creative DNA, score, photo, bio, links and collaboration interests, with the location and
  the AI brief only when the artist has published them.
- **Profile, to a studio admin.** An admin at a studio the artist has booked reads that
  public profile, their own studio's bookings with the artist, those sessions' logs, and the
  artist's files, which the files routes already open to them. They no longer read the
  wallet, which holds the artist's money for every studio, or bookings and session logs from
  other studios, and the artist's privacy choices now hold for them too. Whether an admin may
  read the artist was decided from the artist's 50 newest bookings anywhere, so an artist
  busy elsewhere was "not found" by a studio they had booked; every booking counts now.
- **The artist** still reads their whole record.
- **Profile views.** `profile_views` is written only by `GET /api/passport/public/:code`, as
  the count of `PassportView` rows. The profile route also added one for every signed-in
  read, so the two writers disagreed.
- **The AI brief.** `GET /api/artists/:id/summary` let any account make the model write
  about any artist, store the text on that artist's passport, and read a brief the artist
  had hidden or replace it with a new one. It now answers only the artist and the staff who
  work with them: an admin at a studio the artist has booked, or an engineer assigned to one
  of those bookings, the people the files routes let read the artist's files. Anyone else,
  platform operators included, gets 403, and so do staff when the artist keeps the brief
  private. Like the other AI capabilities it is off unless `OIANO_AI_ENABLED` is `true`, and
  answers 501 while off.
- **Web.** The profile page says why a brief could not be generated instead of doing
  nothing, and no longer shows admins a wallet panel, which would now have read $0.00.
- **Consequence.** `render.yaml` sets `OIANO_AI_ENABLED` to `false`, while the brief route
  called Anthropic whenever `ANTHROPIC_API_KEY` was set. Where that is the deployed
  configuration, new briefs stop until the flag is turned on; stored briefs still show.
- **Evidence.** `integration/artist-profile.integration.test.ts` holds each rule on real
  Postgres. Every call it causes to Anthropic is answered by a stand-in and counted, so no
  run reaches the model. Thirteen defects were put back one at a time — each disclosure, the
  wallet, other studios' bookings and logs, the missing booking check, the view count, the
  open brief, unassigned engineers, the hidden brief and the AI gate — and each failed its
  intended assertion; the routes file was restored byte-identical every time. The
  integration suite passes 48 of 48 on a fresh database; the API security suite passes 88,
  the intelligence suite 31 and the web suite 75; both typechecks, the build, `prisma
  validate` and the secret scan pass. `npm test` was run with CI's placeholder
  `DATABASE_URL`: without one, as in a worktree with no `.env`, `creatorContext.test.ts`
  fails at import. **Not exercised:** the profile and connect pages in a browser. Both need
  a signed-in user, so every field they read was traced against the new responses instead.

**Observed while fixing this, not changed** (read in the code, not tested, unless noted):

- The studio roster, `GET /api/artists`, still returns each artist's whole passport, private
  location and hidden brief included, and their wallet; the admin dashboard shows the balance
  and offers a wallet credit. Whether a studio may see an artist's balance is an owner
  decision. *Fixed 2026-09-30, below.*
- The profile page treats every artist as the owner of whatever profile they open. Another
  artist sees Edit on the brief, which saves to their own passport, and upload and delete
  controls the files routes refuse. *Fixed 2026-09-30, below.*
- The brief's cache is never used, observed with a probe against a local database. A stored
  brief is served only when `ai_summary_updated_at` is later than the passport's
  `updated_at`, but the write that stores a brief, and the artist's own edit, move
  `updated_at` a few milliseconds past it. Every request that reaches generation calls the
  model again and replaces the stored brief, an edited one included. The page asks for a
  brief only when it has none to show, so this takes a direct call to the route.

**Landed 2026-09-30.** The fix above sat uncommitted in a worktree from 2026-09-15. It was
carried onto `main` at `6ad78b1` unchanged apart from two append-only merges (this document
and the integration runner), and re-verified: integration 59 of 59 on a fresh database, API
unit 90, intelligence 31, web 75, both typechecks, the build, `prisma validate` and the
secret scan. With the routes reverted to `main`, 9 of the 11 privacy tests fail. The schema
change is to comments only; no migration.

**Fixed 2026-09-30 — the studio roster.** `GET /api/artists` returned each artist's whole
passport row, private location and hidden brief included, and their wallet, to every admin
at every studio the artist had booked. Reproduced 2026-09-15 by
`artist-roster.integration.test.ts`, written then and left uncommitted until the profile
helpers above landed.

- Each row is now `publicArtistProfile()`, so the artist's privacy choices hold, plus the
  account email a studio uses to reach its own customer. No wallet: it holds the artist's
  money from every studio (owner decision, 2026-09-15). The admin dashboard no longer shows
  a balance column, which would otherwise have read $0.
- **Evidence.** The three roster tests fail against `main`'s route; returning the raw rows
  fails the privacy test and adding the wallet back fails the wallet test, each alone, with
  the file restored byte-identical. **Not exercised:** the dashboard in a browser.
 wallet-credit button and modal remain on `main`;
  PR #1 removes the credit route and them.

**Fixed 2026-09-30 — the profile page's owner controls.** `ArtistProfilePage` set
`isOwner` from the viewer's role alone, so every artist was treated as the owner of any
profile they opened from Discover or Connect. They saw Edit on the brief, which saves to
`PATCH /api/passport/summary` and so replaced *their own* brief with text about someone
else, and upload and delete controls the files routes refuse. Ownership is now the viewer
being the profile's user (`lib/artistProfileOwner.ts`); the profile response carries
`user_id` only to its owner, which the profile integration tests assert both ways.

- **Evidence.** Five unit tests for the rule (another artist, other roles, missing ids,
  unloaded data), written 2026-09-15 in a worktree and never wired in. Web 80/80, the web
  typecheck, the build and the secret scan pass. **Not exercised:** the page in a browser;
  the wiring, one line, is typechecked, not render-tested.

**Schema redesign:** designed for review in [schema redesign](OIANO_SCHEMA_REDESIGN.md),
against the owner decisions of 2026-09-12. No migration is written; implementation
waits for Session 5.

**Open defect, found while designing money:** studio payouts sum a studio's payable
across currencies and transfer it in `Studio.currency` (`lib/studioPayout.ts:14–27,60`;
`routes/payouts.routes.ts:110–113`), while booking payments post as USD. Latent while
payouts are off; it must be fixed before a studio with a non-USD currency takes a payout.
*Fixed in the stabilization pass of 2026-09-14, above.*

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
