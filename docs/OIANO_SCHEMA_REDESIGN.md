# OIANO — canonical schema redesign

> **Design for review.** No migration has been written and no database has been changed.
>
> Governed by the [frozen architecture](OIANO_FROZEN_ARCHITECTURE.md) and its owner
> decisions of 2026-09-12. Built on the [architecture delta](OIANO_ARCHITECTURE_DELTA.md),
> measured at `1abe9f4`. Implementation waits for the stabilization gate (Sessions 3–5 in
> [implementation status](OIANO_IMPLEMENTATION_STATUS.md)), and every step ships on its
> own branch, merging only after its migration is applied to the database it runs against.

---

## 1. What changes

| Today | Target | Why |
|---|---|---|
| `User` carries role, locale and active studio | `User` is login only; `Person` is identity | Law 2; User = auth only |
| Artist, Producer and Engineer are separate identity tables | One Person with one or more CreativeProfiles | One history per person |
| An engineer belongs to exactly one studio | OrganizationMembership, accepted by the person, any number | Decision 2 |
| Studio is business and place at once | Organizations own CreativeSpaces, and so can a person | Law 4; decision 2 |
| Only producers create projects, and every project needs one | Anyone creates Work; leads are Contributions | Decision 3; law 7 |
| Participants are User ids, or claimed by matching email | Contributions point at a Person, claimed only by accepting an invitation | Law 7 |
| No Requirement | Requirement, filled by a Contribution or a Booking | Law 13 |
| Rights, consent and studio policy are separate models | Agreement with parties, decisions and typed terms | Decision 4 |
| Decimal USD everywhere; one payment per booking | Integer minor units and ISO 4217 on every amount; obligations settled through chosen media | Decision 1; law 8 |
| A session record needs a booking | WorkEvent, bridged to a booking when there is one | Law 6 |
| Files belong to the artist; deliverable files are bare URLs | One Asset table attached to Work, WorkEvent or a deliverable version | Golden Journey |
| Evidence only from bookings; Weave counts incremented | Evidence with provenance from several sources; Weave recomputed from it | Laws 10 and 12 |

---

## 2. Reuse ids on backfill

This is the technique that keeps the migration safe. **A canonical row backfilled from a
legacy row takes the legacy row's id**; new canonical rows get fresh ids. Every legacy id
is a UUID v4, so ids from different tables do not collide in practice, but each backfill
still checks for a collision and aborts rather than assuming.

The payoff is that existing foreign keys already point at the right canonical row:

| Legacy row | Canonical row, same id | References that stay valid without rewriting |
|---|---|---|
| Artist, Producer, Engineer | CreativeProfile | every `WeaveNode.id` of type ARTIST |
| Studio | Organization | every `studio_id`; `WeaveNode.id` of type STUDIO |
| Room | CreativeSpace | `Booking.room_id`, `AvailabilitySlot.room_id` |
| StudioStaff | OrganizationMembership | — |
| Project | Work | `Booking.project_id`, `ProjectCredit.project_id` |
| ProjectParticipant | Contribution | `ProjectCredit.participant_id` |
| RightsAgreement, PromotionalConsent, StudioPolicy | Agreement | `RightsDecision.agreement_id`, `PolicyException.policy_id` |
| RightsDecision | AgreementParty | — |
| RightsShare | AgreementShare | — |
| Booking | WorkEvent | `SessionLog.booking_id`, `Deliverable.booking_id` |
| ArtistFile | Asset | — |
| ProjectCredit | Credit | — |
| WeaveEvidence | Evidence | — |

Two things do **not** reuse ids. **Person** gets its own id and a nullable unique
`user_id`, because an identity can exist before anyone claims it. The Contributions
synthesized from `Project.producer_id` and `Project.artist_id` get new ids.

This also settles delta risk 6: once CreativeProfile lands, every existing WeaveNode id
still resolves, because it is the profile's id.

---

## 3. Target models

Prisma sketches showing the fields that carry meaning; timestamps, indexes and relation
back-references are omitted. **Every status is a database enum**, which ends delta risk 9.
Where a row has two possible owners (`owner_organization_id` / `owner_person_id` and
similar pairs), the migration adds a check constraint in raw SQL that exactly one is set,
because Prisma cannot express it.

### 3.1 Identity — steps 1 to 3

```prisma
model Person {
  id                     String   @id @default(uuid())
  user_id                String?  @unique  // null until claimed through an accepted invitation
  display_name           String
  primary_locale         String?           // BCP 47; moves off User.locale
  active_organization_id String?           // moves off User.active_studio_id
  profiles               CreativeProfile[]
  disciplines            PersonDiscipline[]
  memberships            OrganizationMembership[]
  contributions          Contribution[]
}

model CreativeProfile {
  id            String  @id @default(uuid())  // backfilled from Artist.id, Producer.id, Engineer.id
  person_id     String
  handle        String  @unique               // public slug
  display_name  String                        // stage or professional name
  bio           String?
  avatar_url    String?
  city          String?
  city_public   Boolean @default(false)       // private by default, as location is today
  availability  ProfileAvailability @default(AVAILABLE)  // AVAILABLE | UNAVAILABLE
  open_to_work  Boolean @default(true)
}

model Discipline {
  code    String @id   // seeded from apps/web/src/lib/creativeDisciplines.ts
  label   String
  family  String       // MUSIC | VISUAL | FILM | WRITING | ...
}

model PersonDiscipline {
  person_id        String
  discipline_code  String
  is_primary       Boolean @default(false)
  @@id([person_id, discipline_code])
}
```

A discipline is what a person says they do. What they did on a particular Work is a
Contribution role, and only Contributions and Evidence become proof (law 3). "In session"
is no longer something a profile declares: it is derived from an underway WorkEvent.

### 3.2 Organizations, spaces, offerings and membership — step 4

```prisma
model Organization {
  id                String  @id @default(uuid())  // backfilled from Studio.id
  kind              OrganizationKind              // STUDIO | LABEL | COLLECTIVE | AGENCY | OTHER
  slug              String  @unique
  name              String
  timezone          String
  default_currency  String                        // ISO 4217, chosen by the organization
  platform_fee_bps  Int
  accepted_media    AcceptedPaymentMedium[]
  spaces            CreativeSpace[]
  memberships       OrganizationMembership[]
}

model AcceptedPaymentMedium {
  id               String        @id @default(uuid())
  organization_id  String?
  person_id        String?       // independent professionals get paid too
  medium           PaymentMedium // CARD | BANK_TRANSFER | MOBILE_MONEY | CASH | OIANO_WALLET
  provider         String        // "stripe", "paystack", "mtn_momo", "manual" — validated against a provider registry in code
  currencies       String[]      // what this medium can charge and settle in
  payout_account   String?       // rail-side account reference; replaces Studio.stripe_account_id
  is_active        Boolean       @default(true)
}

model CreativeSpace {
  id                     String  @id @default(uuid())  // backfilled from Room.id
  owner_organization_id  String?
  owner_person_id        String?  // a producer's own room needs no studio
  name                   String
  kind                   SpaceKind  // RECORDING_ROOM | VOCAL_BOOTH | MIX_ROOM | REHEARSAL | PHOTO | OTHER
  city                   String?
  address                String?     // private unless the owner publishes it
  timezone               String
  capacity               Int?
}

model OrganizationMembership {
  id               String  @id @default(uuid())  // backfilled from StudioStaff.id
  organization_id  String
  person_id        String
  role             String            // OWNER | MANAGER | ENGINEER | RESIDENT_PRODUCER — validated in code
  capabilities     String[]
  status           MembershipStatus  // INVITED | ACTIVE | ENDED | UNCLAIMED
  accepted_at      DateTime?         // set only by the person
  ended_at         DateTime?
  @@unique([organization_id, person_id, role])
}
```

`ServiceOffering` is **evolved in place** rather than renamed (the migration principles
forbid a rename for a better name): it gains an optional `owner_person_id`, `price_minor`
and `currency`, and `min_price_usd` / `max_price_usd` retire. Each offering has its own
currency; the organization's `default_currency` only pre-fills new ones. An offering can
be booked only through a medium whose `currencies` include the offering's currency.

A membership is ACTIVE only once the person accepts it (decision 2). **UNCLAIMED** exists
for one legacy case: an engineer a studio created without a login, such as a freelancer
on the rota. The studio can still schedule them, but the membership is not shown as the
person's affiliation, and it becomes ACTIVE only when they claim and accept it.

### 3.3 Work, contributions and requirements — steps 5 to 7

```prisma
model Work {
  id                    String         @id @default(uuid())  // backfilled from Project.id
  title                 String
  kind                  String         // SONG | EP | ALBUM | MIX | MUSIC_VIDEO | SHOOT — validated in code
  state                 WorkState      // FORMING | LIVING | SETTLED
  phase                 String?        // discipline-specific progress; ProjectPhase values carry over
  visibility            WorkVisibility // PRIVATE | CONTRIBUTORS | PUBLIC
  created_by_person_id  String
  archived_at           DateTime?      // replaces Project.is_active = false
  contributions         Contribution[]
  requirements          Requirement[]
}

model Contribution {
  id                     String  @id @default(uuid())  // backfilled from ProjectParticipant.id
  work_id                String
  person_id              String?   // null until an invitation is accepted; never matched by email
  creative_profile_id    String?   // the name this contribution is credited under
  role                   String    // this Work's role: LEAD_ARTIST | PRODUCER | ENGINEER | MIXER ...
  discipline_code        String?
  is_lead                Boolean   @default(false)  // may administer the Work
  status                 ContributionStatus  // PROPOSED | ACCEPTED | DECLINED | WITHDRAWN | COMPLETED | REMOVED
  proposed_by_person_id  String
  invited_email          String?   // where an unclaimed invitation was sent; not an identity
  accepted_at            DateTime?
  completed_at           DateTime?
}

model Requirement {
  id                         String  @id @default(uuid())
  work_id                    String
  kind                       RequirementKind        // CONTRIBUTOR | SPACE | SERVICE
  role                       String?
  discipline_code            String?
  description                String
  status                     RequirementStatus      // OPEN | FILLED | CANCELLED
  visibility                 RequirementVisibility  // PRIVATE | NETWORK | PUBLIC — SKY reads NETWORK and PUBLIC
  budget_min_minor           BigInt?
  budget_max_minor           BigInt?
  budget_currency            String?
  remote_ok                  Boolean @default(false)
  needed_by                  DateTime?
  filled_by_contribution_id  String?  @unique
  filled_by_booking_id       String?  @unique
}
```

**Creating a Work creates its first Contribution in the same transaction**: the creator,
ACCEPTED, as lead. That is what lets Joseph start BAD HABITS alone. Notifications and
permissions that today go to `project.producer.user_id` go to the Work's leads instead.
Until Work-specific invitations (step 11) carry tokens, the contribution inbox keeps
today's email match as a compatibility read; it is removed when they do.

**Backfilling a Project preserves today's permissions.** It creates a Work with the
project's id, an ACCEPTED PRODUCER contribution marked lead for `producer_id`, an
ACCEPTED LEAD_ARTIST contribution (not a lead) for `artist_id` when set, and a
Contribution for each ProjectParticipant with that participant's id. Migration never
widens anyone's permissions; making an artist a lead on an existing project is a
deliberate act afterwards.

### 3.4 Agreement — step 8

```prisma
model Agreement {
  id                     String  @id @default(uuid())  // backfilled from RightsAgreement, PromotionalConsent, StudioPolicy
  work_id                String?
  organization_id        String?   // standing terms, such as studio policies
  kind                   AgreementKind    // MASTER_SPLIT | PUBLISHING_SPLIT | CONTRIBUTION_TERMS | SERVICE_TERMS | PROMOTIONAL_CONSENT | STANDING_TERMS
  title                  String
  status                 AgreementStatus  // DRAFT | PROPOSED | ACCEPTED | DISPUTED | WITHDRAWN | SUPERSEDED | EXPIRED
  version                Int      @default(1)
  supersedes_id          String?
  terms                  Json     // parsed by a Zod schema per kind and version before every write
  proposed_by_person_id  String?
  effective_at           DateTime?
  expires_at             DateTime?
  parties                AgreementParty[]
  shares                 AgreementShare[]
}

model AgreementParty {
  id               String  @id @default(uuid())  // backfilled from RightsDecision.id
  agreement_id     String
  person_id        String?
  organization_id  String?
  contribution_id  String?        // the capacity in which a person is a party
  party_role       String         // HOLDER | PAYER | PAYEE | GRANTOR | GRANTEE
  decision         PartyDecision  // PENDING | ACCEPTED | DISPUTED
  decided_at       DateTime?
  evidence         Json?          // how the decision was made, as RightsDecision records it today
}

model AgreementShare {
  id            String @id @default(uuid())  // backfilled from RightsShare.id
  agreement_id  String
  party_id      String
  basis_points  Int     // exact: 10000 is 100%; replaces Decimal(5,2) percentages
}
```

A party's decision is written with the conditional claim ProjectCredit already uses: the
update succeeds only from PENDING. That also closes A04, where two concurrent decisions
could both win. Shares must total exactly 10000, enforced on write. Economic Obligations
are created from accepted terms, never from a proposal.

**StudioPolicy moves last within this step**, because `evaluateStudioPolicies` reads its
shape directly: the policy engine first reads Agreement through a compatibility adapter,
and only after that do writes move.

### 3.5 Money — decision 1, carried through steps 4, 12, 16 and 17

**Rules for every amount**

- Stored as `amount_minor BigInt` plus `currency String` (ISO 4217). How many minor units a
  currency has comes from one shared registry (JPY 0, USD 2, KWD 3), validated at every
  money boundary.
- Arithmetic is integer arithmetic on minor units. No floats and no rounding inside
  services; a platform fee is rounded once, at allocation, with any remainder assigned
  deterministically.
- A ledger transaction is in exactly one currency. Balances are computed per account, owner
  **and currency**, never across currencies.
- There is no automatic conversion. When a rail settles in a different currency from the
  obligation, the conversion is recorded (rate, source, time) and posted as two linked
  transactions through an FX clearing account. That is deferred until the first real case.
- Prisma returns `BigInt` as a JavaScript `bigint`, which `JSON.stringify` rejects.
  Serialize it once, in an Express JSON replacer, as a decimal string, and never with
  `Number()` inside route handlers.

```prisma
model EconomicObligation {
  id                        String  @id @default(uuid())
  work_id                   String?
  agreement_id              String?   // the accepted terms that created it
  booking_id                String?   // a booking's price, through the Booking bridge
  debtor_person_id          String?
  debtor_organization_id    String?
  creditor_person_id        String?
  creditor_organization_id  String?
  amount_minor              BigInt
  currency                  String
  settled_minor             BigInt    @default(0)
  due_at                    DateTime?
  status                    ObligationStatus  // OPEN | PARTIALLY_SETTLED | SETTLED | CANCELLED
}

model Settlement {
  id                     String  @id @default(uuid())
  obligation_id          String
  direction              SettlementDirection  // INBOUND | OUTBOUND
  medium                 PaymentMedium
  provider               String
  provider_ref           String?
  amount_minor           BigInt
  currency               String
  status                 SettlementStatus     // PENDING | SUCCEEDED | FAILED | REVERSED
  ledger_transaction_id  String?  @unique     // the posting that records it
  settled_at             DateTime?
}
```

**Existing money models evolve in place:**

| Model | Change |
|---|---|
| Payment | Gains `amount_minor`, `currency` and `medium`. Its unique `booking_id` is dropped only at contract, because code treats `booking.payment` as one-to-one; after that a deposit and a balance can be two payments, each a Settlement of an obligation |
| StudioPayout | Gains `amount_minor`; its currency comes from the payable it pays, never from `Studio.currency` |
| Wallet | Owned by a Person, one per currency, with `balance_minor` |
| WalletTransaction | Gains `amount_minor` |
| FinancialTransaction | `currency` required on every new posting, with no default |
| FinancialLedgerEntry | Gains `amount_minor`, dual-written beside `amount_usd` until every reader has moved |
| ServiceOffering | Gains an optional person owner, `price_minor` and `currency` |
| Booking | Gains `currency`, `total_minor`, `work_id` and its obligation (step 12) |

Historical rows backfill as USD with `amount_minor` equal to `amount_usd × 100`, exactly.
Nothing relabels a currency.

> **A defect found while designing this, present in the code today.** Booking payments
> post to the ledger as USD (`apps/api/src/lib/financialLedger.ts:30`), but a payout sums
> the studio's payable with no regard to currency (`apps/api/src/lib/studioPayout.ts:14–27`)
> and transfers it in `Studio.currency` (`studioPayout.ts:60`;
> `apps/api/src/routes/payouts.routes.ts:110–113`). A studio configured in EUR that is
> owed $100.00 would be sent €100.00. It is latent while payouts are off, and it must be
> fixed before any studio with a non-USD currency takes a payout, without waiting for
> this migration.

### 3.6 Sessions, delivery and files — steps 12 to 15

**Booking bridge (step 12).** Booking gains `work_id` (backfilled from `project_id`, which
is already a Work id), `currency`, `total_minor` and its EconomicObligation. The engineer
assignment becomes a Contribution on the Work, or an OrganizationMembership where there is
no Work. Booking keeps authority over the reservation and its schedule.

**WorkEvent (step 13).**

```prisma
model WorkEvent {
  id               String   @id @default(uuid())  // backfilled from Booking.id for booked sessions
  work_id          String?
  booking_id       String?  @unique
  space_id         String?
  kind             String   // RECORDING | MIXING | MASTERING | REHEARSAL | SHOOT | REMOTE_SESSION — validated in code
  scheduled_start  DateTime
  scheduled_end    DateTime
  actual_start     DateTime?
  actual_end       DateTime?
  status           WorkEventStatus  // SCHEDULED | UNDERWAY | COMPLETED | CANCELLED | NO_SHOW
}
```

SessionLog's notes, ratings and tracks move onto it under the same id. A remote session
with no booking is a WorkEvent without a `booking_id`. Scheduled and actual times are
separate columns, which ends the ambiguity the architecture audit recorded (A13).

**Deliverable and Version (steps 14 and 15)** are kept, as the delta found (its one REPO
CORRECT row): Deliverable gains `work_id` and an optional `work_event_id`, and its
`booking_id` becomes optional. They are re-parented, not rebuilt.

**Assets.** One `Asset` table, backfilled from ArtistFile under the same ids, with an
owner Person and optional `work_id`, `work_event_id` and `deliverable_version_id`.
`DeliverableVersion.file_urls` becomes Asset rows. That ends the folder-name matching
`apps/api/src/routes/artist-projects.routes.ts:50` uses today to guess which files belong
to a project.

### 3.7 Credit, evidence, Weave and Passport — steps 18 to 21

**Credit (step 18).** Backfilled from ProjectCredit under the same ids, with
`contribution_id` required, so every credit belongs to someone's participation.

**Evidence (step 19).**

```prisma
model Evidence {
  id                           String  @id @default(uuid())  // backfilled from WeaveEvidence.id
  kind                         EvidenceKind  // COMPLETED_WORK_EVENT | CONFIRMED_CREDIT | ACCEPTED_AGREEMENT | APPROVED_DELIVERABLE | SETTLED_OBLIGATION
  subject_profile_id           String?
  subject_organization_id      String?
  counterpart_profile_id       String?
  counterpart_organization_id  String?
  work_event_id                String?
  credit_id                    String?
  agreement_id                 String?
  deliverable_review_id        String?
  settlement_id                String?
  confirmed_by_person_id       String?
  method                       String    // how it was confirmed
  occurred_at                  DateTime  // when it happened, not when it was recorded
}
```

Exactly one subject and exactly one source column are set, by check constraint.

**Weave v2 (step 20).** Nodes are CreativeProfiles and Organizations, under the same ids as
today's nodes. Connection counts and dates are recomputed from Evidence, never incremented,
so A08 cannot recur.

**Passport (step 21).** A projection over CreativeProfile and Evidence. `profile_strength`
stops being a stored column: completeness is computed on read and shown only to the owner.

---

## 4. The Golden Journey, traced through the target

| Journey | Target records | Step |
|---|---|---|
| Joseph says "I want to make a song" | Person, CreativeProfile | 1–2 |
| BAD HABITS Work is created | Work FORMING, created by Joseph | 5 |
| An Artist Contribution exists | Contribution LEAD_ARTIST, ACCEPTED, lead | 6 |
| A Producer Requirement opens | Requirement CONTRIBUTOR, role PRODUCER, OPEN | 7 |
| Malik is proposed and accepts | Contribution PROPOSED to ACCEPTED; Requirement FILLED; Agreement CONTRIBUTION_TERMS | 6–8 |
| A studio is selected and booked | Organization, CreativeSpace, ServiceOffering in its own currency, Booking linked to the Work | 4, 12 |
| The recording happens | WorkEvent RECORDING, UNDERWAY then COMPLETED | 13 |
| Files attach to the work | Asset on the Work, WorkEvent or DeliverableVersion | 14–15 |
| Mix 01, Mix 02, Master | Deliverable, DeliverableVersion, DeliverableReview | 14–15 |
| Producer and studio obligations settle | EconomicObligation to Settlement, in the chosen currency and medium | 16–17 |
| Credits confirm | Credit CONFIRMED, tied to its Contribution | 18 |
| Contributions confirm | Contribution COMPLETED | 6 |
| Evidence is created with provenance | Evidence of each kind above | 19 |
| Passport projections update | Passport over CreativeProfile and Evidence | 21 |
| Weave relationships strengthen | WeaveConnection recomputed from Evidence | 20 |
| Evidence influences future discovery | SKY ranks Requirement candidates by Evidence | 10 |

**No step depends on a producer existing, on a studio employing anyone, or on USD.**

---

## 5. How every step ships

| Stage | What happens | Done when |
|---|---|---|
| Expand | The migration adds tables and nullable bridge columns only | It applies to a copy of production without errors or long-held locks |
| Backfill | An idempotent script creates canonical rows, reusing ids | A second run changes nothing, and counts reconcile legacy to canonical row for row |
| Verify | A read-only parity check compares legacy and canonical answers | Zero mismatches on a copy of production data |
| Read | Readers switch to canonical, falling back to legacy only where parity is proven | Integration tests pass against both |
| Write | Writers write canonical and dual-write legacy for the window | Parity stays at zero under real traffic |
| Contract | Legacy reads and writes are removed | No code references the legacy columns |
| Retire | Legacy tables are dropped in a later, separate migration | Only after a full backup restore has been tested |

A step does not begin writing canonical data until the previous step's backfill and parity
check are green. Contraction can trail by several steps, because readers of an early model
often move only once a later step gives them somewhere to go, but every step names the
milestone at which it contracts.

---

## 6. Decisions still open

None of these blocks steps 1 to 4.

| Question | Proposed answer | Needed by step |
|---|---|---|
| Can a studio keep scheduling freelance engineers who have no login? | Yes, as UNCLAIMED memberships that are not shown as the person's affiliation until they accept | 4 |
| Should a backfilled project also make its artist a lead? | No: migration preserves today's permissions, and the artist is made a lead deliberately if at all | 6 |
| Which payment providers come first beyond Stripe cards? | Chosen per launch market; the model accepts any provider the registry lists | 17 |
| When a rail settles in another currency, who bears the conversion? | The obligation's creditor, disclosed before the payer commits | 17 |

---

## 7. First implementation slice, once the gate passes

Steps 1 and 2 together, Person and CreativeProfile, with no route changes:

1. **Expand.** A migration adds `persons` and `creative_profiles` and touches no legacy table.
2. **Backfill.** One Person per User, named from the user's artist, producer or engineer
   record in that order (never derived from the email address); one CreativeProfile per
   Artist, Producer and Engineer row under the same id, with a unique handle generated from its name; an Engineer without a login gets a
   Person with no `user_id`.
3. **Verify.** Every Artist, Producer and Engineer id resolves to a CreativeProfile; every
   User resolves to exactly one Person; every WeaveNode of type ARTIST resolves to a
   CreativeProfile.
4. **Tests before merge.** Backfill idempotency, the parity check, and a user who holds both
   an Artist and a Producer row ending with one Person and two profiles.

Readers move to Person and CreativeProfile in the slice after that.
