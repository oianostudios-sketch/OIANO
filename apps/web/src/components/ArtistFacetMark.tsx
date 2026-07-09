/**
 * ArtistFacetMark — quiet rarity signal next to an artist's name.
 * Rough (everyone) and Diamond (aspirational, never computed) render nothing —
 * a mark for everyone would be noise, not signal. No count, no rank, no
 * leaderboard: this is the whole feature, on purpose.
 */
const TIER_COLOR: Record<string, string> = {
  CUT: '#9fc3dd',
  PRECIOUS: '#2f9e6e',
  TRADED: '#D6567F',
};

const TIER_LABEL: Record<string, string> = {
  CUT: 'Cut',
  PRECIOUS: 'Precious',
  TRADED: 'Traded',
};

export default function ArtistFacetMark({ tier, size = 12 }: { tier?: string | null; size?: number }) {
  if (!tier || !TIER_COLOR[tier]) return null;

  return (
    <svg
      width={size} height={size} viewBox="0 0 14 14"
      style={{ flexShrink: 0, display: 'inline-block' }}
      role="img"
    >
      <title>{TIER_LABEL[tier]}</title>
      <path d="M7 1 L13 5 L11 13 L3 13 L1 5 Z" fill={TIER_COLOR[tier]} />
    </svg>
  );
}
