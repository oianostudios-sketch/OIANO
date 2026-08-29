# OIANO Studio Operating Model

## Product principle

OIANO establishes a professional operating standard without taking business judgement away from the studio. Every configurable decision is represented as:

1. **Rule** — the studio's approved operating policy.
2. **Default** — the outcome OIANO applies automatically.
3. **Exception** — an authorised, explained departure that does not alter the rule.

Security boundaries, tenant isolation and balanced-ledger requirements are hard boundaries. Commercial and operational policies may be advisory or controlled.

## Policy domains

| Domain | Initial subjects | Later expansion |
|---|---|---|
| Booking | approval, duration, buffers, hours, recurrence | cancellation, overtime, capacity, walk-ins |
| Pricing | room/service rate, discount floor | peak schedules, loyalty, packages, negotiated contracts |
| Payment | deposit, timing, method | invoice terms, split payments, payouts |
| Resource | room and engineer availability | equipment, branches, location inheritance |
| Workflow | project stages and approvals | studio-defined stage builders and label gates |
| Files | version and delivery requirements | retention, folder templates, external delivery |
| Rights | credit and consent requirements | studio-specific privacy and promotional rules |
| Communication | confirmations and reminders | escalation schedules and channel preferences |

## Enforcement levels

- `ADVISORY`: explain the difference and permit continuation.
- `CONTROLLED`: require an approved exception with the configured capability.
- `HARD`: deny the action; no studio override can bypass integrity or security.

## Capability model

Studio positions are presentation and organisational labels. Authority is granted through granular capabilities such as:

- `MANAGE_POLICIES`
- `POLICY_OVERRIDE_ALL`
- `WAIVE_DEPOSIT`
- `CHANGE_PRICE`
- `EXTEND_HOURS`
- `OVERRIDE_CAPACITY`
- `RECORD_MANUAL_PAYMENT`
- `ISSUE_REFUND`

V1 maps the existing Studio Administrator role to full policy authority for backward compatibility. Granular capability storage and the staff-position editor belong to rollout phase 3 and must be deployed through a separate additive migration.

## Exception lifecycle

`REQUESTED → APPROVED | REJECTED | ESCALATED → APPLIED → EXPIRED | REVOKED`

Every exception records its policy, target, normal values, requested values, consequence, reason, requester, approver and timestamps. Approval creates an immutable administrative audit event. The original policy remains unchanged.

## First vertical slice

The first implementation evaluates booking policies against:

- full-upfront wallet payment and deposit percentage;
- effective hourly price;
- local studio closing hour;
- duration and recurrence;
- selected service, room and artist.

Controlled departures require an approved `ARTIST_BOOKING` exception bound to that artist and policy. Applied one-time exceptions are consumed atomically with booking creation. Studios with no policies retain existing booking behaviour.

## Rollout

1. Policy/version/exception foundation and operator control surface.
2. Deposit, price, hours and booking approval integration.
3. Staff positions and explicit capability editor.
4. Packages, memberships, invoices, cash and post-session balances.
5. Configurable creative workflows, files, credits, rights and communication.
6. Branch inheritance, multi-location reporting and policy intelligence.

## Migration safety

The migration is additive. It does not modify existing bookings, payments or studio defaults. Do not apply it to the hosted database until database reconciliation is complete and a restorable branch exists. Run integration tests against a disposable test branch first.
