// apps/api/src/intelligence/intelligence.types.ts
// Shared types for the intelligence layer. Every capability returns an
// IntelligenceResult so callers can always distinguish "no suggestion" from
// "here's a suggestion" without throwing — AI failure must never surface as
// an application error.

export type IntelligenceFailureReason =
  | 'disabled'          // capability flag (or master flag) is off
  | 'unavailable'       // provider not configured, network/HTTP error
  | 'timeout'           // provider took longer than AI_TIMEOUT_MS
  | 'invalid_response'  // model output didn't parse or didn't match the schema
  | 'low_confidence';   // parsed fine, but below the confidence policy threshold

export type IntelligenceResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: IntelligenceFailureReason };

export interface IntelligenceMeta {
  capability: string;
  requestedAt: string; // ISO timestamp
  model?: string;
}
