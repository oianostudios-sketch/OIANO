// apps/api/src/intelligence/schemas/navigation.schema.ts
// Stage 5's hard constraint: "AI may influence ranking/prominence, not core
// access." Enforced here, not just by prompt wording — destinationId is a
// closed enum of routes that already exist in the product today (matching
// apps/web/src/components/CommandPalette.tsx's real STUDIO_ADMIN items). The
// model cannot invent a destination outside this list; Zod rejects it if it
// tries, which fails the whole response safely (invalid_response), same as
// any other malformed output.

import { z } from 'zod';

export const NAVIGATION_DESTINATION_IDS = ['pulse', 'runsheet', 'calendar', 'admin', 'book'] as const;

export const NavigationDestinationSchema = z.object({
  destinationId: z.enum(NAVIGATION_DESTINATION_IDS),
  reason: z.string().min(1).max(120),
  priority: z.number().int().min(1).max(NAVIGATION_DESTINATION_IDS.length),
});

export const NavigationResponseSchema = z.object({
  type: z.literal('NAVIGATION_INTELLIGENCE'),
  destinations: z.array(NavigationDestinationSchema).min(1).max(3),
  confidence: z.number().min(0).max(1),
});

export type NavigationResponse = z.infer<typeof NavigationResponseSchema>;
