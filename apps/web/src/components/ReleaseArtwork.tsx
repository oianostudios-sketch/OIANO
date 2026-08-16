import { CSSProperties } from 'react';
import { resolveArtistImage } from './ArtistAvatar';

const PALETTES = [
  ['#16334a', '#090c10', '#c6a44d'],
  ['#39233f', '#0b0910', '#6aa9d2'],
  ['#263c35', '#080d0b', '#d3b35c'],
  ['#3d291d', '#0c0907', '#779fc1'],
];

function paletteFor(title: string) {
  const hash = [...title].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return PALETTES[hash % PALETTES.length];
}

export default function ReleaseArtwork({ src, title, artist, size = 56, featured = false, style, className = '' }: { src?: string | null; title: string; artist?: string; size?: number | string; featured?: boolean; style?: CSSProperties; className?: string }) {
  const image = resolveArtistImage(src);
  const [tone, ink, accent] = paletteFor(title);
  const dimension = typeof size === 'number' ? `${size}px` : size;
  const common: CSSProperties = { width: dimension, height: dimension, borderRadius: '12%', flexShrink: 0, ...style };

  if (image) return <div className={`release-artwork ${className}`} style={{ ...common, position: 'relative', overflow: 'hidden', border: `1px solid ${featured ? 'rgba(211,179,92,.35)' : 'rgba(255,255,255,.1)'}`, boxShadow: featured ? '0 12px 35px rgba(211,179,92,.12)' : '0 10px 28px rgba(0,0,0,.25)' }}><img src={image} alt={`${title} artwork`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />{featured && <span style={{ position: 'absolute', right: 5, top: 5, width: 6, height: 6, borderRadius: '50%', background: '#d3b35c', boxShadow: '0 0 10px #d3b35c' }} />}</div>;

  return <div role="img" aria-label={`${title} artwork placeholder`} className={`release-artwork release-artwork-fallback ${className}`} style={{ ...common, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '10%', background: `radial-gradient(circle at 78% 18%, ${accent}55, transparent 28%), linear-gradient(145deg, ${tone}, ${ink} 68%)`, border: `1px solid ${featured ? `${accent}70` : 'rgba(255,255,255,.1)'}`, boxShadow: featured ? `0 12px 35px ${accent}18` : '0 10px 28px rgba(0,0,0,.25)' }}>
    <span aria-hidden="true" style={{ position: 'absolute', width: '72%', height: '72%', right: '-34%', top: '-30%', border: `1px solid ${accent}70`, borderRadius: '50%' }} />
    <span style={{ position: 'relative', color: '#f0ede6', fontFamily: "'Playfair Display',serif", fontWeight: 600, fontSize: `calc(${dimension} * .13)`, lineHeight: 1.05, letterSpacing: '-.025em', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{title}</span>
    {artist && <span style={{ position: 'relative', marginTop: 4, color: `${accent}cc`, fontSize: `calc(${dimension} * .055)`, textTransform: 'uppercase', letterSpacing: '.12em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artist}</span>}
  </div>;
}
