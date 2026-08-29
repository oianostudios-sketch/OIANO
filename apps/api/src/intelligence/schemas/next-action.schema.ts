// apps/api/src/intelligence/schemas/next-action.schema.ts
// Zod, matching the validation library already used everywhere else in
// apps/api. The model's raw text is parsed as JSON then run through this
// schema — anything that doesn't match fails safely (IntelligenceFailureReason
// 'invalid_response'), it never reaches application logic un-validated.

import { z } from 'zod';

export const NextActionResponseSchema = z.object({
  type: z.literal('NEXT_ACTION'),
  label: z.string().min(1).max(80),
  reason: z.string().min(1).max(240),
  confidence: z.number().min(0).max(1),
  entityType: z.literal('booking'),
  entityId: z.string().min(1),
});

export type NextActionResponse = z.infer<typeof NextActionResponseSchema>;
