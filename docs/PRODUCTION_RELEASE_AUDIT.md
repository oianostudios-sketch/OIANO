# OIANO production release audit

Audit date: 2026-08-28

## Decision

**NO-GO for public production traffic today.** The application and database compatibility gates are green, but operational configuration, a recent verified restore, full authenticated interaction QA, payment-provider production configuration, and final legal approval are not yet evidenced.

This is a controlled release hold, not an application-build failure.

## Verified passing gates

- Prisma schema validation passes.
- The repository baseline verifies at 41 tables and 55 foreign keys.
- The intended Neon `public` schema records all 10 repository migrations as applied.
- A clean isolated Neon schema (`oiano_test_20260828`) accepted all 10 migrations.
- The database-backed integration journey passed against that isolated schema.
- The journey covers signup/login/reset, wallet booking, payment ledger integrity, studio policies and accountable exceptions, session completion, credits, rights decisions, artist/professional/operator/maintenance metrics, tenant isolation and role denial.
- Security and intelligence suites pass: 53 tests.
- Shared package, API TypeScript and web production builds pass.
- `npm audit --omit=dev` reports zero known vulnerabilities.
- The tracked-file secret scan passes across 323 files.
- `git diff --check` reports no whitespace errors.
- The previous 815.60 kB Three.js advisory is obsolete. The login universe is now a small code-native renderer; the largest current JavaScript chunk is approximately 320 kB (105 kB gzip).

## Hardening completed in this audit

- Production environment validation now rejects short signing/encryption secrets, localhost or non-HTTPS frontend origins, database URLs without required TLS, stale restore evidence, and missing operations/legal contacts.
- Private artist files are relationship-scoped: artists access their own records; studio staff require the relevant studio relationship; assigned engineers receive read-only access.
- Private R2 objects are stored as private object references rather than public URLs. Upload completion verifies size and MIME type, unsafe active-content types are rejected, and downloads are forced as attachments.
- Stripe checkout verifies artist or studio ownership, studio scope, booking state and a safe positive amount.
- Stripe webhooks require paid status, expected currency and exact expected amount before fulfilment.
- Refund ledger posting uses an atomic claim so concurrent webhook deliveries cannot double-post the refund.
- Authentication checks the current database session version on every request; privileged MFA state is recoverable only through encrypted pending secrets.

## Required release blockers

1. Populate and independently verify the production variables required by `npm run operations:verify`: `SENTRY_DSN`, support/privacy/security contacts, on-call contact, backup location and restore date, legal entity/address/law, strong JWT/MFA secrets, a public HTTPS `FRONTEND_URL`, and TLS-enforced `DATABASE_URL`.
2. Create an encrypted backup outside Neon, restore it into an isolated branch, compare row counts, and run the application smoke journey. Record `BACKUP_RESTORE_TESTED_AT` only after this succeeds.
3. Complete keyboard-only, visible-focus, dialog focus/escape, 200% zoom, reduced-motion and real mutation tests across artist, producer, engineer, studio and administrator accounts. Administrator QA needs an authorised current TOTP.
4. Configure live Stripe keys and webhook endpoint only when payments are enabled; execute exact-amount payment, duplicate webhook, failure and refund reconciliation tests.
5. Obtain final professional approval for Terms, Privacy, refunds/cancellation, studio agreement, platform fees, and rights/credits notices. Current legal files are product drafts, not legal sign-off.
6. Configure monitoring delivery, alert ownership, incident escalation and customer-support routing; prove one test alert reaches the on-call owner.
7. Review and checkpoint the large mixed working tree into independently reversible changes before deployment.

## Release commands

```text
npm run security:secrets
npm run verify
npm run operations:verify
```

All three must pass from the exact release commit. A successful build alone is not permission to migrate data or accept public payments.
