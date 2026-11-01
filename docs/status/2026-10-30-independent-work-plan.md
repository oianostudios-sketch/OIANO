**Independent work plan: validate and improve the current creative-work service without bypassing the canonical migration gate.**

Requested scope: complete the locally executable collaboration, existing-product,
migration-readiness and release-evidence work. This is a bounded verification and
repair batch, not authorization for production changes or an unlimited rewrite.

## Work packages

1. **Collaboration lifecycle:** add repeatable multi-account journeys for claimed
   invitations, acceptance, decline/correction, messages, removal, proposed credits
   and rights decisions. Verify persisted records and unrelated-account boundaries.
2. **Existing-product navigation/recovery:** correct confirmed legacy Passport
   redirects for each account role. Preserve routes, authentication returns and
   existing page permissions. Exercise affected controls and small-screen layouts.
   The real browser account-switch journey additionally exposed a shared query
   cache retaining the previous person's profile. Add an identity-scoped query
   boundary, remount private component state, cancel old reads and verify late
   results cannot enter the new account's cache.
3. **Local readiness:** canonical unit suites, fresh-database integration suite,
   both typechecks, full build, secrets scan, workflow safety tests and a
   migration/schema comparison on isolated local databases.
4. **Evidence and cleanup:** record command results and actual journey outcomes,
   residual gaps and production blockers; stop only task-owned application
   processes. Do not commit, push or stage unrelated shared changes.

## Testing strategy

- **Application:** mixed React SPA and Express API, Prisma/PostgreSQL.
- **Infrastructure:** repository-managed checkout-local real PostgreSQL, not
  Docker or SQLite. PostgreSQL-specific migrations and transactions must retain
  database fidelity. `db:local:status` confirmed this checkout's running server on
  55432. Docker command exists but its daemon is unavailable; Docker is not needed
  for the established local test runner.
- **Runtime:** Node 24.16.0 verified. Existing API integration tests use Node's test
  runner and real HTTP listeners. Reuse this infrastructure and add three runnable
  journey files, automatically included by `test:integration:local`.
- **Browser:** existing integrated Playwright browser against a task-owned local
  API/web pair. No package installation or new browser framework is required.
  Browser checks must use real local API data, not mocked responses, for persistence
  claims. If unavailable, record browser coverage as unverified, independently of
  the API tests.
- **Legacy assets:** existing contribution-invitations, project-message-updates,
  credit-record and lifecycle integration suites remain unchanged unless a
  confirmed defect requires a focused regression. Component suites remain in the
  canonical root `npm test` command. No test framework rewrite.
- **External dependencies:** Stripe/SendGrid/AI/R2/Sentry disabled and blanked;
  no real email, payment, upload or telemetry. PostgreSQL is real; API-to-web
  persistence is checked through HTTP and read-back, not a component mock.
- **Data:** unique synthetic accounts/projects per journey; fresh database names
  contain `test`. New helpers validate the local test target before importing the
  app. Close HTTP listeners and Prisma clients in teardown; retain disposable local
  databases as evidence, without deleting another task's databases.
- **Acceptance:** invited is not accepted; decline/correction grants no workspace;
  acceptance enables only authorized collaboration; removal revokes access;
  messages survive read-back; disputed/confirmed credit and rights states remain
  distinct; anonymous/outsider writes leave records unchanged. Legacy aliases send
  each role to an authorized existing destination.
- **Failure handling:** reproduce confirmed defects with failing tests, fix
  surgically, rerun the smallest affected suite before the full readiness batch.
  No green verdict if a command still fails. Record unexercised boundaries.

## Explicitly outside this batch

Production credentials/grants, workflow configuration, production parity dispatch
without prerequisites, canonical identity/organization/Work/Requirement schema
changes, public opportunity publishing and payment/settlement changes.

## Completion

All four work packages are complete within the boundaries above. See the
[execution evidence and remaining gaps](2026-10-30-independent-validation.md).
Local readiness cannot establish production parity or authorize migration.
