// apps/api/src/lib/sentry.ts
// SCALE_READINESS_ROADMAP.md Tier 0.5 — nothing in this codebase reported
// errors anywhere but its own console before this. Off by default and fully
// optional, matching every other optional-integration pattern here (R2,
// Stripe, the intelligence layer): absence of SENTRY_DSN just means
// captureError() is a no-op, never a startup failure.
import * as Sentry from '@sentry/node';

let initialized = false;

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({ dsn, environment: process.env.NODE_ENV ?? 'development', tracesSampleRate: 0 });
  initialized = true;
}

export function captureError(err: unknown) {
  if (!initialized) return;
  Sentry.captureException(err);
}
