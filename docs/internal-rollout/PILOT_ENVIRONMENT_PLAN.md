# Isolated pilot environment plan

2026-10-27. **Planning approved; provisioning, deployment and external access are
not approved.** The owner selected an isolated staging/pilot environment, then
authorized repository-only inspection and this setup plan using the existing
Render stack. No cloud inventory, service URL or deployed revision was supplied.

## 1. What the repository establishes

| Evidence | What it establishes | What it does not establish |
|---|---|---|
| [Render blueprint](../../render.yaml) | One API and one static web service; API free plan, `NODE_ENV=staging`, health endpoint, Stripe/AI disabled; external values supplied outside Git | A second isolated pilot service pair, actual dashboard settings, current deployment or database/storage separation |
| [CI](../../.github/workflows/ci.yml) | Node 24 verification, disposable PostgreSQL integration tests and compiled API health check | A persistent browser-accessible pilot deployment |
| [Migration workflow](../../.github/workflows/production-migration.yml) | Approval-gated migration rehearsal with a disposable production-data copy | A synthetic-data participant sandbox; do not repurpose this workflow for pilot hosting |
| [Runtime validation](../../apps/api/src/lib/env.ts) | Basic required variables; stronger operational checks only when `NODE_ENV=production` | Readiness merely because a service starts under `staging` |
| [Operations verification](../../scripts/verify-production-readiness.js) | Configuration presence, strength, HTTPS/TLS and restore-date checks | Proof of backup restoration, isolation, email delivery or private media access |
| [Backup script](../../scripts/backup-database.ps1) | Logical dump and checksum manifest; reviewed expiry reporting | Scheduling, encryption, off-site storage, or a completed restore drill |

`NODE_ENV=staging` is a runtime label, not a data-isolation control. Repository
inspection cannot confirm whether an independently created cloud environment
already exists. No cloud API, live website, local environment file or credential
store was queried for this plan.

## 2. Proposed scope and decisions requiring approval

Keep the current API/static-web deployment model and existing domain behavior.
No canonical migration, new platform, default studio or permission expansion.
Proposed pilot resources are:

- A separately identified Render API and static web service, not edits to the
  current service pair. Use manual deployment of a reviewed, recorded commit;
  no automatic main-branch rollout or production custom-domain reassignment.
- A new empty pilot PostgreSQL database with a dedicated role, not the shared
  development database, production database or production-data rehearsal copy.
  Prefer a separate Neon project for a clear isolation boundary, subject to
  operator approval and inventory. No production data is needed.
- A dedicated R2 bucket with credentials restricted to that bucket. No shared
  production bucket, access key, media prefix or production public asset origin.
  Verify actual public/private URL behavior rather than assuming a private bucket
  setting alone preserves all existing upload paths.
- A separately scoped mail credential/sender or controlled mail service, with
  operator-enforced recipient restrictions to consenting test accounts. The
  existing mail code is not an environment-level recipient allowlist. If the
  provider cannot enforce a safe boundary, stop before enabling email.
- Separate JWT and MFA encryption secrets, generated/stored by the operator,
  never copied from production or committed. Separate pilot error reporting if
  enabled; do not send synthetic traces to a production project by default.
- For supervised sessions, an API hosting tier that stays available throughout
  the agreed window. Capacity, provider behavior and cost need operator approval;
  the checked-in free-tier setting is not evidence of pilot suitability.

Exact resource names, HTTPS addresses, region, account, budget, operator/support
identity, session duration and retention dates remain unassigned. Selecting
Render does not authorize creating billable services.

**Money scope is undecided.** Keep Stripe and AI off in the initial synthetic
environment. This does not make bookings free or prove cash/wallet paths safe.
Do not perform payment, payout, refund, wallet-funding or settlement actions.
Real participant work needs an explicit owner decision on payment scope.

Recommend `NODE_ENV=production` for a participant-facing service so that current
production guards and origin restrictions apply, even if the service is named
"pilot". This requires truthful operations/legal/support configuration and a
real recent restore, not invented dates or bypass values. A synthetic-only
bootstrap under `staging`, if necessary, requires separate approval and cannot
count as participant-readiness acceptance.

## 3. Execution sequence - future, separately authorized work

Each step records non-secret evidence privately. Do not execute this sequence
under the current planning authorization.

| Step | Prerequisite | Responsible action | Exit evidence / stop condition |
|---|---|---|---|
| P1 Inventory and approval | None | Operator inventories any existing isolated services and the current service pair; owner approves boundaries, budget, money scope and recovery owner | Named resource IDs and approved pilot scope without credentials. Stop if current/production ownership cannot be distinguished |
| P2 Define isolated resources | P1 | Prepare a separately reviewed pilot blueprint/configuration, dedicated DB/storage/mail boundaries and secret destinations | Explicit resource-to-environment mapping; no production resource references, wildcard shared credentials or main auto-deploy. No changes to the current blueprint by default |
| P3 Establish data and recovery | P2 plus explicit provisioning authorization | Provision approved resources; verify target identity before applying tracked migrations to the empty pilot DB; create synthetic fixtures and prove backup/restore on another isolated target | DB identity, migration revision and schema parity, dump checksum, protected backup location, restore counts and smoke results, measured recovery time. Stop on mismatch or unexpected existing data |
| P4 Build and deploy exact revision | P3 plus deployment authorization | Reuse relevant green CI, build shared/API/web artifacts, configure both origins, deploy only the reviewed commit to pilot services | Exact API/web commit IDs, HTTPS pairing, connected health, correct startup and routes. Stop if any frontend points to production or migrations are pending |
| P5 Rehearse external boundaries | P4 plus controlled-account/mail/storage authorization | Repeat critical browser journeys on pilot; verify bounded reconnect/retry, media privacy/persistence and approved mail delivery | Per-journey evidence, negative access checks, real received reset mail and isolated storage read-back. Generic success messages are not delivery evidence |
| P6 Owner go/no-go | P5, intake and accepted limitations | Owner reviews evidence, real identities/labels and payment scope; approves only the agreed five-person work slice | Named support/recovery owner, participant consent and explicit accepted scope. Any unresolved access, recovery or money issue blocks real use |

P2 must be reviewed before P3. Do not use the production migration or parity
workflows to create the pilot, read production data, or validate a pilot URL.
Canonical migration remains behind its existing production-parity gate.

### Configuration map

| Configuration | Secret? | Source and isolation requirement |
|---|---|---|
| `DATABASE_URL` | Yes | Dedicated pilot database role/connection supplied through the host's secret store, TLS required; verify database/project identity before any write |
| `JWT_SECRET`, `MFA_ENCRYPTION_KEY` | Yes | Fresh independent strong values, separate from each other and every other environment; preserve MFA key across approved pilot redeploys |
| `FRONTEND_URL` | No | Exact approved pilot web HTTPS origin used by CORS and generated links |
| `VITE_API_URL` | No, public build input | Pilot API HTTPS base origin without an added `/api`; [the client](../../apps/web/src/lib/api.ts) appends `/api`. Rebuild web after changing it |
| `NODE_ENV`, `STRIPE_ENABLED`, `OIANO_AI_ENABLED` | No | Proposed participant-facing mode `production`; Stripe/AI `false` for the synthetic phase; money scope still needs owner approval |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Yes | Dedicated bucket-scoped pilot credentials; no production access |
| `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | Non-secret identifiers/configuration | Approved pilot storage mapping, actual URL/public/private policy verified against current upload/download behavior |
| `SENDGRID_API_KEY` | Yes | Dedicated restricted mail credential with controlled recipients; never enable broad delivery merely to satisfy validation |
| `SENDGRID_FROM_EMAIL` | No | Approved verified sender; no invented address or unverified default from example files |
| `SENTRY_DSN` | Restricted integration configuration | Dedicated pilot reporting destination if enabled; operator supplies it through host configuration |
| Support/privacy/security contacts, on-call, legal identity/address/law | No credentials, but operator-owned | Truthful approved values required by runtime guards; placeholders are not evidence |
| `BACKUP_OUTPUT_DIR`, `BACKUP_RESTORE_TESTED_AT` | No credentials | Protected backup destination and actual successful restore timestamp; local ephemeral application disk is not the off-site backup policy |

Do not copy example environment values or seed credentials into a hosted service.
Never read or execute against the URLs in root or API local environment files.
The [operations verifier](../../scripts/verify-production-readiness.js) loads the
API environment file; any later execution must use an approved clean isolated
runner with no shared environment file, and only pilot configuration injected.
Do not run it in this checkout as a shortcut.

## 4. Verification contract

Before provisioning, inspect the final config for isolation and explicit manual
deployment. Reuse earlier full-suite evidence where the revision is unchanged;
run applicable CI on the exact candidate revision. This planning task does not
repeat the previously completed 264-test or 180-web-test checkpoints.

Before participant invitations, collect:

- HTTPS web entry, deep-link reload and correct web/API pairing. API health must
  return HTTP 200 with the database connected. Record compiled-service startup
  separately from the approximately 189-second instrumented local dev sample.
  For rehearsal use a bounded 300-second launch observation, not an unlimited
  wait; a startup banner or health response alone does not pass all gates.
- Separate-account invitation/onboarding/MFA, own-record and studio boundaries,
  project messaging, booking retry, attach/detach and reload persistence.
  Booking live-recipient/reconnect remains an explicit unverified journey.
- Physical phone: browser/OS and successful journey evidence on the pilot HTTPS
  origin after the owner reauthorizes this deferred check. No local LAN exposure.
- Dedicated bucket upload/download using synthetic, non-sensitive files at the
  intended realistic size; refuse unrelated and anonymous private-file access.
  Reopen after a restart/redeploy to prove files do not depend on ephemeral disk.
  Respect current limits; the artist-file cap is 200 MiB and contributor uploads
  are not supported. Do not widen these limits as environment setup.
- A received password-reset email to a controlled consenting account, successful
  reset and refusal of the old password. Contribution invitations are currently
  producer-shared links; do not claim that automatic invitation mail exists.
- Restored schema/counts plus authentication, booking and message smoke tests on
  a separately identified isolated restore target. Follow the
  [backup/recovery standard](../operations/BACKUP_AND_RECOVERY.md): prove the
  recovery objective, encryption and off-site retention, not just a dump file.
- Dated deployed-revision, support/recovery-owner and participant-boundary records.
  Keep raw evidence, credentials, private messages and participant mappings out
  of the public repository. Commit only sanitized acceptance results.

No private production data is needed for any of these checks. Do not load test or
send mail to a production endpoint under pilot authorization.

## 5. Stop, rollback and closeout

If isolation cannot be proved, stop before connecting the app. If a rehearsal
fails, pause invitations and preserve sanitized failure evidence; do not fall
back to production resources.

For code regression, operator may redeploy a previously approved compatible pilot
revision after authorization. Rolling code back does not reverse database
migrations. For data recovery, restore to a fresh isolated database first and
require reviewed approval before switching even the pilot connection. Never
overwrite production, run migration resets, or delete broadly as rollback.

Agree an end date and private-data retention policy before admitting participants.
After the trial, export only authorized evidence, revoke pilot credentials and
request explicit approval for resource deletion and billing shutdown. Names/IDs
must be checked individually; no automatic cleanup of production or shared
resources.

## 6. Next decision

Approve P1 inventory access and designate the operator/recovery owner, or have
that operator provide a non-secret inventory. Until then this is a reviewed
repository-based proposal, not proof of an existing staging environment or
authorization to build one.
