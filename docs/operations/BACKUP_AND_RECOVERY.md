# OIANO Backup and Recovery Standard

Owner: OIANO Platform Operations
Review cadence: quarterly and after every recovery event

## Required production controls

- Neon point-in-time recovery must remain enabled for the production project.
- Create a protected restorable branch before every schema migration and release that changes financial, identity, rights or booking data.
- Export an encrypted logical backup daily to storage outside the production Neon project; retain daily copies for 35 days and month-end copies for 12 months.
- Restrict restore and export credentials to OIANO administrators. Never place database URLs in tickets, chat, screenshots or source control.
- Record backup start, completion, size, checksum, storage location and operator/service identity.

## Recovery objectives

- Target RPO: 24 hours for logical backups; use Neon point-in-time recovery for a shorter incident window.
- Target RTO: four hours for pilot operations.
- Test a restore into an isolated database monthly. A backup is not considered valid until a restore, row-count comparison and application smoke test pass.

## Restore procedure

1. Declare an incident and freeze writes if continuing activity could increase loss.
2. Identify the last known-good point using audit, webhook and financial reconciliation evidence.
3. Restore to a new isolated branch—never overwrite production first.
4. Run schema validation, payment reconciliation, wallet drift, booking counts and authentication smoke tests.
5. Obtain two-person approval before redirecting production.
6. Preserve the affected database for investigation and document lost/replayed transactions.

## Release gate

No production migration runs until its SQL has succeeded on a restorable production-data branch and rollback/recovery time has been recorded.
