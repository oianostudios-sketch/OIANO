**The checkpoint branch now reports every missing production-parity input by
name, before database access, with an operator configuration checklist, 2026-10-27.**

Reused the exact `scripts/production/check-pr.cjs` and `safety.test.cjs` changes from
PR #54's local branch at `eaa0bef`, applying its commit without committing and then
reviewing the diff. PR #54 and `fix/production-parity-config-diagnostics` were not
modified. No workflow, schema, permissions, production configuration or infrastructure
was changed.

The checker gathers missing, empty and whitespace-only inputs from a fixed allowlist
and publishes only their names in annotations, the job summary and the failed check.
It stops before URL parsing or database access. The summary is written even if the
check-update request fails; the workflow still fails. Other errors remain generic.
The existing read-only role check, direct TLS endpoint/database validation, trusted
base execution and exact-head verification are unchanged.

The [production workflow runbook](../PRODUCTION_MIGRATION_WORKFLOW.md) now distinguishes
the environment secret `PRODUCTION_READONLY_DATABASE_URL` from the repository Actions
variables `NEON_PRODUCTION_HOST` and `NEON_DATABASE_NAME`, with their source, purpose,
failure impact and authorized operator steps. It explains why candidate diagnostics
do not alter a privileged workflow executing trusted base code.

## Evidence

- `node --test scripts/production/safety.test.cjs`: 37/37 pass, including the missing
  input cases, read-only path and private-error assertions. GitHub and database
  dependencies in the parity fixtures are isolated; no external service was called.
- Mutation check: disabled the missing-input list; all 10 selected configuration
  assertions failed. Restored the list and the full 37-test suite passed again.
- Git diff against PR #54's branch for the two script files: no differences after
  restoration. Original branch head still `eaa0befc1e2ef12a0ce59e23a9796c2570daa437`.
- Editor diagnostics: no errors in either changed script.
- Staged whitespace and repository secrets checks pass before commit.

## Not exercised

No new production parity run, role creation, credential lookup, GitHub configuration
change, workflow dispatch, push, deployment or production access. The empty inputs
refer to the previously inspected run, not a new inspection of current settings.
No full build, typecheck or database suite was repeated: the change is isolated
CommonJS automation and documentation; checkpoint application evidence is unchanged.

## Observed, not changed

Production parity remains unverified. An authorized operator must supply verified
configuration through approved secret management and run the trusted workflow for
the intended exact PR head. Do not copy a writer credential or `.env` URL into the
read-only secret. Creating or repairing a read-only role requires separate approval.
