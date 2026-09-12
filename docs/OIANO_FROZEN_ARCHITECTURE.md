# OIANO — frozen architecture

> Set by the product owner as the target for the canonical migration. Changing
> this file is an architecture decision, not an edit.
>
> Where the repository stands against it: [architecture delta](OIANO_ARCHITECTURE_DELTA.md).
> What must be true before migrating: [implementation status](OIANO_IMPLEMENTATION_STATUS.md).
> Where an earlier audit's advice conflicts with this document — for example the
> architecture audit ruling out "mass schema redesign" and "Node/entity merge" —
> this document governs the migration, and the conflict is recorded in the delta
> rather than reconciled.

OIANO is a Creative Work Network.

## Core mechanism

Intent → Formation → Agreement → Work → Exchange → Evidence → Memory → Opportunity → New Intent

## Compounding law

Work creates evidence. Evidence creates trust. Trust creates opportunity.
Opportunity creates more work.

## Canonical domain direction

**User** = authentication and account only.

**Professional identity:** Person, CreativeProfile, Discipline, Organization,
OrganizationMembership.

**Core work:** Work, Requirement, Contribution, contextual Role, CreativeSpace,
Booking, WorkEvent, Deliverable, Version, Agreement, Economic Obligation, Payment,
Settlement, Credit, Evidence, Connection, Presence.

**Experience surfaces:** NOW, MAKE, SKY, ME.

**Interaction states:** FORMING, LIVING, SETTLED.

## Laws

1. Work is the central economic object.
2. Identity is persistent; role is contextual.
3. Discipline is not Contribution.
4. Organization is not CreativeSpace.
5. Booking is not Work.
6. WorkEvent is not Work.
7. Contribution connects an Identity to Work.
8. Payment must explain what value or obligation it settles.
9. Credit is attribution; Evidence is proof.
10. Evidence must have provenance.
11. Passport projects canonical truth; it does not manufacture truth.
12. Weave emerges from meaningful work and evidence, not follower-style connections.
13. SKY is contextual discovery over real requirements.
14. NOW is a projection of important domain state, not a notification dump.
15. Intelligence may recommend relevance but may not manufacture professional truth.
16. NOW / MAKE / SKY / ME are experience surfaces, not source-of-truth domain tables.

## Owner decisions — 2026-09-12

Set by the product owner after the first [architecture delta](OIANO_ARCHITECTURE_DELTA.md).
They amend the laws above and govern the migration.

1. **OIANO is global, so money is flexible.** Each studio sets its own prices,
   chooses the currency it prices and settles in, and chooses the payment media
   it accepts — card through Stripe, mobile money, bank transfer, cash or OIANO
   wallet, among others. Independent professionals (decision 2) price their own
   work the same way. This extends law 8: a payment explains what it settles,
   in which currency, and through which medium.
   - Every amount carries its currency: integer minor units plus an ISO 4217
     code. No amount is implicitly USD.
   - The ledger never adds amounts in different currencies. A conversion is an
     explicit, recorded exchange with its rate and source.
   - Historical USD records stay USD. No backfill relabels a currency.
2. **Creative professionals are independent.** A producer is linked to a studio
   only if the producer chooses to be, and the same holds for engineers and every
   other professional. Affiliation is an OrganizationMembership the professional
   accepts, may hold with several studios, and may end. No professional needs a
   studio to exist, be discovered, contribute to Work or be paid.
3. **The Golden Journey must work end to end.** Any person can start Work; an
   artist needs neither a producer nor a studio to begin. Every step of the
   journey below must be supported by the schema, and redesigning the schema is
   authorized where that is what it takes.
4. **Agreement gets its own migration step**, after Contribution and Requirement
   and before MAKE v1. Agreements form between contributions on a Work, and
   Economic Obligations are created from agreed terms, so Agreement must exist
   before either is used. RightsAgreement, RightsShare, RightsDecision,
   PromotionalConsent, StudioPolicy and PolicyException migrate into it.
5. **This standard supersedes older rules that conflict with it.** Superseded:
   the architecture audit's "no mass schema redesign" and "no Node/entity merge";
   USD-only money; an engineer bound to one studio; project creation reserved to
   producers. **Not superseded:** the migration principles below, the
   stabilization gate, the ledger as the only writer of money, the validation
   and error contracts, and never changing production data outside a deliberate,
   verified migration.

## Migration principles

A strangler migration, not a rewrite. Do not delete Artist, Producer, Engineer,
Project, Studio, the current Passport tables, Booking or Payment early.

New canonical structure beside legacy → backfill → compatibility reads →
canonical writes → migration verification → remove the old dependency → only
then retire legacy structures.

- Never create two long-term sources of truth.
- No destructive rename just because the target model has a better name.
- No role-specific columns on Project or Work (`photographer_id`, `engineer_id`,
  `director_id`, `videographer_id`). Participation belongs to Contribution.
- **Deploy safety.** `main` auto-deploys, and migrations are applied by hand
  (`render.yaml`). Schema-changing code is developed on a branch and merged only
  after its migration has been applied to the database it will run against.

## Migration order — not before the stabilization gate passes

1. Person
2. CreativeProfile
3. Discipline / PersonDiscipline
4. Organization / OrganizationMembership — including each studio's pricing
   currency and accepted payment media
5. Work — startable by any person
6. Contribution
7. Requirement
8. Agreement
9. MAKE v1
10. SKY v1
11. Work-specific invitation
12. Booking bridge — a booking records the currency of its price
13. WorkEvent
14. Deliverable
15. Version
16. Economic Obligation — amount, currency and due terms
17. Settlement — currency and payment medium
18. Credit
19. Evidence
20. Weave v2
21. ME
22. NOW
23. Intelligence

Do not skip ahead. Step 8 and the notes on steps 4, 5, 12, 16 and 17 come from
the owner decisions above; the rest of the order is as first frozen.

## First canonical milestone — the Golden Journey

Not to be built until the migration reaches it.

Joseph says "I want to make a song."
→ BAD HABITS Work is created
→ an Artist Contribution exists
→ a Producer Requirement opens
→ Malik is proposed and accepts as a Producer Contribution
→ a studio is selected and booked
→ a Recording WorkEvent happens
→ files attach to Work, Event or Deliverable context
→ Mix 01 → Mix 02 → Master
→ producer and studio obligations settle
→ credits confirm
→ contributions confirm
→ Evidence is created with provenance
→ Passport projections update
→ Weave relationships strengthen
→ Evidence influences future discovery
