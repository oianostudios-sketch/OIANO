// apps/api/src/intelligence/capabilities/next-action.ts
// V1's first capability. Suggests — never performs — the most useful next
// action for a single booking. Read-only by construction: nothing in this
// file ever calls prisma, and its return type carries no way to trigger a
// state change even if a caller wanted to.

import { isNextActionEnabled } from '../config';
import { IntelligenceProvider } from '../providers/provider.interface';
import { IntelligenceTimeoutError } from '../providers/claude.provider';
import { NextActionContext } from '../context/context-builder';
import { NextActionResponse, NextActionResponseSchema } from '../schemas/next-action.schema';
import { meetsConfidenceThreshold } from '../policies/confidence';
import { IntelligenceResult } from '../intelligence.types';
import { extractJson } from '../parseModelJson';

const SYSTEM_PROMPT = `You are a studio operations assistant for OIANO, a music studio booking platform.
Given structured facts about one completed or in-progress session, suggest the single most useful next
action for the studio or artist to take. You are not performing the action, only suggesting it.

Respond with ONLY a single JSON object, no markdown, no explanation outside the JSON, matching exactly:
{"type":"NEXT_ACTION","label":"short imperative label, max 8 words","reason":"one sentence, max 30 words, grounded only in the facts given","confidence":0.0-1.0,"entityType":"booking","entityId":"<the booking id given to you>"}

If nothing meaningful needs attention, still respond with the JSON object, using a low confidence value
(below 0.5) rather than omitting the response.`;

function buildUserPrompt(ctx: NextActionContext): string {
  return `Booking ${ctx.bookingId}:
- status: ${ctx.status}
- hours since session ended: ${ctx.hoursSinceEnd}
- payment status: ${ctx.paymentStatus ?? 'unknown'}
- session notes recorded: ${ctx.hasSessionNotes}
- quality rating: ${ctx.qualityRating ?? 'none'}
- deliverables: ${ctx.deliverableCount} total, ${ctx.pendingReviewDeliverables} pending review
- linked to a project: ${ctx.hasProject}
- credits: ${ctx.draftCredits} draft, ${ctx.confirmedCredits} confirmed
- rights agreements proposed (not yet approved): ${ctx.proposedRights}

entityId to use: ${ctx.bookingId}`;
}

export async function getNextAction(
  context: NextActionContext,
  provider: IntelligenceProvider,
): Promise<IntelligenceResult<NextActionResponse>> {
  if (!isNextActionEnabled()) return { ok: false, reason: 'disabled' };

  let raw: string;
  try {
    raw = await provider.generate({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(context),
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

  const validated = NextActionResponseSchema.safeParse(parsed);
  if (!validated.success) return { ok: false, reason: 'invalid_response' };
  if (validated.data.entityId !== context.bookingId) return { ok: false, reason: 'invalid_response' };

  if (!meetsConfidenceThreshold(validated.data.confidence)) {
    return { ok: false, reason: 'low_confidence' };
  }

  return { ok: true, data: validated.data };
}
