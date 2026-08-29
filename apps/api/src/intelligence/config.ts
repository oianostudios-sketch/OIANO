// apps/api/src/intelligence/config.ts
// The one place OIANO_AI_* env vars are read. Mirrors lib/env.ts's existing
// STRIPE_ENABLED convention (checked live at the point of use, not cached —
// see maintenance.routes.ts's identical `process.env.STRIPE_ENABLED === 'true'`
// pattern) rather than a feature-flag service. Master flag gates every
// capability flag, so turning OIANO_AI_ENABLED off restores normal Oiano
// behavior with no code changes anywhere else. Exported as functions, not
// frozen constants, so tests can flip process.env per-case.

export function isAiEnabled(): boolean {
  return process.env.OIANO_AI_ENABLED === 'true';
}

export function isNextActionEnabled(): boolean {
  return isAiEnabled() && process.env.OIANO_AI_NEXT_ACTION === 'true';
}

export function isSessionSummaryEnabled(): boolean {
  return isAiEnabled() && process.env.OIANO_AI_SESSION_SUMMARY === 'true';
}

export function isNavigationEnabled(): boolean {
  return isAiEnabled() && process.env.OIANO_AI_NAVIGATION === 'true';
}

export function getAnthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}

// Same model the existing ai-summary.service.ts already uses in production —
// deliberate consistency, not a new dependency to justify. Static, not
// env-driven, so plain constants are fine here.
export const AI_MODEL = 'claude-haiku-4-5-20251001';
export const AI_TIMEOUT_MS = 8000;
export const AI_MAX_TOKENS = 300;
