# Production migrations and schema checks

Production migrations can be rehearsed on a disposable Neon copy and then applied
from one GitHub environment approval. The application still deploys from `main`;
apply the expansion and backfill **before** merging the matching application PR.
This workflow does not merge PRs, change product decisions, or enable Render migrations.

## One-time setup

First merge the infrastructure PR containing these workflows. GitHub dispatches
use the trusted workflow on `main`; a migration PR supplies only its pinned
candidate commit. No secrets are needed to review or merge the infrastructure.

Create/configure these GitHub environments in Settings → Environments. Restrict
each environment to the selected deployment branch `main` (not “protected
branches only”, which has different behavior when no branches are protected).

| Environment | Secret | Protection |
|---|---|---|
| `Migration rehearsal` | `NEON_API_KEY` | Main only; no reviewer needed. Prefer a project-scoped Neon API key. It can manage production branches, so it must never be a repository-wide secret. |
| `Production` | `PRODUCTION_DATABASE_URL` | Main only; add the owner as a **required reviewer**. Use the direct, unpooled writer URL with `sslmode=require`. |
| `Production read-only` | `PRODUCTION_READONLY_DATABASE_URL` | Main only; no reviewer needed. Use the dedicated role below, direct endpoint, `sslmode=require`. |

Keep “prevent self-review” off if the same owner will dispatch and approve. If a
different person dispatches, it can be enabled. Disable administrative bypass of
environment protection where available. A named environment alone is not an
approval gate: the workflow refuses to start if `Production` has no required
reviewer, and checks that rule again after approval.

Add these **repository Actions variables**, not secrets:

| Variable | Value |
|---|---|
| `NEON_PROJECT_ID` | Neon project ID |
| `NEON_PRODUCTION_BRANCH_ID` | Explicit production branch ID, not an assumed default |
| `NEON_PRODUCTION_HOST` | Direct production endpoint hostname, without protocol, port or `-pooler` |
| `NEON_DATABASE_NAME` | Production database name |
| `NEON_DATABASE_ROLE` | Migration owner role to use on the disposable copy |

The Neon helper confirms the parent branch owns that production endpoint. On the
copy it rotates **every API-listed inherited role password** before any candidate
code runs, and waits for the reset operations. The candidate receives only the
copy's URL. The API key is used before candidate execution and then in a separate
cleanup job; it never enters migration/backfill subprocesses. Review same-repository
candidate code before dispatching: a production copy still contains sensitive data,
and a malicious program could publish it. Dispatch is a trusted operator action,
not an automatic action on arbitrary PRs.

### Read-only role

Create a SQL role with no privileged memberships. Do not use a Neon owner role or
assume a role created through a console has sufficiently narrow privileges.
Run the following once as the database owner in a secure `psql` session. Substitute
the real database name for `your_database` and set a generated password at the
interactive prompt; never commit a password or connection URL.

```sql
CREATE ROLE oiano_ci_readonly LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS;
\password oiano_ci_readonly
GRANT CONNECT ON DATABASE your_database TO oiano_ci_readonly;
GRANT USAGE ON SCHEMA public TO oiano_ci_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO oiano_ci_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO oiano_ci_readonly;
ALTER ROLE oiano_ci_readonly SET default_transaction_read_only = on;
ALTER ROLE oiano_ci_readonly SET statement_timeout = '30s';
ALTER ROLE oiano_ci_readonly SET lock_timeout = '5s';
```

Default privileges above apply to the role executing that statement: repeat
`ALTER DEFAULT PRIVILEGES FOR ROLE actual_migration_owner ...` for any other
creator. The reader must not own tables, sequences, schemas, or the database, and
must not inherit write permissions. On older PostgreSQL installations `PUBLIC`
may have schema `CREATE`; remove that grant after confirming your migration owner
retains it (`REVOKE CREATE ON SCHEMA public FROM PUBLIC`). The checker fails closed
if it detects those privileges. `default_transaction_read_only` is an extra
guardrail; actual SQL grants remain the authorization boundary.

Store this role's URL only in `Production read-only`. The automated check reads
schema metadata; it does not execute the readiness report or publish row counts,
names, IDs, raw database errors, dumps, or diff artifacts.

### Make the result enforceable

After secrets and variables are configured, run **Production schema parity** on
an open PR with no schema changes. Require these GitHub checks on `main`:

- `verify`
- `integration`
- `Production schema parity` (the explicit GitHub Actions check on the PR head,
  not the base-branch workflow job called `compare`)

Use a ruleset or branch protection to require PRs and these checks, restrict
bypass, and keep branches up to date as appropriate. The workflow cannot make a
check required by itself. Protect changes to `.github/workflows` and
`scripts/production` through review. These files, `package-lock.json`, and the
trusted base branch are part of the privileged automation's trust boundary.

GitHub may block `pull_request_target` under a repository/organization Actions
policy. Enable this reviewed workflow if required; until then the manual
**Production schema parity** dispatch runs the same check. Missing secrets are
a failure, never a successful skip. No database work runs from normal `pull_request`
CI. The privileged workflow checks out **only the base commit**, installs its
locked dependencies with lifecycle scripts disabled, downloads the PR schema as
data, and never executes candidate code or generators.

## Run a migration stage

1. Review the PR and the outstanding owner decisions. This infrastructure does
   not approve the canonical gate, discipline policy, name repair, or Weave backfill.
   Update the candidate from current `main`; both CI jobs must pass on its head.
2. In Actions → **Production migration** → Run workflow, choose branch `main`,
   the PR number, and the stage:

   | Stage | Allowed new migration | Backfill |
   |---|---|---|
   | `schema-check` | None; performs checks only | None |
   | `identity-person-profile` | `20261005120000_identity_person_profile` | Existing identity backfill and `--verify` |
   | `identity-discipline` | `20261008120000_identity_discipline` | Existing identity backfill and `--verify` |

3. The workflow pins the exact head, confirms a required reviewer, creates a
   copy from the explicit production branch, checks baseline schema and migration
   checksums, applies only that stage's migrations, runs backfill and data parity,
   repeats the backfill in rehearsal, and compares the final schema and history.
   Repeating the backfill checks that it can run again and still pass parity; the
   existing integration tests separately check row-for-row idempotency.
4. Cleanup deletes the copy before approval. Cleanup also runs after rehearsal
   failure or cancellation when GitHub can schedule it. Six-hour Neon expiry is
   the fallback if a runner disappears. A cleanup failure blocks apply.
5. Review the run summary and exact commit. Before approving `Production`, confirm
   backups/recovery readiness and pause relevant application writers for stages
   that require it. **Identity currently backfills before dual-write code is
   deployed:** keep legacy identity writers paused through application deployment,
   or new/changed identities can invalidate parity in that gap. The workflow does
   not provide a maintenance-mode switch or atomically deploy the application.
6. Approve the pending Production deployment in GitHub. The job rechecks the PR
   head, main commit, green CI and reviewer rule, then validates the live baseline
   again, acquires a database advisory lock, applies, backfills and verifies.
   A single workflow concurrency group serializes stages, including approval waits.
7. A separate job refreshes `Production schema parity` on the applied PR head.
   Merge that exact PR only after the required checks pass, verify Render's
   application deployment, and resume paused writers. If the head changed, review
   the replacement and recheck; the job never transfers the approval to it.

#39 must wait for #16 to merge and then be retargeted/rebased onto `main`. The
stage allowlist refuses a discipline run carrying both expansions. Application
PRs changing schema will intentionally fail the read-only comparison until the
approved expansion is applied. Data-backfill parity is certified by the approved
stage, not by the schema-only PR check. Neither result is a perpetual guarantee
against later manual production changes.

Add future stages explicitly to `scripts/production/stages.json`, the dispatch
choices, and the runner's reviewed recipe handling, with a backfill and parity
test where required. No arbitrary shell command can be entered in the dispatch
form. Weave is deliberately not a stage while its owner decision is outstanding.

## Failure and recovery

- Missing configuration, unexpected parent/endpoint, stale CI, a changed commit,
  baseline drift, edited migration checksums, unexpected pending migrations,
  unresolved migration history, or a held advisory lock stops the run.
- If rehearsal fails, production has not been touched. Fix the candidate or
  configuration and start a **new complete run**. Do not rerun only failed jobs:
  cleanup names include the GitHub run attempt, and approval applies to a single
  complete rehearsal. Neon API creation is not blindly retried after an ambiguous
  network error; cleanup finds the run's deterministic branch name.
- If apply starts and later fails, some DDL/data may already be committed. The
  workflow does **not** claim a transaction across Prisma deploy and the backfill,
  perform an automatic rollback, use `migrate resolve`, or restore a snapshot over
  live writes. Stop merging/deploying, keep affected writers paused, inspect the
  database privately and prepare a reviewed forward repair or restore plan.
  Re-running against a partially applied stage fails the baseline check on purpose.
- Public logs contain fixed phase labels and pass/fail only for database commands.
  Reproduce failures privately on an authorized disposable branch using the pinned
  commit and existing CLI scripts; never paste their row-level errors into public
  PR comments. Check Neon for `oiano-rehearsal-<run-id>-<attempt>` after an interrupted
  run and verify cleanup/expiry. Delete only that confirmed child if manual cleanup
  is necessary.
- `schema-check` creates no migration changes, but still uses a copy and the normal
  approval path. For the canonical gate's one-time read-only comparison, the
  standalone **Production schema parity** workflow is sufficient.

## Verification and sources

Local commands (no production credentials):

```powershell
node --test scripts/production/safety.test.cjs
# Use ONLY a disposable local test DB from npm run db:local:fresh:
node --test scripts/production/readonly.database-test.cjs
```

The database test requires `INTEGRATION_DATABASE_URL` and rejects non-local hosts
or non-test database names. Both tests run in regular CI; the database test runs
after the application integration suite on its disposable PostgreSQL service.

Implementation references:
[GitHub environment protection](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments),
[privileged PR workflow security](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target),
[Neon branch creation](https://api-docs.neon.tech/reference/createprojectbranch),
[branch role password reset](https://api-docs.neon.tech/reference/resetprojectbranchrolepassword),
[direct connection URI](https://api-docs.neon.tech/reference/getconnectionuri), and
[branch pagination](https://api-docs.neon.tech/reference/listprojectbranches).
