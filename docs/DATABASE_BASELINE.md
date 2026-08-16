# Oiano database baseline

The historical migrations do not recreate a clean database because some early
tables were introduced with `prisma db push`. The generated baseline at
`prisma/baseline/20260814_current_schema.sql` is the complete current schema and
is the source for the next controlled migration squash.

## Verify safely

Run `npm run db:verify-baseline`. The script creates a uniquely named temporary
PostgreSQL schema, applies the baseline, verifies core tables and foreign keys,
and removes the temporary schema. It does not modify the `public` schema.

## Release procedure

1. Back up the production database and test restoration.
2. Freeze schema changes for the baseline release.
3. Verify the baseline against staging with `npm run db:verify-baseline`.
4. In a release branch, archive the legacy migration directory and install the
   baseline as the first migration. Do not combine that change with features.
5. For an existing database, mark the baseline migration as applied with
   `prisma migrate resolve --applied <baseline_migration_name>`.
6. For a new database, run `prisma migrate deploy` and verify application smoke
   tests before directing traffic to it.

Never run the baseline SQL directly against an existing populated schema.
