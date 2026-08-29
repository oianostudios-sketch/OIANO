// apps/api/src/intelligence/policies/confidence.ts
// A suggestion below this bar is treated as no suggestion at all — showing a
// low-confidence "next action" is worse for trust than showing nothing.

export const MIN_CONFIDENCE = 0.55;

export function meetsConfidenceThreshold(confidence: number): boolean {
  return confidence >= MIN_CONFIDENCE;
}
