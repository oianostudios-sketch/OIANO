# OIANO release checkpoint

Run the application release gate with:

```text
npm run security:secrets
npm run verify
```

The gate validates Prisma, replays the generated database baseline in isolation, runs 53 security/intelligence tests, and creates production shared, API and web builds.

Run the operational gate separately with:

```text
npm run operations:verify
```

That gate intentionally fails until production-only secrets, public origins, monitoring/support contacts, legal identity and recent restore evidence are configured. Never weaken the gate to make a release green.

## Database release rule

The intended Neon database currently matches the 10-migration repository history. A clean isolated Neon schema has also accepted the migrations and passed the expanded integration journey. Before each production migration, still create a restorable production-data branch, test the exact SQL there, and follow `docs/DATABASE_BASELINE.md` and `docs/operations/BACKUP_AND_RECOVERY.md`.

The audit schema `oiano_test_20260828` is isolated test evidence. Keep it until the release review is accepted, then remove it through Neon after confirming it contains no required evidence.

## Reviewable release streams

Checkpoint these independently so each can be reviewed and rolled back:

1. Authentication, MFA, tenant scoping and private files.
2. Payments, webhook verification, ledger and refunds.
3. Booking, policies, exceptions and session completion.
4. Artist, collaborator and creative-professional experiences.
5. Studio operator, Pulse, team and multi-studio controls.
6. Maintenance, administration, monitoring and operations.
7. Database migrations, reconciliation evidence and legal surfaces.

## Current performance boundary

The previous optional 815.60 kB Three.js login renderer is no longer present. The largest current web chunk is approximately 320 kB (105 kB gzip). Preserve route-level lazy loading and re-check bundle output on the exact release commit.

Do not combine unrelated dead-code deletion with database, authentication or payment changes.
