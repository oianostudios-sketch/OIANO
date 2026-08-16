import { CSSProperties } from 'react';

const API_ORIGIN = import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, '') ?? 'http://localhost:4000';

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A';
}

export function resolveArtistImage(src?: string | null) {
  if (!src) return null;
  if (src.startsWith('/images/')) return src;
  return src.startsWith('/') ? `${API_ORIGIN}${src}` : src;
}

export default function ArtistAvatar({
  src,
  name,
  size = 40,
  shape = 'circle',
  className = '',
  style,
  decorative = false,
}: {
  src?: string | null;
  name: string;
  size?: number | string;
  shape?: 'circle' | 'portrait';
  className?: string;
  style?: CSSProperties;
  decorative?: boolean;
}) {
  const image = resolveArtistImage(src);
  const radius = shape === 'circle' ? '50%' : '18%';
  const dimension = typeof size === 'number' ? `${size}px` : size;
  const common: CSSProperties = { width: dimension, height: dimension, borderRadius: radius, flexShrink: 0, ...style };

  if (image) return <img src={image} alt={decorative ? '' : name} className={`artist-avatar ${className}`} style={{ ...common, objectFit: 'cover', border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 10px 32px rgba(0,0,0,.28)' }} />;

  return (
    <div role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : `${name} portrait placeholder`} className={`artist-avatar artist-avatar-fallback ${className}`} style={{ ...common, position: 'relative', overflow: 'hidden', display: 'grid', placeItems: 'center', background: 'linear-gradient(145deg,#18242c 0%,#0b1014 58%,#171309 100%)', border: '1px solid rgba(106,169,210,.22)', boxShadow: '0 10px 32px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.045)' }}>
      <span aria-hidden="true" style={{ position: 'absolute', width: '72%', height: '72%', right: '-30%', top: '-30%', borderRadius: '50%', border: '1px solid rgba(211,179,92,.16)', boxShadow: '0 0 30px rgba(211,179,92,.08)' }} />
      <span aria-hidden="true" style={{ position: 'relative', color: '#b8d3e3', fontFamily: "'Playfair Display',serif", fontSize: `calc(${dimension} * .32)`, fontWeight: 600, letterSpacing: '-.04em', textShadow: '0 2px 14px rgba(0,0,0,.5)' }}>{initials(name)}</span>
    </div>
  );
}
