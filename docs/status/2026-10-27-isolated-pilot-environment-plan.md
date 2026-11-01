**T01/T05 now have an owner-selected isolated pilot direction and an approval-gated Render setup plan; no environment has been provisioned or verified.**

The owner selected an isolated staging/pilot environment, authorized repository
configuration inspection only, then requested a setup plan using the existing
Render stack. The [plan](../internal-rollout/PILOT_ENVIRONMENT_PLAN.md) records
that scope and separates planning from future inventory, provisioning,
deployment, integration testing and participant approval.

Repository inspection found one checked-in API/static-web service pair, with a
comment explicitly omitting the separate staging API. The `staging` runtime
label is not isolation evidence; it skips the production-only operations guards.
CI's disposable database and the production-data migration rehearsal are not
participant hosting environments. Actual cloud inventory remains unknown.

The proposal preserves the existing stack and architecture. It requires separate
pilot services, empty database and credentials, storage/mail boundaries, exact
reviewed API/web revisions, an actual restore drill, truthful runtime
configuration and explicit payment scope. It does not modify the blueprint,
workflows, migrations, runtime validation or financial behavior.

**Evidence:** inspected the Render/CI/migration definitions, runtime environment
validation, operations verifier, storage helper, backup script and recovery
standard. Changed-document local-link and whitespace checks and repository
secrets scan passed. No source changes; prior full test/build checkpoints were
not rerun for this documentation-only task.

**Not exercised:** cloud inventory, live URL, deployed revision, provisioning,
mail/storage/backup execution, payment flows, production parity, physical phone
and participant intake. No environment file, credentials or cloud account was
accessed; no push, deployment or participant contact.

**Observed, not changed:** the operations verifier loads the API environment
file. The plan forbids running it here as a shortcut; later validation must use
an approved clean isolated runner and injected pilot configuration.

Next: owner authorizes operator inventory or supplies a non-secret inventory
and assigns the operator/recovery owner. No infrastructure action is implicitly
authorized by this plan.
