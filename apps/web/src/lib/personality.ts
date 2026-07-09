// apps/web/src/lib/personality.ts
//
// Single source of truth for the artist "personality" system — the third,
// declared axis on the passport alongside the passport code (provenance,
// permanent) and the facet-mark tier (merit, assessed). Personality is
// self-expressed: what the artist says they sound like.
//
// Keyed by the existing ArtistPassport.creative_dna.energy_profile storage
// values (high/medium/low/chaotic) — no data migration, only the display
// layer changes. Previously ArtistPassportCard.tsx and DiscoverPage.tsx each
// hardcoded their own, mutually inconsistent color map; this replaces both.
export type PersonalityKey = 'high' | 'medium' | 'low' | 'chaotic';

export interface Personality {
  label: string;
  color: string;              // hex
  rgb: string;                 // "r,g,b" — for building rgba() at custom opacity
  shimmerDuration: string;      // CSS animation-duration
  shimmerEasing: string;        // CSS animation-timing-function
  shimmerKeyframe: 'apc-shimmer-sweep' | 'apc-shimmer-stutter';
}

export const PERSONALITIES: Record<PersonalityKey, Personality> = {
  high: {
    label: 'Radiant',
    color: '#E8823A',
    rgb: '232,130,58',
    shimmerDuration: '3.2s',
    shimmerEasing: 'ease-in-out',
    shimmerKeyframe: 'apc-shimmer-sweep',
  },
  medium: {
    label: 'Steady',
    color: '#5A9BCB',
    rgb: '90,155,203',
    shimmerDuration: '6s',
    shimmerEasing: 'ease-in-out',
    shimmerKeyframe: 'apc-shimmer-sweep',
  },
  low: {
    label: 'Introspective',
    color: '#6366f1',
    rgb: '99,102,241',
    shimmerDuration: '10s',
    shimmerEasing: 'ease-in-out',
    shimmerKeyframe: 'apc-shimmer-sweep',
  },
  chaotic: {
    label: 'Volatile',
    color: '#9d5fd6',
    rgb: '157,95,214',
    shimmerDuration: '4.4s',
    shimmerEasing: 'cubic-bezier(0.6,0,0.4,1)',
    shimmerKeyframe: 'apc-shimmer-stutter',
  },
};

// Steady is the default — an artist with no declared energy blends into the
// standard Dome-blue card exactly, rather than reading as a fifth, undefined
// color.
export const DEFAULT_PERSONALITY_KEY: PersonalityKey = 'medium';

export function getPersonality(energyProfile?: string | null): Personality {
  const key = (energyProfile ?? '').trim().toLowerCase() as PersonalityKey;
  return PERSONALITIES[key] ?? PERSONALITIES[DEFAULT_PERSONALITY_KEY];
}
