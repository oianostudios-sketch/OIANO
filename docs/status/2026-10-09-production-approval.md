**Production migrations become one approval, and every PR is compared with production, 2026-10-09.**
Each migration step needed the owner to run PowerShell against production by hand, and #26
merged before its production check ran. Two workflows replace that; nothing runs until the
owner configures the secrets and the Production reviewer described in
[`PRODUCTION_MIGRATION_WORKFLOW.md`](../PRODUCTION_MIGRATION_WORKFLOW.md).

- **What changed.**
  - `production-migration.yml` (dispatched from `main` with a PR number and a stage from
    `scripts/production/stages.json`): pins the PR head, requires green `verify` and
    `integration` and a required reviewer on `Production`, rehearses the stage on a
    disposable Neon copy of production (every inherited role password rotated before
    candidate code runs, six-hour expiry, deleted before approval), then waits for the
    owner's approval, rechecks everything, applies, backfills and verifies parity.
  - `production-parity.yml`: compares production, through a dedicated read-only role, with
    the exact schema of each same-repository PR to `main`, and posts a
    `Production schema parity` check. It runs only base-branch code and reads the PR's
    schema as data. The repository is public, so fork PRs are never compared.
  - CI runs the workflow safety tests and a real-PostgreSQL test that the read-only check
    refuses write-capable roles.
- **Evidence.** `scripts/production/safety.test.cjs`, 25 tests (guard refusals, migration
  history and recipe checks, Neon clone and cleanup ownership, no credentials or raw output
  reaching logs): 25 of 25. `readonly.database-test.cjs` on a fresh local database: passes,
  including a generator named in the PR schema never executing. Six guards were removed one
  at a time and each made its test fail. Integration 260 of 260 and the unit, web and build
  checks passed on this branch. Built by a Codex session that ran out of usage before
  committing; reviewed, re-run and completed here, adding the fork-PR refusal.
- **Not exercised.** No run against Neon or GitHub environments: that needs the owner's
  secrets. The fork refusal in `check-pr.cjs` has no unit test (the helper calls GitHub
  directly).
