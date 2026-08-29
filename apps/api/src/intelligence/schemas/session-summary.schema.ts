// apps/api/src/intelligence/schemas/session-summary.schema.ts
// Stage 5's explicit requirement: separate known facts, inferred information,
// and suggested follow-up — an inference must never be presentable as a
// confirmed fact. Enforced structurally: three distinct arrays, not one blob
// of prose the frontend would have to parse apart itself.

import { z } from 'zod';

export const SessionSummaryResponseSchema = z.object({
  type: z.literal('SESSION_SUMMARY'),
  knownFacts: z.array(z.string().min(1).max(160)).max(8),
  inferredInsights: z.array(z.string().min(1).max(160)).max(5),
  suggestedFollowUp: z.array(z.string().min(1).max(120)).max(4),
  confidence: z.number().min(0).max(1),
  entityType: z.literal('booking'),
  entityId: z.string().min(1),
});

export type SessionSummaryResponse = z.infer<typeof SessionSummaryResponseSchema>;
