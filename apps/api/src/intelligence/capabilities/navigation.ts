// apps/api/src/intelligence/capabilities/navigation.ts
// V1 capability 3. Ranks EXISTING destinations by current relevance — never
// invents one. The schema's destinationId enum (schemas/navigation.schema.ts)
// is the real enforcement of "AI may influence ranking/prominence, not core
// access"; this file's job is just prompting well within that hard boundary.

import { isNavigationEnabled } from '../config';
import { IntelligenceProvider } from '../providers/provider.interface';
import { IntelligenceTimeoutError } from '../providers/claude.provider';
import { NavigationContext } from '../context/context-builder';
import { NavigationResponse, NavigationResponseSchema, NAVIGATION_DESTINATION_IDS } from '../schemas/navigation.schema';
import { meetsConfidenceThreshold } from '../policies/confidence';
import { IntelligenceResult } from '../intelligence.types';
import { extractJson } from '../parseModelJson';

const SYSTEM_PROMPT = `You are a studio operations assistant for OIANO, a music studio booking platform.
Given aggregate counts about a studio's current activity, decide which of the studio's existing
navigation destinations most deserve visual prominence right now. You are ranking existing destinations,
never suggesting new ones.

The ONLY valid destinationId values are: ${NAVIGATION_DESTINATION_IDS.join(', ')}.
- pulse: live studio intelligence dashboard
- runsheet: today's session execution list
- calendar: room/capacity/conflict view
- admin: the studio operator dashboard
- book: create a new booking

Respond with ONLY a single JSON object, no markdown, no explanation outside the JSON, matching exactly:
{"type":"NAVIGATION_INTELLIGENCE","destinations":[{"destinationId":"...","reason":"one short clause, max 15 words","priority":1}],"confidence":0.0-1.0}
Return at most 3 destinations, priority 1 = most important. Only include a destination if there's a real
reason from the data given — do not pad the list to reach 3.`;

function buildUserPrompt(ctx: NavigationContext): string {
  return `Studio activity right now:
- pending bookings awaiting confirmation: ${ctx.pendingBookings}
- remaining sessions today: ${ctx.todaySessionsRemaining}
- deliverables pending artist review: ${ctx.pendingReviewDeliverables}
- credits still in draft: ${ctx.draftCredits}
- overdue payments: ${ctx.overduePayments}`;
}

export async function getNavigationRecommendation(
  context: NavigationContext,
  provider: IntelligenceProvider,
): Promise<IntelligenceResult<NavigationResponse>> {
  if (!isNavigationEnabled()) return { ok: false, reason: 'disabled' };

  let raw: string;
  try {
    raw = await provider.generate({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(context),
      maxTokens: 400,
    });
  } catch (err) {
    if (err instanceof IntelligenceTimeoutError) return { ok: false, reason: 'timeout' };
    return { ok: false, reason: 'unavailable' };
  }

  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch {
    return { ok: false, reason: 'invalid_response' };
  }

  const validated = NavigationResponseSchema.safeParse(parsed);
  if (!validated.success) return { ok: false, reason: 'invalid_response' };

  if (!meetsConfidenceThreshold(validated.data.confidence)) {
    return { ok: false, reason: 'low_confidence' };
  }

  return { ok: true, data: validated.data };
}
