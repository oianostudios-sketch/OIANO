# Oiano database baseline

The historical migrations used to not recreate a clean database — several
early tables were introduced with `prisma db push` rather than a tracked
migration, so `prisma migrate dev` failed to build a fresh database from
scratch (P3006/P1014 on shadow-DB replay). This has been fixed: migration
history was squashed into a single baseline, generated directly from
`prisma/schema.prisma` (confirmed zero drift against the live database first)
plus the raw-SQL constraints Prisma's schema can't express — the
`bookings_room_time_no_overlap` exclusion constraint and the
`admin_audit_logs` immutability triggers, both confirmed present in the live
database and folded into the baseline by hand.

The baseline is `prisma/migrations/20260819000000_baseline/migration.sql` —
the actual migration Prisma applies, not a separate hand-maintained snapshot.
The old snapshot approach (`prisma/baseline/20260814_current_schema.sql`)
drifted stale within days and was removed; checking the real migration file
means this can't happen the same way again.

The pre-squash migration history (28 files, `20260514091430_init` through
`20260815193000_add_project_messages`) is preserved for reference in
`prisma/migrations_archive_pre_baseline/` — not deleted, just no longer part
of what a fresh database build replays.

## Verify safely

Run `npm run db:verify-baseline`. The script creates a uniquely named
temporary PostgreSQL schema, applies the baseline, verifies core tables and
foreign keys, and removes the temporary schema. It does not modify the
`public` schema.

This was proven more rigorously than the script alone shows, once, when the
squash was done: a completely separate, empty database was built from only
the baseline file, then diffed against the live database with
`prisma migrate diff` — zero differences. That's the strong guarantee; this
script is the fast day-to-day sanity check.

## Deploying to an environment

Identify the database's migration history before running
`prisma migrate deploy`; fresh and existing databases require different
handling.

### Fresh database

An empty database can run `prisma migrate deploy` normally. Prisma applies the
baseline and then every later incremental migration in timestamp order.

### Database already recording `20260819000000_baseline`

Run `prisma migrate status`, take a backup, then run `prisma migrate deploy`.
Only migrations created after the baseline should be pending.

### Existing database created from the archived history

This is the dangerous case: its tables already exist but its
`_prisma_migrations` table does not record the baseline. Never run
`prisma migrate deploy` first because it would attempt to recreate them.

1. Take and verify a restorable backup.
2. Run `prisma migrate status` and retain the output with the release record.
3. Diff the live schema against `prisma/schema.prisma`; proceed only when the
   diff is empty or every difference has been explicitly reconciled.
4. Mark the baseline as applied without executing its SQL:
   `npx prisma migrate resolve --applied 20260819000000_baseline`.
5. Run `prisma migrate status` again. Only post-baseline migrations should be
   pending.
6. Run `prisma migrate deploy` and the release smoke tests.

Repeat reconciliation independently for staging and production. Retain the
backup identifier, pre/post migration status, schema-diff result, migrations
applied, and smoke-test result. Never use `prisma db push` in staging or
production.

## If the schema changes again

Normal schema changes go through `prisma migrate dev` as usual — the baseline
doesn't need touching for routine work. Only re-baseline (regenerate from
`schema.prisma`, re-fold in any raw SQL, re-verify with a fresh-database diff)
if migration history breaks the same way again — e.g., a change gets applied
via `db push` instead of `migrate dev` and needs reconciling.
