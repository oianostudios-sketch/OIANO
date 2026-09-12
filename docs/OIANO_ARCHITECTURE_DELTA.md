# OIANO — architecture delta

Where the repository stands against the [frozen architecture](OIANO_FROZEN_ARCHITECTURE.md).
Measured at `1abe9f4` on 2026-09-12. Read-only: no code was changed to produce it.

`schema:N` is `prisma/schema.prisma`. Unprefixed paths are under `apps/api/src`;
`web/` paths are under `apps/web/src`. A-numbers are findings from the
[architecture audit](ARCHITECTURE_AUDIT_2026_09_06.md), each re-checked against
current code before being cited.

---

## 1. Model classification

58 models: **30 KEEP · 21 EVOLVE · 5 MERGE · 2 REMOVE-DE-EMPHASIZE.**

### Account and identity

| Model | Class | Maps to | Why |
|---|---|---|---|
| User | EVOLVE | User (auth only) | Also holds the global role, locale and active studio |
| Artist | EVOLVE | Person + CreativeProfile | Identity, bio and presence fused into a role table |
| Producer | EVOLVE | Person + CreativeProfile | Same, with disciplines stored as JSON |
| Engineer | MERGE | Person + CreativeProfile + OrganizationMembership | One studio and a unique user: cannot work for two studios |
| ArtistPassport | EVOLVE | Passport projection | Stores a completeness score as state |
| ProducerPassport | MERGE | Passport projection | Duplicates ArtistPassport; its score is never recomputed |
| PassportView | KEEP | Passport projection input | Deduplicated daily view record |
| ArtistRelease | EVOLVE | Work (released), claimed not evidenced | Self-declared; collaborators are free text |
| AdminAuditLog | KEEP | none | Operator audit trail |

### Organization and space

| Model | Class | Maps to | Why |
|---|---|---|---|
| Studio | EVOLVE | Organization with a CreativeSpace location | Business and place attributes on one row |
| StudioStaff | EVOLVE | OrganizationMembership | Already multi-studio, with position and capabilities |
| StudioStaffInvitation | KEEP | Organization invitation | Hashed, expiring, single-use |
| Room | EVOLVE | CreativeSpace | The bookable space |
| Equipment | KEEP | CreativeSpace resource | Physical inventory |
| MaintenanceIssue | KEEP | CreativeSpace operations | Facility issue lifecycle |
| ServiceOffering | KEEP | Organization offering | Supply side; not a Requirement |
| AvailabilitySlot | KEEP | CreativeSpace and Presence availability | Room and engineer time |
| StudioPolicy | KEEP | Agreement (standing terms) | Versioned studio operating terms |
| PolicyException | KEEP | Agreement (standing terms) | Approved deviation from a policy |
| StudioAnnouncement | KEEP | none | Studio broadcast notice |
| StudioCircleMember | KEEP | Connection projection (studio and artist, consented) | Consent is authoritative; counts are derived |

### Work, sessions and delivery

| Model | Class | Maps to | Why |
|---|---|---|---|
| Project | EVOLVE | Work | Requires a producer; role columns on the work |
| ProjectParticipant | EVOLVE | Contribution | Points at a User id or email, not an identity |
| ProjectMessage | MERGE | CommunicationEvent | Schema already plans the merge (schema:1115–1116) |
| Booking | KEEP | Booking, bridged to Work | Today's economic anchor |
| SessionLog | EVOLVE | WorkEvent | Cannot exist without a booking |
| SessionCompletionRequest | KEEP | none | Completion idempotency record |
| Deliverable | EVOLVE | Deliverable | Right shape; hangs off Booking, not Work |
| DeliverableVersion | KEEP | Version | Immutable versions already exist |
| DeliverableReview | KEEP | Deliverable decision | Immutable review record |
| ArtistFile | EVOLVE | Files on Work, WorkEvent or Deliverable | Owned by the artist, linked to no work |
| Track | REMOVE-DE-EMPHASIZE | none | Preview-only catalogue; price and licence unused (schema:856–857) |

### Money

| Model | Class | Maps to | Why |
|---|---|---|---|
| Payment | EVOLVE | Payment settling an Economic Obligation | One per booking; cannot express deposit and balance |
| Wallet | KEEP | none (prepaid credit) | Artists only |
| WalletTransaction | KEEP | none (wallet ledger) | Signed wallet history |
| WalletTopUp | KEEP | Payment into a wallet | Stripe-funded credit |
| FinancialTransaction | KEEP | Ledger for Payment and Settlement | `source_type`/`source_id` already name what is settled |
| FinancialLedgerEntry | KEEP | Ledger for Payment and Settlement | Balanced double-entry lines |
| StudioPayout | EVOLVE | Settlement | Money leaving OIANO |
| StripeWebhookEvent | KEEP | none | Webhook replay guard |

### Rights, credit and consent

| Model | Class | Maps to | Why |
|---|---|---|---|
| RightsAgreement | EVOLVE | Agreement | Scoped to Project, not Work |
| RightsShare | EVOLVE | Agreement term or Economic Obligation | Holder references are untyped |
| RightsDecision | KEEP | Agreement decision | Per-holder decision with evidence |
| PromotionalConsent | KEEP | Agreement (consent) | Purpose, channels, expiry |
| ProjectCredit | EVOLVE | Credit | Confirmed by the credited person; attach to Contribution |

### Evidence, network and memory

| Model | Class | Maps to | Why |
|---|---|---|---|
| WeaveNode | EVOLVE | Weave v2 node | Keyed to Artist or Studio id, not an identity |
| WeaveConnection | EVOLVE | Connection | Counts and dates cannot be repaired (A08) |
| WeaveEvidence | EVOLVE | Evidence | Booking is its only provenance |
| PassportConnection | REMOVE-DE-EMPHASIZE | none (message request) | Keep for messaging; remove from standing (A07) |
| ActivityEvent | KEEP | Memory (event record, not Evidence) | Notification log, not proof |

### Communication and operations

| Model | Class | Maps to | Why |
|---|---|---|---|
| Notification | KEEP | none (inbox) | Dated history, not NOW |
| BookingMessage | MERGE | CommunicationEvent | One of three message tables |
| ConnectMessage | MERGE | CommunicationEvent | One of three message tables |
| CommunicationThread | KEEP | none (dormant) | No writer found (architecture audit §5) |
| CommunicationParticipant | KEEP | none (dormant) | Part of the dormant thread model |
| CommunicationEvent | KEEP | none (dormant) | Merge target for the message tables |
| Feedback | KEEP | none | Tester reports |
| CreatorInvitation | KEEP | Invitation (attribution only) | Grants no project, studio or relationship access |

### Frozen concepts without a single current source

| Frozen concept | Current source |
|---|---|
| Person | None; `User` must stay authentication only |
| Requirement | None |
| Economic Obligation | None; obligations are implicit in `Booking.total_usd` and `RightsShare` |
| CreativeProfile | Scattered across Artist, Producer and Engineer |
| Discipline | `Producer.disciplines` JSON and `Engineer.specialties` |
| Presence | `Artist.status` only |

---

## 2. Contradiction matrix

**Decided since this was measured.** The [owner decisions of 2026-09-12](OIANO_FROZEN_ARCHITECTURE.md) settle the currency row (decision 1), the single-studio engineer and producer-only project rows (decisions 2 and 3), the missing Agreement step (decision 4) and the architecture audit §15 row (decision 5). The rows below still describe the code as measured.

Ordered by law. No contradiction found for **9** (`ProjectCredit` is confirmed by the credited person; proof is separate), **15** (the AI brief is artist-editable, `routes/passport.routes.ts:471–474`, and not rendered by `web/pages/PublicPassportPage.tsx`) or **16** (no surface tables; `lib/creatorContext.ts` only reads).

| Current reality | Law | Decision | Why |
|---|---|---|---|
| One global `User.role` gates every API route and page (schema:140; middleware/auth.middleware.ts:22,29; web/App.tsx:66) | 2 | COMPATIBILITY BRIDGE | Keep it as account type while contextual roles move to Contribution and OrganizationMembership |
| `User` also carries locale and the active studio (schema:143,149) | User = auth only | COMPATIBILITY BRIDGE | Move to Person and OrganizationMembership; drop only after every reader has moved |
| Artist, Producer and Engineer are separate identity tables, and one user can hold all three (schema:141,147,148) | 2, 7 | BLUEPRINT CORRECT | One person's history splits across three tables; identity must be persistent and singular |
| Engineer has one required studio and a unique user link (schema:344,351); staff membership is multi-studio (schema:245) | 4 | BLUEPRINT CORRECT | A freelance engineer cannot be bookable at a second studio |
| Discipline exists only for producers, as JSON (schema:829–830); engineers use free-text specialties (schema:354); artists have none | 3 | COMPATIBILITY BRIDGE | Two incompatible shapes; one Discipline table backfilled from both |
| `Studio` holds a Stripe account and platform fee beside address and amenities (schema:200–207) | 4 | COMPATIBILITY BRIDGE | Studio becomes the Organization with a CreativeSpace location; Room is already the space |
| Only a producer can create a project (routes/producer.routes.ts:366), and every project requires one (schema:882) | 1, 7 | BLUEPRINT CORRECT | An artist cannot start work alone, so the Golden Journey's first step has no path |
| `Project` carries the role columns `producer_id` and `artist_id` (schema:882,884) | Migration principles | COMPATIBILITY BRIDGE | Backfill both as Contributions; stop reading the columns before dropping them |
| Payment, Deliverable and Weave evidence all require a Booking (schema:675,723,1337) | 1, 5 | COMPATIBILITY BRIDGE | Booking anchors money today; the Booking bridge links it to Work without rewriting history |
| `SessionLog` exists only one-to-one with a Booking (schema:766) | 6 | COMPATIBILITY BRIDGE | Work done outside a booked room has nowhere to be recorded; WorkEvent generalises it |
| Contributions point at a User id, or are claimed by matching email (routes/contributions.routes.ts:19,149) | 7 | BLUEPRINT CORRECT | A contribution must connect an identity, not a login or an address |
| Deliverables already have immutable versions and reviews (schema:673–719) | Migration steps 13–14 | REPO CORRECT | The blueprint schedules these as new; they exist, so re-parent them to Work rather than rebuild |
| One payment per booking (schema:723) | 8 | COMPATIBILITY BRIDGE | A deposit and a balance cannot be two payments; each needs an obligation the ledger source can cite |
| Studios declare a currency (Dreamz is seeded EUR, prisma/seed.ts:21), but amounts are stored and verified only as USD (schema:728; routes/webhooks.routes.ts:89) | 8 | BLUEPRINT CORRECT | A payment cannot explain value in a currency it never records |
| Rights agreements, consents and studio policies exist (schema:603,919,1007), but the migration order has no Agreement step | Migration order | DEFER | Agreement needs a step, plausibly beside Economic Obligation (15); until then these stay on Project |
| Evidence comes only from completed bookings (schema:1337); confirmed credits and approved deliverables produce none | 10, 12 | DEFER | Evidence (step 18) adds sources; do not add columns to WeaveEvidence before Work exists |
| Weave nodes are keyed to Artist and Studio ids by design (schema:1256–1261) | 2, 12 | COMPATIBILITY BRIDGE | Key Weave v2 to CreativeProfile under a Person: profiles stay distinct, identity becomes persistent |
| Artist tier counts connection requests of any status, and ratings the artist gave engineers (lib/artistTier.ts:59,62–67) | 11, 12 | BLUEPRINT CORRECT | Unaccepted messages and ratings of other people are not evidence of the artist's standing (A07) |
| Passport stores a completeness score; signup writes constants and only artists can be recomputed (controllers/auth.controller.ts:150,176,285; routes/passport.routes.ts:94–104) | 11 | BLUEPRINT CORRECT | A stored number with no source to rebuild from is manufactured, not projected |
| Discovery ranks creators by genre overlap, then by that completeness score (routes/discover.routes.ts:83–85); no Requirement exists | 11, 13 | BLUEPRINT CORRECT | Completeness is not credibility, and SKY needs real requirements to rank against |
| Artists declare themselves IN_SESSION (routes/artists.routes.ts:17) | 11 | COMPATIBILITY BRIDGE | Being in session is a fact a WorkEvent can establish; keep the toggle for availability only |
| Communications decides what needs action from notification type (web/pages/CommunicationsPage.tsx:17,20) | 14 | BLUEPRINT CORRECT | A resolved decision still reads "Action required"; NOW must read pending state, as creatorContext does |
| Artist files belong to the artist, and deliverable files are bare URLs (schema:542,698) | Golden Journey | COMPATIBILITY BRIDGE | Two unlinked file records; both must attach to Work context before Mix 01 can exist |
| Three invitation kinds grant different things (schema:250,1383; routes/producer.routes.ts:226) | Migration step 10 | DEFER | Keep them separate until Work exists; merging now blurs what acceptance grants |
| The architecture audit rules out "mass schema redesign" and "Node/entity merge" (ARCHITECTURE_AUDIT_2026_09_06.md §15) | Governance | BLUEPRINT CORRECT | Recorded, not reconciled: the frozen architecture governs this migration, staged as a strangler |

---

## 3. Migration risks

| Risk | Evidence | What must be tested before migrating |
|---|---|---|
| A status write ignores the current status, and completing twice repeats completion effects | controllers/bookings.controller.ts:505–513 (A02) | Illegal transitions are rejected; a second completion emits no second fact or evidence row |
| Payment success re-confirms a cancelled booking | routes/webhooks.routes.ts:112 (A03) | A paid webhook for a cancelled booking records the payment and leaves the booking cancelled |
| Booking and presence updates broadcast to every connected client, across studios | controllers/bookings.controller.ts:546; routes/admin.routes.ts:382,437; routes/artists.routes.ts:32 (A01) | With two studios connected, studio B receives nothing about studio A |
| Weave counts only grow, and dates move to whichever booking synced last | lib/weave/sync.ts:70,76,85 (A08) | Re-syncing an older booking leaves `last_activity_at` unchanged; a second backfill changes nothing |
| Contributions reference User ids and emails, not identities | routes/contributions.routes.ts:19,149; routes/producer.routes.ts:226 | Backfill maps each participant to exactly one Person; unmatched emails stay unclaimed |
| One user can hold Artist, Producer and Engineer rows, and Weave nodes reuse those ids | schema:141,147,148,1276 | One Person per User; every existing WeaveNode id still resolves after CreativeProfile lands |
| Engineer's single studio contradicts multi-studio staff membership | schema:245,344,351 | Merging Engineer and StudioStaff for one user keeps every studio relationship |
| Money is USD in Decimal major units while studios can declare another currency | schema:197,728; prisma/seed.ts:21; routes/webhooks.routes.ts:89 | Historical amounts migrate unchanged as USD; no backfill relabels a currency |
| Statuses are free text, so the database never rejected an illegal value | schema:259,678,926,980,1036,1055,1389 | Backfill validates each status against a closed set and reports unknown values instead of coercing them |
| 20 `prisma as any` casts hide schema changes from the type checker | routes/connect.routes.ts (13), routes/admin.routes.ts (4), controllers/bookings.controller.ts:531, controllers/bookings/complete-session.controller.ts, routes/producer.routes.ts | None remain in any file a migration step touches (stabilization Session 2) |
