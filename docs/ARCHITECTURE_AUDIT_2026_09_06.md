# OIANO architecture audit — 6 September 2026

Baseline: `51ce3b2` (including Claude's corrected direction document). This is a source-code audit plus local regression verification, not a production certification. No external payment rail, deployed environment, R2 bucket, or SendGrid account was exercised. Paths below are repository-relative. Findings distinguish observed code from inferred failure scenarios. The two implementation changes are identified in §14; everything else is a finding or proposal.

## 1. Executive architecture summary

OIANO is a relational creative-work platform with event notifications and selected read projections. It is not event-sourced. Its strongest boundary is the Weave: its synchronizer reads Booking and writes only Node/Connection/Evidence. Financial posting also has a recognizable owner, separate from the Weave. Booking completion and session-log persistence now have shared helpers.

The remaining complexity is mostly inconsistent boundaries between entry points, not a need for new infrastructure. An enum validates a booking status but does not validate a transition. A private/public passport view can write the same cached score from different inputs. A user-scoped activity bridge coexists with unrestricted SSE broadcasts. A balanced ledger does not by itself make payment lifecycle or replay handling safe.

The locked model remains: **Node = growing creative entity; Connection = meaningful relationship; Evidence = why that relationship exists.** Work produces evidence; evidence supports relationships and explainable trust. UI and intelligence may interpret it, never replace it with assertions or popularity.

Corrections to the working map, verified against this tree:

- Artist passport recomputation already exists. The defect is inconsistent input selection, missing orchestration/bulk access, and no producer equivalent—not the absence of a calculator.
- `ActivityEvent.artist_id` is nullable. An event without an artist can be stored, although the envelope has no typed studio/aggregate field and the SSE bridge skips it.
- `SessionLog` has no status column. Session workflow status belongs to Booking; free-text status risks apply to rights, consent, delivery, and other models.
- `financialReconciliation.ts` already compares internal payment/top-up records with ledger source IDs and finds imbalance. It does not compare external rail statements.
- Raw multipart metadata reads remained in `files.routes.ts`; fixed here. `producer.routes.ts` also reads/normalizes promotional channels before its schema parse. Stripe intentionally verifies raw signed bytes.
- Weave backfill is additive, not a complete repair mechanism. Circle recomputation also leaves a stale member unchanged when completed activity falls to zero.
- The canonical communication tables exist in the schema, but no `communicationEvent` writer was found in `apps/api/src`. Existing booking/project/connect message routes remain active. Schema and architecture prose alone do not establish a shipped event-backed communication flow.

## 2. Source-of-truth map

“None” below means no ActivityEvent producer/consumer found for that domain, not that the UI receives no notification. The event log is never the reconstructive owner of these domains.

| Concept | Authoritative owner / boundary | Derived representations | Events produced / consumed | UI surfaces |
|---|---|---|---|---|
| User | `User`, auth controller/middleware; persisted role and auth version | JWT claims, auth store | None / none | Enter, onboarding, account navigation |
| Artist | `Artist` identity; `ArtistPassport` portfolio fields | Passport, discovery, tier | `profile.created`, `status.changed` / none | Artist profile, passport, discovery |
| Producer | `Producer`, producer routes | Producer passport, project board | None / none | Producer dashboard/passport, professional onboarding |
| Engineer | `Engineer` bookable identity; optional unique `user_id`; one `studio_id` | Staff dashboard and assignment choices | None / none | Engineer dashboard, bookings, studio team |
| Studio | `Studio`; membership in `StudioStaff`; active selection resolved by middleware | Studio passport, operating dashboards | No typed studio activity family / none | Studio passport, select studio, admin dashboard |
| Manager | No independent Manager model or auth role; `StudioStaff.position`, capabilities, and project participant/credit role | Team and contribution views | None / none | Studio team, contribution workspace |
| Node | Artist/Studio owns identity; `WeaveNode` is a thin type-tagged registry sharing entity ID | Node lookup | None; synchronizer called directly | No direct Weave HTTP/UI consumer found |
| Connection | `WeaveConnection` projection of completed Booking relationships | Count/date summary | No bus consumption; direct sync | Future relationship context; current DM connection is a separate concept |
| Evidence | Booking owns the fact; `WeaveEvidence.booking_id` cites it | Evidence count | None; direct sync | No direct evidence endpoint found |
| Booking | `Booking`, booking controllers and policy checks | Calendar, clock, runsheet, Weave, circle | `session.booked`, `booking.confirmed`, `booking.cancelled`, `session.completed` / none | Booking/detail, calendar, studio/artist dashboards |
| Session | Booking owns lifecycle; `SessionLog` owns notes, ratings, tracks, timing record via `lib/sessionLog.ts` | Session recap and activity feed | Completion event is emitted by booking helper / none | Completion form, session notes, clock |
| Project | `Project` and participant/rights/credit children; producer and contribution boundaries | Project dashboard and intelligence | Notifications; no project ActivityEvent / none | Project detail, artist projects, contribution workspace |
| Passport | Artist/Producer and passport fields; identity is not owned by cached score | Strength, views, generated summary, public view | Creation emitted at signup / none | Private/public/producer passport |
| Credit | `ProjectCredit`, confirmed by the linked active participant through contributions route | Public credits and counters | `CREDIT_RESPONSE` Notification, not ActivityEvent / none | Contribution inbox, project detail, passport |
| Payment | `Payment` owns rail/workflow state; `FinancialTransaction` + entries own accounting postings | Receipt, finance dashboard, reconciliation | Stripe events consumed; booking `payment.received` emitted / Stripe handlers | Checkout return, receipt, finance |
| Wallet | `Wallet` cached balance + signed `WalletTransaction`; changes through `applyWalletDelta` | Balance and transaction feed | Targeted `wallet_updated` SSE / Stripe top-up handler | Artist dashboard and booking payment |
| Invoice | No Invoice model or issuing/lifecycle domain found | Receipt is a payment representation, not an invoice ledger | None / none | Receipt page |
| Availability | Booking reservations, room/engineer resources, `AvailabilitySlot`, studio policies; ownership/checks spread across endpoints | Available intervals and booking form choices | No dedicated availability event; client invalidation / none | Booking form and calendar |
| Geo context | Studio address/timezone; private-by-default ArtistPassport location; Producer location | Market aggregates and region labels | None / none | Passport and maintenance markets |
| Notifications | `Notification` owns inbox/read state; SSE is ephemeral transport | Bell and latest-40 inbox | Direct notifications plus activity bridge / seven ActivityEvent names | Notifications page, bell, refresh hooks |

Identity and role are separate in the schema, but a single `User.role` still selects access paths. One user can have creative identities while staff positions and disciplines are separate concepts. Engineer's unique user link and single studio are narrower than multi-studio staff membership; do not assume the two models are interchangeable.

## 3. Entanglement audit

Severity is impact, not a claim that production has already suffered the scenario. High-risk deferred items need dedicated regression cases before repair.

| ID | Severity | Observed coupling / consequence | Evidence and proper owner |
|---|---|---|---|
| A01 | HIGH | SSE transport exposes `broadcastAll` to all authenticated streams. Booking IDs/statuses and a full studio announcement can cross tenant boundaries. The newer artist bridge does not fix older callers. | `routes/notifications.routes.ts:28`; calls in booking/session-management/completion, admin, artists routes. Recipient authorization belongs to notification/tenant boundary. |
| A02 | HIGH | Status endpoint accepts any enum member and updates without checking the old state. A completed booking can become pending/cancelled; repeated completion emits another fact. Weave/circle are not retracted. | `controllers/bookings.controller.ts:487`. Booking owns legal transitions and once-only completion. |
| A03 | HIGH | Payment success can set a cancelled/completed booking to CONFIRMED. Failure handler can overwrite a paid/refunded payment with FAILED. Checkout can create another session and reset a non-PAID terminal record to PROCESSING. | `routes/webhooks.routes.ts`, `routes/payments.routes.ts`. Payment/booking transition coordination, not UI or Weave. Static failure-path finding; no external rail replay performed. |
| A04 | HIGH | Named-rights decisions check PENDING before entering the transaction, then update unconditionally. Concurrent decisions by the same holder can both win; different holders can aggregate against incomplete concurrent snapshots. | `lib/rightsDecision.ts:5`. Rights domain must serialize agreement settlement and guard the decision claim. |
| A05 | HIGH | Session append read the old note before replacing the full string; concurrent saves could silently lose evidence. | `lib/sessionLog.ts`, fixed with atomic insert/append; real-Postgres concurrency regression. Explicit replacement of notes remains a different command. |
| A06 | MEDIUM | Public/private/recompute passport paths use different project/booking sets, but public GET persists its score into shared strength. Pending/cancelled bookings count in full recompute; even future confirmed hours count as verified in public views. `portfolioBreakdown` also excludes delivered projects from active while `portfolioScore` does not. | `routes/passport.routes.ts:50–141,226–235`. One versioned scoring input contract belongs outside presentation filtering. |
| A07 | HIGH | Tier mixes professional standing with inbound PassportConnection requests (no accepted-status filter) and uses artist ratings of engineers as input to the artist's tier. This undermines the verified-work north star even though the Weave itself is clean. | `lib/artistTier.ts`. Recommendation/standing semantics need explicit evidence ownership; DM interest is not completed work. |
| A08 | MEDIUM | Weave count only increments for new evidence; corrupted count is not repaired. Replaying older bookings rewrites last activity backwards, and first activity remains whichever booking synced first. Booking `updated_at` is mutable, not completion time. | `lib/weave/sync.ts:39`; `prisma/backfill-weave.ts`. Projection must derive count/min/max from a defined immutable or domain-authoritative activity timestamp. |
| A09 | MEDIUM | Clock treats a scheduled interval as active even for PENDING or COMPLETED; its end-time condition makes the overtime branch unreachable. Server-local midnight differs from studio timezone and misses spanning sessions. | `routes/studio-clock.routes.ts:45–76`. Representation must distinguish schedule from actual workflow state. |
| A10 | MEDIUM | Project UI labels sum of booked `total_usd` as Revenue regardless of payment or refund. Booking form duplicates quote/affordability math; server still validates payment and policy. | `pages/ProjectDetailPage.tsx:187,266`; `pages/BookingPage.tsx:165–208`. Posted financial figures belong to accounting read models; estimates need accurate labels. |
| A11 | MEDIUM | Multipart metadata was trusted through casts and `.trim`; repeated fields produce arrays and a 500. | `routes/files.routes.ts`, fixed with Zod. File bytes still enter multer before access/schema validation; orphan-file cleanup remains separate debt. |
| A12 | MEDIUM | Event persist happens after domain commit and can fail without retry; a persisted event can also miss in-memory emission on process death. Activity feed can omit real work despite correct Booking. | `lib/bookingCompletion.ts`, `lib/activityEvents.ts`, call sites. Domain owns durable state; notification reliability must be specified separately. |
| A13 | MEDIUM | Session start is copied from Booking only at initial log creation; later rescheduling can leave the stored start stale. Explicit session-note replacement can still overwrite appends if based on stale editor content. | `lib/sessionLog.ts`; `controllers/bookings/session-management.controller.ts`. Define scheduled versus actual timestamps and editor conflict semantics before broader changes. |
| A14 | MEDIUM | Logs include `req.originalUrl`, including query strings on ticketed stream/file endpoints. Event consumer logs full payloads. | `middleware/accessLog.middleware.ts`, `error.middleware.ts`, `services/clockActivityConsumer.ts`. Observability must redact credentials and minimize private content. |
| A15 | MEDIUM | Availability reads UTC start dates only; reschedule overlap checks miss an existing interval fully contained in the requested interval, omit engineer conflict, and check then write without a shared concurrency guard. | `routes/availability.routes.ts`, `controllers/bookings/session-management.controller.ts:68–87`. Reservation domain needs one interval/conflict contract. |
| A16 | LOW | Domain helpers import notification transport from a routes module; schema-only communications and stale comments blur what is implemented. | `services/sseActivityBridge.ts`, completion controllers, schema, `app.ts`. Extract only when adding a real consumer; do not create a generic bus for aesthetics. |

No CRITICAL rating is asserted without stronger scope/impact evidence. HIGH findings are sufficient to prevent calling this production-safe.

## 4. Event flow map and classification

| Flow | Actual path | Classification and delivery limits |
|---|---|---|
| Signup / artist status | Request → parse/auth → User/Artist write → ActivityEvent insert → bus → clock logger/SSE | Event notification. Artist status payload carries state, but consumers do not maintain authoritative replicas. |
| Wallet-funded booking | Request → policy/resource checks → transaction: wallet delta, booking/payment, financial posting → activity/notifications | Relational transaction + event notification; ledger is not reconstructed from ActivityEvent. |
| Booking completion | One of three endpoints → Booking/SessionLog/delivery changes → `recordBookingCompleted` → event + circle + Weave sync | Event notification **and** direct CQRS-style projections. Weave does not consume the bus. Completion atomicity differs by endpoint. |
| Stripe booking payment | Signed event → event-ID claim → transaction: Payment, financial entries, Booking, notification → SSE/email/activity | Event-carried state transfer from external rail into local payment state; local ActivityEvent is notification only. |
| Stripe wallet top-up | Signed checkout → conditional PENDING claim → wallet delta + financial entries → notification/SSE | External event-carried state transfer plus targeted notification. No top-up ActivityEvent is emitted. |
| Refund | Signed cumulative refund → conditional refunded amount claim → Payment + reversing entries | External event-carried state transfer; no local refund ActivityEvent. |
| Rights / credits / delivery review | Authenticated command → guarded domain rows/decisions → notifications | Relational workflows, not event sourcing. Persisted decision/version rows are evidence. |
| Clock | Read Booking → time/status projection → short cache → polling UI | Read projection; clock event listener only logs. |
| Discovery / markets / tiers | Domain queries → aggregates/heuristics → UI | Read projections; currently mostly not Weave-derived. |
| SSE inbox refresh | Notification insert or ActivityEvent → process-local Response registry → browser | Ephemeral notification transport; no reconnect cursor/replay guarantee. |

No audited domain is event-sourced. Ledger entries and communication event-shaped tables do not make the overall system event-sourced.

## 5. Event versioning review and minimal standard

Current ActivityEvent has ID, free-text type, nullable artist reference, JSON payload, and creation time. Seven producer names are past-tense facts. `status.changed` is underspecified without the artist context. Payload is cast to Prisma JSON with no family-specific runtime schema; no version, producer, aggregate, or correlation metadata. Clock consumes four names; SSE consumes all seven only when artist_id exists. SSE drops event ID/time from its outgoing activity message.

**Proposed standard; documentation only, not shipped by this change:**

| Field | Smallest useful rule |
|---|---|
| `id` | Stable immutable event ID; duplicate processing uses this, not a payload hash. |
| `name`, `version` | Past-tense domain fact plus positive integer schema version. Existing unversioned ActivityEvent rows are explicitly legacy v1; unknown future versions must be rejected or quarantined, not guessed. |
| `occurred_at`, `recorded_at` | Business occurrence and persistence time distinguished. Historical `created_at` is only recorded time; do not invent a precise historical occurrence time. |
| `producer` | Stable domain/module name, not a hostname. |
| `entity` | Typed `{ type, id }`, such as Booking or Artist; studio scope supplied where applicable. Preserve artist_id compatibility when introducing this. |
| `correlation_id` | Current request ID if available; nullable for historical records. |
| `causation_id` | Source Stripe/event/command ID when useful; optional, not a new universal command infrastructure. |
| `payload` | A Zod schema per supported family/version, parsed before persistence. Additive optional fields only within a version; changed meaning requires a new version. |
| `privacy` | Explicit audience classification: owner-private, studio-scoped, or intentionally public. Classification never replaces recipient authorization. |

Keep existing names compatible; do not rename historical `session.completed` silently to booking completion. Document that it currently means Booking completion, not artist acceptance of a delivery. Its `booking_id` provides causality but not unique event idempotency. For a future publisher, write the domain fact and durable notification record in one transaction only where reliability requires it; do not introduce Kafka or event sourcing. Existing rows must remain readable through a deliberate legacy parser.

Other durable families: `StripeWebhookEvent` stores ID/type/status but no original payload/version; `Notification.payload` is unversioned; rights evidence includes method/request ID but no schema version; `SessionCompletionRequest.response` is an idempotency replay snapshot whose response compatibility needs care. CommunicationEvent payloads have a schema definition but no active producer found in this API tree.

## 6. Projection and rebuildability map

| Projection | Source | Existing regenerate path | Limit / repair semantics |
|---|---|---|---|
| Weave registry | Artist, Studio | `ensureNodeExists`, backfill | Lazy creation; no source FK/type-existence check in helper. Missing nodes can be added; wrong type/orphan cleanup not repaired. |
| Weave connection/evidence | COMPLETED Booking | `npm run db:backfill-weave --workspace=apps/api` | Additive; no stale-evidence deletion or count/date repair. Running bare root command from direction doc is not a root script. |
| Studio circle activity | COMPLETED Booking | `syncStudioCircleMembership`; route backfill | Recomputes positive count and dates; zero case returns without clearing. Consent/visibility are **authoritative user decisions**, not disposable projection fields. |
| Artist strength | Artist/passport/releases/projects/bookings | Private `recalculatePortfolioScore(artistId)` | Exists; no bulk entry point; input filters and presentation writers differ. |
| Producer strength | Producer/passport | None found | Signup/seed constants remain; do not pretend artist calculator applies. |
| Passport views | PassportView | Public route counts rows | Rebuildable count; uniqueness/day definition and hashed visitor tracking are policy inputs. |
| AI brief | Artist/passport/session logs | Generate-summary endpoint | Cache checks passport updated_at only, while generation reads other facts; writing cache changes the same updated_at, so validity needs a source fingerprint. User-edited summaries must not be treated as disposable AI output. |
| Clock | Booking/resource rows + current time | Next request after 5-second TTL | Process-local, rebuildable; correctness still depends on time/status interpretation. |
| Dashboard/market/discovery | Domain queries + business definitions | Re-query | Rebuildable, but heuristic definitions and query coverage need review. No standalone search-index owner found. |
| Wallet balance | WalletTransaction deltas | `findWalletDrift` detects mismatch | Detection only; never silently rebuild financial balances without accounting review/opening-balance semantics. |
| Finance aggregates | FinancialTransaction/entries | Query/reconciliation | Do not regenerate authoritative ledger entries from current mutable fees. |
| Inbox read state | Notification | Not disposable | Notifications may be derived messages, but read state is user-owned and must survive any content backfill. |

## 7. Node / Connection / Evidence integrity

The three concepts are separate tables. Node identity uses entity ID, not User ID. Connection uniqueness is directional Artist→Studio plus RECORDED_AT. Evidence has a Booking FK and uniqueness on connection/booking. The sync helper reads completed Booking, performs projection writes transactionally, and never touches financial tables. There is no need for a graph database.

Remaining integrity gaps: Node has no FK to its entity; no validation prevents wrong type/ID pairing in `ensureNodeExists`; evidence can legally cite a booking from the wrong pair if written outside the helper; later Booking reversal/deletion can leave stale connections/counts; per-pair evidence uniqueness alone does not enforce one connection per booking. The existing sync catches duplicate evidence inside an interactive transaction, a pattern that needs real-Postgres scrutiny rather than assuming catch restores transaction usability. The full suite's existing repeat-sync case checks only resulting counts, not all failure/rebuild modes.

Most current network pages query domain data or PassportConnection, not Weave. That is acceptable if context helps coordination and is accurately explained. Artist tiers currently violate the intended evidence distinction (A07). Do not add a graph visualization to conceal that semantic gap.

## 8. Domain state and type safety

- BookingStatus, PaymentStatus, ProjectPhase are database enums. They prevent unknown values, not forbidden transitions or concurrent overwrites.
- Booking's generic status route has no transition guard; completion controller rejects cancelled/no-show, while legacy delivery still writes session/delivery data for those states. These entry points do not share one workflow boundary.
- SessionLog has no status; its times are stored copies. The atomic append fix protects simultaneous appends, not stale editor replacement or scheduled-versus-actual-time ambiguity.
- Project phase and is_active can coexist as delivered/active: the UI uses is_active as archived state, so this is not automatically illegal. Explicit semantics are better than deleting the boolean for type purity.
- Credit response uses a conditional DRAFT update and requires the active linked contributor. That is a useful model for rights decision claims. Free-text stored statuses elsewhere remain weak.
- Delivery keeps immutable versions/reviews, but version increment is a read-then-write and different completion paths have different transaction scopes. Concurrent delivery and partial failure need focused tests.
- FinancialTransaction status is String/POSTED with no real pending/void lifecycle. WalletTopUp and webhook-processing statuses are strings. Invoice state is absent, not an undocumented workflow.
- JSON casts and `any` remain at domain/read boundaries. Prioritize typed event payloads, scoring inputs, and transition predicates; a mass branded-ID or enum migration is not warranted.

## 9. Financial boundary review

The Weave does not write money. `financialLedger.ts` is the application writer for FinancialTransaction/FinancialLedgerEntry; `walletLedger.ts` owns wallet deltas separately. Ledger posting checks balanced positive debit/credit totals and uses unique `(source_type, source_id)`. Wallet debit uses conditional balance update and writes a delta in the caller's transaction. Stripe amounts/currency are checked before successful settlement; raw signature verification precedes handlers.

Limits that matter:

- Amounts are Decimal USD major units in storage and JS numbers in services, not uniformly integer minor units. FinancialTransaction has currency; entries inherit it, while payment/wallet amounts imply USD. Studio.currency does not make this a multi-currency ledger.
- Rounding totals before checking balance is weaker than validating each line as finite, positive exact cents. For example, a positive sub-cent line can pass the number-level check but round in storage; balanced infinities also evade the simple equality test before the DB rejects them. Existing callers constrain much of this but the posting boundary is not fully defensive.
- Unique source IDs prevent duplicate rows; find-then-create is not race-safe replay semantics by itself. Existing rows are returned without checking whether replay terms differ.
- Any preexisting StripeWebhookEvent is acknowledged as a duplicate, including PROCESSING. A crash after claiming but before settlement can leave an event permanently acknowledged on retry. Handler exceptions delete the claim, which handles ordinary errors but not process death.
- Success/failure ordering, terminal payment regressions, repeated checkouts, and forced booking confirmation are A03. `checkout.session.async_payment_succeeded` is not handled. Current Checkout explicitly restricts to cards; do not widen payment methods before completing that lifecycle.
- Refund allocation uses the studio's current fee rather than the original posted split; cumulative refund deltas/rounding and fee changes require accounting-specific tests.
- Manual wallet credits are tracked by the wallet ledger; the audit did not establish a complete double-entry mirror of every wallet operation. These ledgers are separate owners with a reconciliation boundary, not interchangeable balances.

No Stripe version, payment method, pricing, wallet settlement, payout, refund, tax, or reconciliation behavior was changed in this audit. No financial SDK/API upgrade is bundled into unrelated work.

## 10. Reconciliation readiness

`reconcileFinancialLedger` already exposes account totals, unbalanced transactions, and settled payments/paid top-ups lacking a matching ledger source. `findWalletDrift` compares stored wallet balance with signed wallet history. These are real internal reconciliation checks.

They do not compare Stripe balance transactions, payouts, fees, disputes, or statements; nor do they match posted amounts to each external source, identify all orphan/duplicate economic settlements, track a review case, or resolve discrepancies. A healthy flag means these limited internal checks passed. It does not mean the external rail agrees. Account aggregation also does not group by currency; fine only while the domain is explicitly USD.

Small next accounting slice: read-only discrepancy records with source IDs, expected/observed amounts, reason and human review status. First define which rail and accounting period are in scope; no automatic repair or full reconciliation platform was built here.

## 11. Studio Clock review

Clock GET owns a cached representation, not Booking or money. Its DAW command goes through the session domain; the new atomic append strengthens that boundary. Consumers log or forward events and make no business decisions.

Representation issues remain A09: scheduled time is treated as active truth, completed/pending bookings can appear active, overtime is unreachable, days use server timezone, only one active booking is selected across a multi-room studio, and several prediction/window values are hardcoded. Show scheduled/current facts separately; do not make the clock start/finish sessions automatically to make its display look consistent.

## 12. UI business-logic review

Shared API/auth conventions hold in the sampled booking/project/dashboard paths. Booking affordability and quoting are duplicated for UX but server-side wallet/policy checks still enforce the command. This duplication warrants shared quote output, not moving authority into React. Calendar/clock rendering may calculate geometry and elapsed display time legitimately.

The concrete money-presentation defect is ProjectDetailPage's Revenue label on the sum of booking prices, not ledger revenue (A10). Passport public filtering must not mutate shared scoring truth (A06). Client status checks may hide unavailable actions but are not substitutes for server transitions. No React component render/interactivity tests were found; current web tests cover utilities/store.

Network-native UI should expose evidence only when it answers a user decision: completed work together, confirmed credit, applicable studio policy. Do not infer endorsement from a DM request, display popularity as standing, or add opaque relationship scores.

## 13. Observability review

Request IDs, access/error JSON logs, Sentry wiring, webhook IDs, ledger source references, completion idempotency keys, and rights request evidence provide useful tracing. A developer can follow a booking to its payment and Weave evidence. They cannot reliably follow one request into all ActivityEvents or know whether a post-commit projection failed and was repaired.

Smallest improvements: redact ticket/query credentials from logs; attach request ID plus event ID/entity/version to future publisher logs; include booking ID in projection failure messages; expose a read-only projection-vs-source check; preserve event IDs in future SSE envelopes without changing old message types abruptly. Avoid logging whole private event payloads. No logging platform, generic event bus, or distributed tracing infrastructure is needed for these steps.

## 14. Top three bounded changes and selected implementation

These are the top bounded implementation slices, not the severity ranking. A01/A03/A04 need dedicated design/regression work and remain higher operational risks.

| Slice | Problem / current entanglement | Truth owner / proposed separation | Files | Risk / rollback / why now |
|---|---|---|---|---|
| 1 — implemented | Concurrent note appends read then replace the same evidence string | SessionLog domain performs parameterized PostgreSQL `INSERT … ON CONFLICT … notes || line`, returning the row and respecting caller transaction | `apps/api/src/lib/sessionLog.ts`; new `apps/api/src/integration/architecture.integration.test.ts`; `scripts/run-api-integration-tests.js` | Low; arbitrary concurrent order, no lost lines. Revert helper/test/runner entry; no data rollback or migration. Prevents silent evidence loss. |
| 2 — implemented | Multipart strings are only TypeScript casts and can be arrays/overlong input | Zod parses optional trimmed folder/source (max 255) at upload boundary, preserving empty→null behavior | `apps/api/src/routes/files.routes.ts`; same integration test | Low; invalid metadata now 400. Revert validation/test cases. Matches existing direct-upload metadata bounds. |
| 3 — deferred | Passport score depends on which filtered view last wrote it | Extract one typed score/input contract; public views cannot persist a global score from private-data-filtered input; add explicit per-artist/bulk recompute | Future passport route/domain helper/backfill/tests | Medium; must decide verified-work criteria and whether public/private scores intentionally differ. Preserve old calculator as rollback before any bulk recalculation. Worth doing before using strength for decisions. |

Only slices 1 and 2 were applied. The audit and event standard are documentation, not a third runtime redesign.

## 15. Changes explicitly not worth making now

No event-sourcing conversion, Kafka, Neo4j, Postgres replacement, generic bus framework, ledger rewrite, mass schema redesign, Node/entity merge, follower graph, social feed, decorative network visualization, or automated financial repair. Do not implement the stale SINGLE_STUDIO_MODE assertion. Do not treat existing docs' historic task list as a queue. Do not upgrade Stripe or enable new payment methods in this nonfinancial patch.

## 16. Scores

Scores describe the audited system after two small fixes, not production readiness. Each score is a judgment based on the evidence above.

| Dimension | /10 | Reason |
|---|---:|---|
| Simplicity | 6 | Modest infrastructure; repeated endpoint orchestration and mixed read/write paths |
| Truth ownership clarity | 6 | Owners recognizable; score/tier/payment-state representations still conflict |
| Domain separation | 6 | Shared helpers help; notification transport and workflow entry points remain coupled |
| Event discipline | 5 | Past-tense notification model; unversioned payloads and post-commit gaps |
| Projection rebuildability | 4 | Several real recomputes; incomplete zero/deletion/drift repair |
| Weave integrity | 7 | Correct concept separation and no money writes; stale evidence/count/time gaps |
| Financial safety | 5 | Balanced ledger/conditional wallet debit; replay, lifecycle and reconciliation limitations |
| Type safety | 5 | Zod/enums in many boundaries; `any`, JSON casts and unguarded transitions remain |
| Observability | 5 | Structured request logs/source IDs; correlation gaps and query-token logging |
| UI/domain separation | 6 | Server enforces commands; price-as-revenue and shared-score writes misrepresent truth |
| Studio Clock integrity | 6 | Domain writer respected; operating-state interpretation still wrong in edge cases |
| Scalability without entanglement | 5 | Postgres can grow; process-local transport and inconsistent orchestration need focused work |

## 17. Implementation verification and handoff

Verification results are recorded after execution below. No migration or domain backfill was created. SessionLog and ArtistFile remain the same authoritative owners. Event payloads/names/storage are unchanged. Financial behavior is untouched. The original append bug is demonstrated by running the regression with the old implementation; malformed upload tests likewise distinguish a validation error from a runtime 500.

Remaining implementation limits: this patch does not provide append request idempotency, editor optimistic concurrency, legacy lost-note recovery, or cleanup of multer files created before a rejected request. Explicit note replacement remains intentional. Tests use a disposable local database and local file storage, not live R2 or payment rails.

Recommended next safety slice: tenant-scoped notification recipients with two-studio SSE tests, then a separate booking/payment transition review. Recommended next projection slice: the single passport score input contract, followed by genuinely repairing Weave counts/dates/evidence. Do not silently combine these into a broad refactor.
