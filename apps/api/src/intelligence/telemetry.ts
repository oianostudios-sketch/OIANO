// apps/api/src/intelligence/telemetry.ts
// One structured JSON log line per intelligence call, matching
// middleware/error.middleware.ts's existing logging convention exactly —
// this codebase has no event bus or APM (see the Stage 1 audit), so a new
// telemetry system would be over-building. Never logs the prompt or the raw
// model response — only what's needed to answer "why did/didn't the user see
// a suggestion," which is the Stage 8 requirement.

import { IntelligenceResult } from './intelligence.types';

export function logIntelligenceCall(
  capability: string,
  entityId: string,
  result: IntelligenceResult<unknown>,
  latencyMs: number,
) {
  const line = {
    timestamp: new Date().toISOString(),
    capability,
    entityId,
    ok: result.ok,
    reason: result.ok ? undefined : result.reason,
    confidence: result.ok && typeof (result.data as any)?.confidence === 'number' ? (result.data as any).confidence : undefined,
    latencyMs,
  };
  console.log(JSON.stringify({ intelligence: line }));
}
