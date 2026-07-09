// apps/api/src/services/ai-summary.service.ts
// Generates AI artist brief using Anthropic API
// Wired into GET /api/artists/:id/summary

import { Artist, ArtistPassport, SessionLog } from '@prisma/client';

type ArtistWithRelations = Artist & {
  passport: ArtistPassport | null;
  session_logs: SessionLog[];
};

type AnthropicMessageResponse = {
  content?: Array<{ text?: string }>;
};

export async function generateArtistSummary(artist: ArtistWithRelations): Promise<string> {
  const dna = (artist.passport?.creative_dna ?? {}) as Record<string, any>;

  const prompt = `You are an A&R consultant writing a concise artist brief for a music studio dashboard.

Artist: ${artist.name} ${artist.alias ? `(${artist.alias})` : ''}
Bio: ${artist.bio ?? 'Not provided'}
Genres: ${(dna.genres ?? []).join(', ') || 'Not specified'}
Influences: ${(dna.influences ?? []).join(', ') || 'Not specified'}
Vocal type: ${dna.vocal_type ?? 'Unknown'}
Energy profile: ${dna.energy_profile ?? 'Unknown'}
Key themes: ${(dna.key_themes ?? []).join(', ') || 'Not specified'}
Studio sessions: ${artist.session_logs.length}
Profile strength: ${artist.passport?.profile_strength ?? 0}%

Write a 3-sentence artist brief that captures their sound, potential, and what makes them compelling to work with. Be specific, not generic. Avoid clichés.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI summary failed: ${response.statusText}`);
  }

  const data = await response.json() as AnthropicMessageResponse;
  return data.content?.[0]?.text ?? 'Summary unavailable.';
}
