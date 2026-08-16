/**
 * VUMeter — analog-style level meter.
 * Always animates. Speed and intensity scale with `active` prop.
 * Green → amber → red segments like a real console meter.
 */
import { useMemo } from 'react';

interface Props {
  active?: boolean;
  bars?: number;
  height?: number;
  className?: string;
}

export default function VUMeter({ active = false, bars = 20, height = 32, className = '' }: Props) {
  const segments = useMemo(() => {
    return Array.from({ length: bars }, (_, i) => {
      const pct = i / bars;
      const color = !active
        ? '#1D9E75'
        : pct < 0.68 ? '#5A9BCB' : pct < 0.88 ? '#C9A84C' : '#E8823A';
      const lit = active ? pct < 0.82 : i < Math.max(2, Math.round(bars * 0.28));
      return { color, lit, i };
    });
  }, [active, bars]);

  return (
    <div
      className={`vu-meter ${active ? 'live' : 'idle'} ${className}`}
      style={{
        height,
        display: 'grid',
        gridTemplateColumns: `repeat(${bars}, minmax(2px, 1fr))`,
        alignItems: 'stretch',
        gap: 2,
      }}
      role="img"
      aria-label={active ? 'Studio in use — active session' : 'Studio ready — no active session'}
    >
      {segments.map(({ color, lit, i }) => (
        <div
          key={i}
          className="vu-seg"
          style={{
            background: color,
            borderRadius: 2,
            opacity: lit ? (active ? 0.72 : 0.48) : 0.09,
            boxShadow: lit ? `0 0 ${active ? 7 : 3}px ${color}55` : 'none',
            transform: active && lit ? `scaleY(${0.62 + ((i * 7) % 5) * 0.09})` : 'scaleY(1)',
            transformOrigin: 'bottom',
            animationName: active && lit ? 'breath' : 'none',
            animationDuration: `${0.72 + (i % 4) * 0.12}s`,
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: active && lit ? 'infinite' : '1',
            animationDelay: `${i * 0.035}s`,
            transition: 'background .25s ease, opacity .25s ease, transform .25s ease',
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
