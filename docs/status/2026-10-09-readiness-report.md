**A read-only report gives the owner the production counts behind five pending decisions, 2026-10-09.**
The name repair, the Weave backfill, the identity migration (#16, #39), the untyped
references (audit C13) and the pending migrations each need numbers only production has.
The owner runs this report there; nobody else sees the connection string.

- **What changed.** `apps/api/src/lib/readinessReport.ts` collects the counts and
  `prisma/readiness-report.ts` prints them (`npm run db:readiness --workspace=apps/api`).
  No schema change and no route change.
  - **Cannot write.** Every query runs in one transaction that starts with
    `SET TRANSACTION READ ONLY`, and the report checks `transaction_read_only` is `on` before
    running anything. Each statement is limited to 120 seconds.
  - **Prints counts only.** It never prints a name, email, id or other row value. The only text
    it prints is fixed labels, user roles (a fixed enum), and migration folder names. A
    participant or holder type outside the known list is printed as `OTHER`.
  - **Aimed deliberately.** It refuses to run when `DATABASE_URL` is unset, never reads `.env`
    (it does not import `lib/prisma`, which loads `.env` over an exported URL), and prints
    the host, port and database it is about to read, never the user or password. Error
    messages have the URL and password masked.
  - **What it counts.**
    1. Artist and producer rows whose name or alias equals their user's email local part,
       compared case-insensitively in SQL, the accounts affected, and rows still carrying
       the signup placeholders from `packages/shared/src/placeholderNames.ts`.
    2. Completed bookings with no Weave evidence, split into those that completed within the
       last 7 days, which the scheduled repair (#36) covers, and older ones, which need the
       backfill. It uses the repair's definitions: status `COMPLETED`, measured on
       `updated_at`.
    3. Users (by role), artists, producers, and engineers with and without a login. Users
       holding both an artist and a producer row, or more than one identity row. Ids found
       in two legacy identity tables, which stop the #16 backfill. Producers whose
       primary discipline is unknown, whose discipline list is not a list, holds an
       unknown value, or holds no known code (the codes in
       `apps/web/src/lib/creativeDisciplines.ts`). Whether the canonical identity tables
       exist yet.
    4. For `rights_shares.holder_ref_id` (by holder type),
       `project_credits.participant_id` and `project_participants.participant_ref_id` (by
       participant type): how many values are empty, or name a user, an artist, a producer,
       a project participant, several of those, or nothing.
    5. Migration folders in `prisma/migrations` that the database has not applied
       (finished and not rolled back), any that started but did not finish, and how many
       applied migrations this checkout does not have.
  - A table or column a pending migration would add is reported as absent rather than
    queried, so it cannot abort the report.
- **How the owner runs it.** From an up-to-date `main` in `C:\projects\oiano` (run `npm ci`
  first if dependencies changed), in PowerShell:

  ```powershell
  Set-Location C:\projects\oiano
  $url = (Read-Host 'Paste the production DIRECT connection string (it starts with postgresql://)').Trim()
  if ($url -notmatch '^postgres(ql)?://') {
    Write-Host 'That is not a connection string, so nothing was run. Start again and paste the URL itself.'
  } else {
    $env:DATABASE_URL = $url
    try { npm run db:readiness --workspace=apps/api }
    finally {
      Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
      Write-Host 'Done. The connection string has been cleared. Copy everything above (it holds counts only) and send it back.'
    }
  }
  ```

- **Evidence.** `readiness-report.integration.test.ts` (one test, nine subtests) runs on
  the shared integration database. It reports before and after seeding its own rows and
  asserts the exact difference in every bucket. The seeded rows are: one account whose
  artist and producer both carry its email's local part (counted as one account), an alias
  match, both placeholders, unknown, non-list and empty discipline lists, a producer sharing
  an artist's id, engineers with and without a login, missed Weave syncs inside and outside
  the window next to synced and pending bookings, and each kind of reference.
  - The printed report contains none of the seeded emails, local parts, names or ids,
    no `@`, and no UUID.
  - A raw `INSERT` and a `prisma.user.create` inside `withReadOnlyTransaction` both fail
    with Postgres's `cannot execute INSERT in a read-only transaction`, and no row exists
    afterwards.
  - The command itself, run without `DATABASE_URL`, exits 1 with "nothing was run". Run with
    a password in the URL, it never prints that password and names the host it read.
  - The discipline list is held equal to the web file's, and the window equal to
    `REPAIR_WINDOW_MS`.
  - Mutations, each restored from backup and confirmed with `cmp`, each fail their intended
    subtest:
    - no `SET TRANSACTION READ ONLY` (and no check)
    - a case-sensitive name comparison
    - no repair window
    - printing a raw participant type instead of `OTHER`
    - no refusal without `DATABASE_URL`
  - The CLI was also run through `npm run db:readiness` against a local test database.
  - Integration on a fresh local database: 199 of 199. API unit 119, intelligence 31 and web
    103 pass. Both typechecks, the build and the secret scan pass.
- **Not exercised.** A run against production, or through a transaction-mode pooler. How
  long the counts take on production's row counts. A database where the canonical identity
  tables already exist (they are reported present; nothing in them is counted).
