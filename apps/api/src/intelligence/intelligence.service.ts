// apps/api/src/intelligence/intelligence.service.ts
// The single entry point every route calls through — per Stage 2, no route
// or component should import a provider or capability file directly. This
// module owns provider instantiation, timing, and telemetry so capability
// files stay focused on prompt/schema/policy logic only.

import { isAiEnabled } from './config';
import { ClaudeProvider } from './providers/claude.provider';
import { IntelligenceProvider } from './providers/provider.interface';
import { getNextAction as runNextAction } from './capabilities/next-action';
import { getSessionSummary as runSessionSummary } from './capabilities/session-summary';
import { getNavigationRecommendation as runNavigation } from './capabilities/navigation';
import { NextActionContext, SessionSummaryContext, NavigationContext } from './context/context-builder';
import { NextActionResponse } from './schemas/next-action.schema';
import { SessionSummaryResponse } from './schemas/session-summary.schema';
import { NavigationResponse } from './schemas/navigation.schema';
import { IntelligenceResult } from './intelligence.types';
import { logIntelligenceCall } from './telemetry';

// One shared provider instance — stateless, safe to reuse across requests.
const provider: IntelligenceProvider = new ClaudeProvider();

export async function getNextAction(context: NextActionContext): Promise<IntelligenceResult<NextActionResponse>> {
  if (!isAiEnabled()) return { ok: false, reason: 'disabled' };

  const start = Date.now();
  const result = await runNextAction(context, provider);
  logIntelligenceCall('next_action', context.bookingId, result, Date.now() - start);
  return result;
}

export async function getSessionSummary(context: SessionSummaryContext): Promise<IntelligenceResult<SessionSummaryResponse>> {
  if (!isAiEnabled()) return { ok: false, reason: 'disabled' };

  const start = Date.now();
  const result = await runSessionSummary(context, provider);
  logIntelligenceCall('session_summary', context.bookingId, result, Date.now() - start);
  return result;
}

export async function getNavigationRecommendation(context: NavigationContext, studioId: string): Promise<IntelligenceResult<NavigationResponse>> {
  if (!isAiEnabled()) return { ok: false, reason: 'disabled' };

  const start = Date.now();
  const result = await runNavigation(context, provider);
  logIntelligenceCall('navigation', studioId, result, Date.now() - start);
  return result;
}
