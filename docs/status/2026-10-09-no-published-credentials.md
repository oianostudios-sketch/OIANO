**No seed, script or deploy can recreate a login whose password is published in this repository, 2026-10-09.**

**What was wrong.** The repository is public. `scripts/seed-demo-users.sql` held bcrypt
hashes of the plain-text fallback passwords in `prisma/seed.ts`, and production had four
demo accounts carrying them. The owner locked those accounts in production on 2026-10-09
(no password hash, `auth_version` bumped). The seed's only guard was
`NODE_ENV === 'production'`, but production runs `NODE_ENV=staging` (`render.yaml`), so
re-seeding there would have restored the published passwords. `seed-ecosystem.ts` and
`scripts/reset-local-demo-passwords.ts` had the same kind of fallback, and
`CLAUDE_CODE_PROMPT.md` listed demo passwords as usable credentials.

- **What changed.**
  - `scripts/seed-demo-users.sql` is deleted.
  - `apps/api/src/lib/seedCredentials.ts` decides every seed password. A built-in demo
    password is used only when `DATABASE_URL` is a local test database: host `localhost`,
    `127.0.0.1` or `[::1]` (and no `host=` override) with a standalone `test` segment in
    the name, the rule `dev:local`'s `oiano_dev_test` and the integration runner already
    use. Anywhere else, and when `DATABASE_URL` is unset, every `SEED_*_PASSWORD` must be
    set, must not be a built-in default, and must be at least 12 characters. NODE_ENV is
    not consulted.
  - The built-in defaults now live only in `prisma/local-demo-passwords.ts`.
    `prisma/seed.ts` resolves all five passwords before its first write, so a refusal
    leaves the database untouched. `prisma/seed-ecosystem.ts` follows the same rule.
    `scripts/reset-local-demo-passwords.ts` refuses anything but a local test database.
    `scripts/create-producer-demo.ts` has no built-in password and now also rejects a
    default or short one outside a local test database. What the seed creates for local
    dev is unchanged.
  - `npm run security:secrets` now fails on a bcrypt hash literal in any tracked file, and
    on a built-in demo password anywhere except `prisma/local-demo-passwords.ts` and test
    files. The scanner exports `scanContent` for its test.
  - `CLAUDE_CODE_PROMPT.md`, `OIANO_System_Overview.md` and `.env.example` no longer
    present demo passwords. They say demo logins exist only on the local dev database
    (`npm run dev:local`). The web app has no demo-login button and no `VITE_DEMO_*`
    variable, so nothing there needed changing.
- **Evidence.**
  - `apps/api/src/lib/seedCredentials.test.ts`, 9 tests, all pass. They show that a
    non-local URL with no password is refused, that an unset URL is refused under
    `NODE_ENV=staging`, that every built-in default and a short password are refused,
    and that a strong one is accepted. A local test URL gets the built-in password, the
    reset refuses a non-local URL, and the URL rule is checked on 4 accepted and 10
    refused URLs.
  - Mutation checks. Restoring the old NODE_ENV rule failed 4 of 9 tests. Matching the
    default list against the variable name instead of its value failed the
    default-password test. Each file was restored from a backup and confirmed with `cmp`.
  - `scripts/check-repository-secrets.test.js`, 5 tests, runs in `npm test`. A planted
    synthetic `$2a$`/`$2b$`/`$2y$` hash is caught, even in a test file, and demo
    passwords outside their home are caught. Removing the bcrypt pattern failed 2 of 5.
  - Running the new scanner over `origin/main` (f04be52) flags
    `scripts/seed-demo-users.sql` (bcrypt hash) and four files with demo passwords
    (`CLAUDE_CODE_PROMPT.md`, `prisma/seed.ts`, `prisma/seed-ecosystem.ts`,
    `scripts/reset-local-demo-passwords.ts`). On this branch it passes.
  - On a fresh local test database, `prisma migrate deploy` and `npm run db:seed` with no
    `SEED_*` variables completed, and the admin, artist and platform-admin demo accounts
    verify against their built-in local passwords. Against an unreachable non-local
    URL with `NODE_ENV=staging`, the seed stopped before printing its first line, both
    with no password set and with a default set. The demo password reset was refused for
    a non-local `_test` URL.
  - Typechecks (api, web), `npm test`, `npm run test:integration:local`, `npm run build`
    and `npm run security:secrets` pass.
- **Not done.**
  - **Git history still contains** the deleted SQL script and the old plain-text
    defaults. The production accounts they matched are locked, so that history is
    inert. Rewriting public history is the owner's decision and was not done here.
  - Whether production's demo accounts should be deleted rather than locked is also
    left to the owner. No schema change was made.
