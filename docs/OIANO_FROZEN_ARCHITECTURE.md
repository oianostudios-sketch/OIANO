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

## Migration order — not before the stabilization gate passes

1. Person
2. CreativeProfile
3. Discipline / PersonDiscipline
4. Organization / OrganizationMembership
5. Work
6. Contribution
7. Requirement
8. MAKE v1
9. SKY v1
10. Work-specific invitation
11. Booking bridge
12. WorkEvent
13. Deliverable
14. Version
15. Economic Obligation
16. Settlement
17. Credit
18. Evidence
19. Weave v2
20. ME
21. NOW
22. Intelligence

Do not skip ahead.

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
