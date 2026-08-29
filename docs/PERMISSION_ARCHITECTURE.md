# OIANO permission architecture

Status: release contract for the current role model and its capability migration.

## Core rule

Frontend visibility is never authorization. Every protected API operation must
derive access from the authenticated identity and at least one server-verified
relationship: ownership, active studio membership, project participation,
assigned work, or OIANO platform authority.

## Permission dimensions

1. **Identity** — the authenticated `User` and current `auth_version`.
2. **Account role** — the current compatibility role in `User.role`.
3. **Studio context** — a valid `StudioStaff` membership selected through
   `User.active_studio_id`.
4. **Capability** — the named permission granted by the active membership.
5. **Resource relationship** — owner, assigned engineer, accepted project
   participant, project producer, booked artist, or matching studio.
6. **Action state** — the requested transition must be valid from the current
   booking, payment, consent, credit, rights, or invitation state.

All applicable dimensions must pass. A role alone is not sufficient for a
studio-, project-, file-, payment-, or identity-scoped mutation.

## Current access contract

| Resource | Artist | Producer | Engineer | Studio staff | OIANO administrator |
|---|---|---|---|---|---|
| Own identity/Passport | manage own | manage own | read/update professional surface when provided | read only through legitimate studio relationship | audited support access only |
| Studio configuration | none | none | assigned operational access | active membership plus capability | audited platform oversight |
| Artist roster | own identity | discover permitted public profiles | assigned-booking artists only | artists with a booking at active studio | audited network oversight |
| Booking | own bookings | linked-project sessions where explicitly permitted | assigned bookings | bookings belonging to active studio | audited oversight |
| Payment | own booking payment | none by default | none | active-studio booking payment assistance | reconciliation/oversight only |
| Session notes/files | own review and download | project access where explicitly linked | assigned booking, read/write per action | active-studio booking, capability controlled | audited support access only |
| Project | artist on project | producing owner | assigned booking or accepted participant | project with booking at a staffed studio | audited oversight |
| Project conversation | project member | project owner/member | assigned/member | matching staffed studio | audited oversight |
| Contribution/credit | named participant | propose for owned project | named participant | no unilateral confirmation | audited dispute support only |
| Rights/consent | named holder/subject | propose for owned project | named holder | cannot approve for holder | audited evidence access only |
| Maintenance/audit | none | none | none | studio-local analytics only | MFA plus audited platform authority |

## Response contract

- Return `401` when authentication is missing, invalid, expired, or revoked.
- Return `403` when the resource is known and disclosing its existence is safe,
  but the identity lacks an allowed role or capability.
- Return `404` for cross-tenant and privacy-sensitive resources so the response
  does not disclose that another studio, artist, project, file, or payment exists.
- Return `409` for a valid identity attempting an invalid state transition.

## Migration toward multiple capabilities

The current `User.role` remains the compatibility boundary until every route is
covered by permission tests. Migration is additive:

1. Inventory every endpoint and assign resource, action and relationship rules.
2. Centralize repeated ownership and studio/project relationship checks.
3. Add capability records without removing `User.role`.
4. Evaluate `role AND relationship` first, then shadow-evaluate capabilities.
5. Compare decisions in logs without changing responses.
6. Enable capability enforcement route family by route family.
7. Remove global-role assumptions only after equivalent denial tests pass.

## Required automated denial cases

- Artist A cannot access Artist B private files, payments or bookings.
- Studio A cannot access Studio B artists, rooms, bookings, engineers or finance.
- A multi-studio staff member cannot act without a valid active membership.
- Removing a membership immediately removes its access.
- An engineer cannot access an unassigned session.
- A producer cannot mutate another producer's project.
- A contributor cannot enter a workspace before accepting its invitation.
- A project participant cannot approve another holder's credit or rights share.
- An ordinary access token cannot access OIANO maintenance routes.
- OIANO administrator login cannot bypass MFA through login, enter, or password reset.

## Release gate

No new resource route is complete until it has one positive authorization test,
one same-role ownership denial, one cross-studio or cross-project denial where
applicable, and one invalid-state-transition test for mutations.
