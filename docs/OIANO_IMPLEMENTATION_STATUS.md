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

**Deliverable versions and reviews, 2026-09-30 — C38, deliverable review.** Delivered
files are one Deliverable per booking, each delivery a numbered version, and the
artist's review answers one version. Under concurrency none of that held.

- **An approval can no longer land on a version the artist did not see.** Review read
  `current_version`, then wrote APPROVED with no condition, so a delivery of version 4
  arriving while the artist approved version 3 left version 4 approved. The review is
  now written only while its version is still current and the deliverable is not
  already approved, in one statement, with the review row in the same transaction
  (`lib/deliverableVersions.ts`). The booking page sends the version it shows; a newer
  delivery answers 409 and refreshes the page. A request without a version, from an
  older page, reviews the version current when it is read, under the same guard.
- **Two approvals at once record one.** The "already approved" check ran before the
  write, so both passed; now the second is a 409 and records nothing.
- **Deliveries at once become consecutive versions of one deliverable.** Both delivery
  paths, `POST /bookings/:id/deliver` and the completion screen, read the latest
  version and wrote the next: two at once both wrote N+1, and the loser hit the
  version's unique key as a 500; two first deliveries created two deliverables for one
  booking. Both now go through one helper that locks the booking row first
  (`FOR NO KEY UPDATE`).
- **Evidence.** `deliverable-review.integration.test.ts`, five tests, registered in the
  runner: six deliveries at once; a stale approval refused and then the current one
  recorded; five approvals at once; eight rounds of a review racing a delivery; another
  artist refused. Integration 52 of 52 on a fresh database; API unit 90, intelligence
  31, web 75, both typechecks, the build and the secret scan pass. Put back one at a
  time, each failed its intended test and every file was restored byte-identical: no
  lock (five of five runs), no version condition, no approved condition. `main`'s
  controllers failed three of the tests in one run; the concurrent-delivery test caught
  them in one run of two.
- **Not exercised.** The review-against-delivery race test did not catch `main`'s
  read-then-write on its own; with that window widened by 25 ms it failed in its first
  round. The guarded statement is what holds it. The booking page's refresh on refusal
  was not seen in a browser.
- **Observed, not changed.** A flaky test, outside this change: `platform.integration.test.ts`
  reads the `studio.registered` event right after registration, which writes it without
  waiting; it failed once in the four full runs made on 2026-09-28 and 2026-09-30, and is
  left for a separate fix. A studio can
  still deliver a new version after the artist approved one, which reopens review; the
  approval stays in the review history, attributed to its version.

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
  brief only when it has none to show, so this takes a direct call to the route. *Fixed; see "the AI brief was rewritten on every request".*

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
- **With the money guards.** PR #1, merged 2026-09-30, removed the credit route and the
  dashboard's `+$` button and modal, so the dashboard no longer reads any wallet.

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

**Fixed 2026-09-30 — no default studio (C30).** `GET /api/studio` answered anyone with the
one studio named in `DEFAULT_STUDIO_SLUG` (`packages/shared`), a single-studio assumption
against AGENTS.md: identity is issued by OIANO, never by a studio. Nothing in the web app
called it; its only consumer was a platform test. The route and both constants
(`DEFAULT_STUDIO_SLUG`, `SINGLE_STUDIO_MODE`) are gone. Studios are listed by
`/api/studio/options` and read by slug.

- **Evidence.** The platform test now asserts `GET /api/studio` is a 404, and moves its
  check that commercial terms stay private to `/studio/options`, the public list the app
  uses. With the route restored, that assertion fails. Integration 46 of 46 on a fresh
  database; API unit 90, intelligence 31, web 75, both typechecks, the build and the
  secret scan pass.
- **Observed, not changed.** An unknown API route answers with Express's HTML 404 page, not
  JSON through `error.middleware.ts`.
- **Not known.** Whether anything outside this repository still calls `GET /api/studio`.

**Fixed 2026-09-15 — a contribution invitation belonged to its email address.** Found by a
read-only architecture audit at `682d052` and reproduced before anything changed.

- **The defect.** An invitation belonged to any account at the invited address, and signup
  never proves an address belongs to whoever registers it. At `682d052`, on real Postgres, an
  account registered at an invited address after the invitation saw it in its inbox, accepted
  it, opened the project's workspace and messages, and became the rights holder when the lead
  proposed a split naming that participant. An account registered at the address first was
  bound to the invitation when it was created, and notified.
- **The fix.** An invitation is claimed with a link, following `StudioStaffInvitation` and
  `CreatorInvitation`: a random token of which only the SHA-256 is stored
  (`contribution_invitations`), a 14-day expiry, and single use by a conditional claim
  (`POST /api/contributions/claim`). The lead receives the link once, when adding a participant
  with an email. Claiming binds the participant to the claimer, who then accepts, declines or
  asks for a correction in the inbox as before. No email is matched anywhere: not when the
  invitation is created, nor in the inbox, answering, the workspace or credits. The address
  stays on the participant as a hint for the lead. While nobody has claimed an invitation the
  lead can send a new link, which retires the old one; removing the participant retires theirs;
  the lead cannot claim their own. The project page shows the link with a copy button and a
  new-link action, and `/accept-contribution` claims it and opens the inbox.
- **Migration `20260914120000_contribution_invitation_links`** adds the table and unbinds
  unanswered invitations that the email match bound at creation; they wait for a link like new
  ones. Answered invitations are left as they are: after the fact, an address match cannot be
  told apart from the person invited. It has been applied only to local databases, and must be
  applied before this code deploys, because inviting with an email fails without the table. The
  schema redesign's plan to keep the email match until step 11 is marked superseded.
- **Evidence.** The new integration test failed at `682d052` on both paths and passes now,
  beside tests for claiming under any address, expiry, a guessed link, two claims at once, a
  replaced link and a removed participant. The platform test claims with the link instead of
  asserting the email binding. Integration suite 47 of 47 on a fresh database; `npm test` 89 API,
  31 intelligence and 80 web tests; both typechecks; build; secret scan, with the new files
  scanned before they are tracked. Eleven API defects were put back one at a time: each email
  match, the claim without its conditional filters (both of two simultaneous claims won), no
  expiry, self-claim, a replaced or removed participant's link staying claimable, and the raw
  token stored. Each failed exactly the sub-tests that cover it, and every file was restored
  byte-identical. Three web defects failed their render tests the same way. The migrations still
  differ from `schema.prisma` in the same nine tables as gate 2, and in nothing more. On a
  database at the previous migration holding participants in every state, the migration changed
  only the unanswered invitation bound by email, and kept its address. In a browser, a link
  opened while signed out survives the redirect to sign-in. **Not exercised:** claiming,
  answering and the project page's link panel in a browser while signed in; render tests cover
  the pages.
- **Changed for users.** An account at the invited address is no longer notified: the lead sends
  the link. Delivering it automatically needs verified email addresses, or OIANO sending the link
  under a limit, since producer signup is open.
- **Landed 2026-09-30, on a branch.** Left uncommitted in a worktree from 2026-09-15 and
  carried onto `main` at `6ad78b1` unchanged apart from append-only merges; it sits beside the
  credit-record fix, whose tests still pass. Integration 54 of 54 on a fresh database; API
  unit 91, intelligence 31, web 80, both typechecks, the build, `prisma validate` and the
  secret scan. With the contributions route and helper reverted to `main`, all eight
  invitation tests fail. **The migration has not been applied to production; the branch
  merges only after it is.**

**Observed while fixing the invitation, not changed** (read in the code, not tested):

- Signing in as anyone but an artist ignores `next` (`web/pages/EnterPage.tsx:78–82`), so a
  creative professional who opens a link while signed out lands at home and must open it again.
- A studio staff invitation is accepted with its token and also requires the accepting account's
  email to equal the invited one (`routes/studio.routes.ts:199`). The check grants nothing, but
  whoever registers an invited staff address first stops the invited person accepting.
- The other email comparisons authenticate (login), deliver (password reset), refuse a
  self-invitation, or search as staff and operators; none grants access.
- Contributions already answered through an email match are unchanged. A read-only query lists
  them for review; `registered_after_invite` marks the pattern the audit described:

  ```sql
  SELECT p.id, p.project_id, p.status, u.created_at > p.created_at AS registered_after_invite
  FROM project_participants p JOIN users u ON u.id = p.participant_ref_id
  WHERE p.status <> 'INVITED' AND lower(p.email) = lower(u.email)
  ORDER BY p.created_at;
  ```

**Fixed 2026-10-01 — a studio can set up what it is booked for (C06).** A booking needs a
room and a service, and no route created either: a studio that registered itself could
not take its first booking without someone editing the database. Owner decision of
2026-10-01: build it now, on today's `Room` and `ServiceOffering`, rather than wait for
migration step 6, which moves these rows with every other.

- **API, `/api/studio-setup`** (`routes/studio-setup.routes.ts`). Every member of the
  studio's staff reads its rooms and services, whether it can be booked yet, and how many
  bookings each has. Adding, editing and deleting follow the studio's standards authority:
  `MANAGE_POLICIES`, which the owner and manager presets carry, or a STUDIO_ADMIN
  membership with no explicit capabilities, which is how a self-registered owner is
  created. Reception and engineers read only. Everything is scoped to the caller's studio
  and audited, price changes with their old and new figure.
- **Prices.** A service's price is what a booking is charged, per hour for an hourly
  service and otherwise once; an optional upper figure is shown and never charged. A
  booking stores its own total, so a new price applies to the next booking only. Prices
  are checked to two decimal places and an upper figure below the price is refused; names
  are unique within the studio.
- **Nothing booked is deleted.** A room with bookings, equipment, maintenance history or
  availability, and a service with bookings, stay on the record and can be edited. The
  check runs first; the foreign keys still refuse a booking that lands in between, which
  is answered the same way. There is no retire flag yet, because adding one needs a
  migration; step 6 brings it.
- **Web, `/admin/setup` ("Rooms & services")**, from the operator dashboard beside Team
  and Standards and from the command palette. It says plainly when the studio cannot be
  booked yet, and reads only for staff who cannot change it.
- **Evidence.** `studio-setup.integration.test.ts`, seven tests, follows a studio from
  self-registration to its first booking at its own price, a price change that leaves
  that booking's total alone, refused deletes, validation, the permission rule for owner,
  manager, reception, engineer and artist, and another studio's owner refused. Integration
  104 of 104 on a fresh database; API unit 102, intelligence 31, web 85, both typechecks,
  the build and the secret scan pass. Put back one at a time, each failed its intended
  test and the file was restored byte-identical: anyone may manage, an edit not scoped to
  the studio, duplicate names, an upper figure below the price, and deleting a booked
  service with neither the check nor the foreign-key answer. Removing the check alone did
  not fail: the foreign key refuses the delete and is answered as a 409, as designed.
- **Not exercised.** The page in a browser: the preview launches the main checkout, which
  does not have this branch. Engineers (people) are still created only by seed data (C05).

**Fixed 2026-10-05 — a studio can list the engineers it schedules (C05, in part).** A
booking's engineer must be an `Engineer` record at its studio, and nothing outside the seed
created one. Nobody can sign up as an engineer, and an engineer invited as staff joins with
an artist or producer account, which grants no engineer access (C01, C04). Real engineer
accounts need the Identity migration. Owner decision of 2026-10-05: a studio may schedule
engineers who have no login, the open question in the build direction, answered yes.

- **API.** `/api/studio-setup` lists engineers with rooms and services, and
  `POST/PATCH/DELETE /engineers` add, edit and remove them, under the same rule: the
  studio's standards authority, scoped to the caller's studio, audited. Names are unique
  within the studio. An engineer on a booking, as assigned or as requested, stays on the
  record.
- **Engineers with a login.** A record linked to an account belongs to that person: the
  studio may set their rate and specialties but not their name or bio, and cannot remove it.
- **Web.** An Engineers section on Rooms & services. Listed engineers appear on the booking
  page for artists to request and in assignment for staff, with no other change, because
  both read the studio's engineers.
- **Evidence.** Four integration tests in `studio-setup.integration.test.ts`: an engineer
  listed and assigned to a real booking, then refused deletion; duplicate names; a linked
  engineer's name and bio refused while rate and specialties are set; reception and another
  studio refused. Integration 108 of 108 on a fresh database; API unit 102, intelligence 31,
  web 85, both typechecks, the build and the secret scan pass. Put back one at a time, each
  failed its intended test and the file was restored byte-identical: a linked name
  editable, a linked record deletable, an edit not scoped to the studio, duplicate names.
- **Not done.** The engineer as a person: signup, claiming a listed record, and engineer
  screens for an account that is not ENGINEER by role all wait for the Identity migration,
  which makes these records unclaimed memberships. `Engineer.user_id` is unique, so one
  account can still hold an engineer record at one studio only. Not seen in a browser.

**Canonical migration, steps 1 and 2 — Person and CreativeProfile, 2026-10-05. On a branch,
not merged: it waits for stabilization gate 2.** Owner decision of 2026-10-05 to start the
Identity migration now. Built to the first slice in `OIANO_SCHEMA_REDESIGN.md` §7, with no
route changes.

- **Expand.** Migration `20261005120000_identity_person_profile` adds `persons` and
  `creative_profiles` and two enums, and touches no legacy table. Deleting a user keeps
  their Person with `user_id` cleared; a Person with profiles cannot be deleted.
- **Backfill** (`lib/identity/backfill.ts`, run by `prisma/backfill-identity.ts`). One Person
  per User, named from the user's artist, producer or engineer record in that order, never
  from the email address. One CreativeProfile per Artist, Producer and Engineer row under
  the same id, with a unique handle from the name the person chose; an artist's
  unpublished location stays private. An engineer without a login gets a Person with no
  `user_id`. It only creates what is missing, so a second run changes nothing and nothing
  written later is overwritten. An id found in two legacy tables stops it before it writes.
- **Verify.** `identityParity()` (`--verify` writes nothing) lists every User without a
  Person, every legacy identity without its profile or under the wrong person, every
  ARTIST WeaveNode naming no profile, and profiles whose legacy row is gone.
- **Departures from the §3.1 sketch.** `Person.display_name` is nullable: a studio operator
  has no record that names them, and the rule forbids taking it from an email.
  `CreativeProfile.legacy_source` records which legacy table a profile mirrors while
  legacy readers remain. `Person.active_organization_id` waits for step 4's Organization.
  Discipline and PersonDiscipline are step 3.
- **Evidence.** `identity-backfill.integration.test.ts`, nine tests, backfills the whole
  integration database, every other file's accounts included, and finds zero mismatches; a
  second run changes nothing, row for row; one account with an artist and a producer record
  ends with one Person and two profiles; operators get no name; a listed engineer is an
  unclaimed identity; namesakes get distinct handles; an identity created after the
  backfill is reported and resolved by the next run; an id collision writes nothing.
  Integration 114 of 114 on a fresh database; API unit 102, intelligence 31, web 85, both
  typechecks, the build and the secret scan pass. Put back one at a time, each failed its
  intended test and the file was restored byte-identical: persons re-created, profiles
  re-created, the producer record named first, an email as a name, no collision check, a
  private location published, no handle suffix, and parity blind to a User without a
  Person. The migration adds no drift: `prisma migrate diff` from the migrations to the
  schema prints the same 43 lines on `main` and on this branch, all of them gate 2. On a
  freshly seeded database the script found 12 unresolved identities, created 9 persons and
  7 profiles, then reported parity, and a second run created nothing.
- **Before merge.** Gate 2 passes; the migration is applied to production; the script is
  run there and reports parity. Until writers move (the next slice), identities created
  after a run are resolved by running it again.

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

**Pre-commit tests, 2026-09-24 — `npm test` no longer needs a `.env`, or reaches the
shared database.** AGENTS.md tells every agent to run `npm test` before committing, but
the command only worked where a `.env` happened to be readable, and what it did there was
worse than failing.

- **The cause.** `lib/prisma.ts` constructs a `PrismaClient` at import time
  (`apps/api/src/lib/prisma.ts:33–38`). Two files in the unit suites reach it,
  `creatorContext.test.ts` and `bookingTransitions.test.ts`, though every assertion in
  them is over pure functions and nothing queries. The suite's datasource therefore came
  from whatever `.env` the process found, with two outcomes and no third.
- **Where a worktree has its own `node_modules`:** `DATABASE_URL` is undefined,
  `buildDbUrl()` returns undefined, and the constructor throws
  `PrismaClientConstructorValidationError: Invalid value undefined for datasource "db"`.
  The file fails to load before one assertion runs.
- **Where it has none** — which is every worktree the desktop app creates — Node resolves
  `@prisma/client` up to the main checkout's `node_modules`, and that generated client
  carries the main checkout's schema path and loads the `.env` beside it. Importing
  `@prisma/client` is enough to inject the **shared Neon URL** into `process.env`.
  Measured on 2026-09-24: the suite reported 88/88 green while every module in it held the
  shared database's credentials, one query away from using them. This is what rule 1
  exists to prevent, and it reported nothing.
- **The fix.** `apps/api/scripts/test-env.js`, loaded by `node -r` from `test:security`
  and `test:intelligence`, pins `NODE_ENV=test` and the same deliberately unreachable,
  credential-free `postgresql://127.0.0.1:5432/validate_only` that CI already sets at the
  job level (`.github/workflows/ci.yml`, `verify`), so a local run and a CI run are
  configured identically. Neither Prisma's own loader nor `dotenv` without `override`
  displaces a variable that is already set, and `NODE_ENV=test` is what holds
  `lib/prisma.ts:12` to `override: false`, so `apps/api/.env` cannot replace it again in a
  checkout that has one. The test runner propagates `-r` to the child process it spawns
  per file.
- **The guard.** `apps/api/src/lib/testEnv.test.ts` fails if the unit suites are pointed at
  a non-loopback host. Loopback separates the two cases by construction: the shared
  database is remote, while CI's placeholder and the local cluster on 55432 are not.
- **Evidence.** In a worktree with no `.env` and no `node_modules`: API security 89/89,
  API intelligence 31/31, web 9 files / 75 tests, secret scan across 419 tracked files.
  Both defects were put back and watched to fail — the guard run without the preload fails
  on the missing pin; an import of `@prisma/client` without it resolves to the Neon host
  and the loopback check fires; `new PrismaClient` with `url: undefined` still throws the
  reported error, while the placeholder constructs cleanly. **Not exercised:** nothing here
  runs in a browser, and no database was connected to at any point.
- **Found, not fixed.** `npm run typecheck --workspace=apps/api` and `npm run build` fail
  in a worktree with 119 errors, almost all of the form "Property 'artist' does not exist
  on type". The count is identical with and without this change, so it is pre-existing.
  `prisma/schema.prisma` is byte-identical to the main checkout's and does declare those
  relations, so the generated client in the shared `node_modules` is stale; CI never sees
  it because it runs `npx prisma generate` before typechecking. Regenerating writes into
  the shared `node_modules` that other agents' worktrees resolve through, so it is left for
  the owner to run rather than done as a side effect of this work.

**Audit follow-up, 2026-09-15 — the load test, request logs and the rate-limit key.** From
the read-only architecture audit at `682d052`. Committed 2026-09-30; see the last bullet.

- **Load test, streams.** `apps/api/scripts/load-test.js` sent a Bearer header to the
  notification stream, which accepts only a ticket, and counted every response as opened,
  401s included. Each connection now fetches its own ticket just before opening, because a
  ticket lasts 60 seconds. Only a 200 counts as opened. The phase reports ticket and stream
  responses by status, streams that dropped before the end, and network errors.
  `SSE_OPEN_CONCURRENCY` (default 100) bounds how many streams are set up at once.
- **Load test, bookings.** The burst sent no bookings at all, which is worse than the audit
  thought. autocannon runs `setupRequest` only from an entry in `requests`; the script passed
  it at the top level, where autocannon 8 ignores it, so every request went out without a body
  and could only be refused with a 400 or a 429. Bookings are now built per request, take the
  accounts in `ARTIST_ACCOUNTS_FILE` in turn (`ARTIST_EMAIL` and `ARTIST_PASSWORD` still work
  for one), and are reported by status. The old "429" figure counted every 4xx. Signing in
  more than ten accounts waits out the auth limiter instead of failing.
- **Load test, recovery check.** `/health` sits behind the global limiter, so after the burst
  it could answer 429 from the test machine's spent budget, and the script could report a hard
  blocker the database did not cause. A 429 is now waited out and reported separately.
- **Rate limits.** When this was written, every limiter keyed on the client address, so one
  machine got 300 requests and 20 bookings a minute however many accounts it used. PR #1,
  merged 2026-09-30, keys signed-in traffic per account, so the burst now spreads across
  `ARTIST_ACCOUNTS_FILE`. The script has still not been run against a deploy.
- **A14, request logs.** `accessLog.middleware.ts` and `error.middleware.ts` logged
  `req.originalUrl`, so a stream or file-download ticket reached the logs. Both now log it
  through `redactUrlForLog` (`lib/logRedaction.ts`), which replaces every query value, not
  only `ticket`, and anything sent in place of a parameter name. Names stay.
- **Rate-limit key: not carried.** A proposal was written with this fix
  (`OIANO_RATE_LIMIT_PROPOSAL.md`, never committed). PR #1 has since built per-caller limits
  ("Rate limits count a caller", 2026-09-24), so the proposal was left out when this landed.
  Whether the first `X-Forwarded-For` entry can be spoofed on Render is for PR #1's
  `trust proxy` setting to settle.
- **Evidence.** Both typechecks pass. `npm test` passes with CI's credential-free
  `DATABASE_URL`: API security 92/92 (four new tests), intelligence 31/31, web 75/75. The
  secret scan passes, and the three new files, which it does not scan until tracked, match
  none of its patterns. Six defects were put back one at a time: the helper returning the URL
  unchanged, each log site logging the raw URL, and three narrower rules. Each failed exactly
  its intended tests, and every file was restored byte-identical.
- **Evidence, load test.** Its functions were run against a stub server on 127.0.0.1, with no
  OIANO API and no database. The old booking options sent 20 of 20 requests without a body.
  The new ones sent 60 bookings across three accounts and 60 hour slots. Of 12 streams, with
  the stub refusing two tickets, rejecting one stream and dropping another, 9 opened and 8
  were still open at the end. A rate-limited health check was waited out. Putting back the
  three stream and booking defects (any response counted as opened, a Bearer header instead of
  a ticket, one account for every booking) failed that run each time.
- **Not exercised.** The load test against a deploy, the integration suite, and the redacted
  lines in Render's log stream.
- **Landed 2026-09-30.** Left uncommitted in a worktree from 2026-09-15 and carried onto
  `main` at `6ad78b1`, without the rate-limit proposal (see above). First integration run on
  this change: 46 of 46 on a fresh database. API unit 94, intelligence 31, web 75, both
  typechecks, the build and the secret scan pass; the load test parses. With
  `redactUrlForLog` returning the URL unchanged, three of its four tests fail.

**Observed while fixing A14, not changed** (read in the code, not tested):

- The rest of A14: `services/clockActivityConsumer.ts:17-21` logs each event's full payload.
- With `SENTRY_DSN` set, Sentry attaches the request URL and query string to a captured error
  by default, so a 5xx on a ticketed file download would send its ticket there. `render.yaml`
  does not set `SENTRY_DSN`.
- The admin audit log stores `req.originalUrl` (`lib/adminAudit.ts:13`). No ticketed route
  writes to it today.

**Fixed 2026-09-15 — the AI brief was rewritten on every request.** `GET
/api/artists/:id/summary` served a stored brief only while `ai_summary_updated_at` was later
than the passport's `updated_at`, which Prisma moves on every write to the passport, storing
the brief included. So this route never served a stored brief: every request paid the model
again, and the first request after an artist edited their brief replaced the edit and reset
`ai_summary_edited`.

- **The owner's rule, decided 2026-09-15.** A stored brief stands until the artist changes
  it, whether the model or the artist wrote it; a new name, alias, bio, creative DNA, session
  or profile strength does not rewrite it. A brief is written only for a passport with none,
  and a brief the artist emptied counts as none, so "Generate brief →" still works after they
  clear it. No schema change.
- **Storing.** A brief is stored only while the passport still has none, so an edit saved
  while the model is writing is kept. The write is awaited, so the next request finds the
  brief instead of paying for it again. "Summary unavailable.", the service's answer when the
  model sends no text, is not stored, because under this rule it would stand.
- Only `routes/artists.routes.ts` changed; `services/ai-summary.service.ts` and
  `PATCH /api/passport/summary` did not. `ai_summary_updated_at` now only records when the
  brief was written.
- **Evidence.** `artist-brief.integration.test.ts` answers and counts every call to
  Anthropic. Its seven tests all failed against the route as committed (`682d052`), each on
  its intended assertion, and pass after the fix; the integration suite passes all 47 tests
  on a fresh database. Six defects were put back one at a time: the old timestamp rule, an
  unconditional write, an unawaited write, an emptied brief served as a brief, a write that
  skips emptied briefs, and a stored placeholder. Each failed its intended test, the
  unawaited write also failing a timing-dependent read in the placeholder test, and the route
  was restored byte-identical every time. Both typechecks, `npm test` (API 88, intelligence
  31, web 75), the build and the secret scan pass. **Not exercised:** the brief panel in a
  browser, which asks for a brief only when it has none, and a real model call.
- **Landed 2026-09-30.** Written on 2026-09-15 and left uncommitted in a worktree; carried
  onto the profile and brief fix above (PR #7) unchanged, since that fix left the cache rule
  as it was. With both in place the seven brief tests and the profile tests pass together;
  with the route reverted to PR #7's, all seven brief tests fail. Integration 67 of 67 on a
  fresh database; API unit 90, intelligence 31, web 75, both typechecks, the build and the
  secret scan pass.

**Observed while fixing the brief, not changed** (read in the code, not tested):

- On this branch the brief route still answers any signed-in account and ignores
  `OIANO_AI_ENABLED`. Access to it and the AI gate are uncommitted work on
  `claude/great-pasteur-c19503`.
- `services/ai-summary.service.ts` still has no timeout, so a model call that hangs holds the
  request open. The [Stage 1 audit](../INTELLIGENCE_LAYER_STAGE1_AUDIT.md) keeps that service
  untouched.
- Two first requests at the same moment both call the model. The first brief stored stands,
  and the other request answers with a brief that was not stored.
- Edits the defect already replaced cannot be recovered or told apart from generated briefs,
  because it also reset `ai_summary_edited`.

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

That is one of two ways the shared database arrives unasked. The other reaches a
process that never reads `.env` at all, through Prisma’s generated client — see
the pre-commit tests entry of 2026-09-24 above.

**Fixed 2026-09-15 — local databases across worktrees.** `scripts/local-db.js` took any
server answering on 55432 for the checkout's own cluster. A worktree that found another
worktree's cluster there never started its own: its `fresh`, `test` and `dev` created and
migrated databases on the other cluster, its `prune` dropped the other worktree's
databases, and its `stop` failed, because its own cluster had never started. On
2026-09-15 one worktree's `prune` dropped three of another's integration databases this
way.

- A running server is used only when `SHOW data_directory` names the checkout's own
  `.oiano/postgres`. When another server holds the port, the cluster starts on the first
  free port from 55432 and `.oiano/port` keeps it; later commands also find a running
  cluster through its lock file. A port named by `OIANO_LOCAL_PG_PORT` that another
  server holds is refused, naming that server's data directory. A start that loses its
  port to another checkout starting at the same moment tries the next free one.
- `fresh` records each database it creates in `.oiano/created-databases`, and `prune`
  drops only those. Other test databases on the cluster are listed and left.
- `stop` stops only the checkout's own server, and says so when the port belongs to
  another cluster.
- **Evidence.** A simulation ran copies of the script as separate checkouts, each with its
  own throwaway cluster. The committed script reproduced all three defects. With the new
  script, 40 checks passed: two checkouts that wanted one port each kept to their own
  cluster through start, fresh, status, prune and stop; commands pointed at the other
  checkout's port refused; `prune` left a database another checkout had created; and a
  start that lost its port to a process binding it at the same moment moved to another.
  For a single checkout, nine steps of start, status, fresh, prune and stop printed
  exactly what the committed script prints. Seven protections were removed one at a
  time, and each removal failed its intended check. The cluster another session was
  running on 55432 was only read, and kept its data directory and all six databases. In
  this worktree, after building `packages/shared`, `npm run test:integration:local`
  passed all 39 tests on the worktree's own cluster, which started on 55433 because
  55432 was taken; `prune` then dropped exactly the two databases `fresh` had recorded.
- **Not changed.** A worktree still running the committed script attaches to whatever
  answers on its port, and can still drop databases there, until it picks up this change.
  Databases created before this change are in no record, so `prune` lists them instead
  of dropping them. On a fresh checkout the integration suite cannot load
  `@oiano/shared` until `npm run build --workspace=packages/shared` has run; that gap is
  older than this change and needs its own fix.
