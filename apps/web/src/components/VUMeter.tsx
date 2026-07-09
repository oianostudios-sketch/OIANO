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
      // Color: green 0–60%, amber 60–85%, red 85–100%
      let color: string;
      if (pct < 0.60) color = active ? '#4ade80' : '#22c55e40';
      else if (pct < 0.85) color = active ? '#C9A84C' : '#C9A84C40';
      else color = active ? '#ef4444' : '#ef444430';

      // How "lit" each bar is depends on active level and position
      const lit = active
        ? pct < 0.78 + Math.random() * 0.15
        : pct < 0.35 + Math.random() * 0.1;

      const dur = active
        ? `${0.25 + (i % 5) * 0.07}s`
        : `${1.0 + (i % 7) * 0.2}s`;

      return { color: lit ? color : color.replace(/[^#]+$/, '') + '18', dur, i };
    });
  }, [active, bars]);

  return (
    <div
      className={`vu-meter ${active ? 'live' : 'idle'} ${className}`}
      style={{ height }}
      aria-hidden="true"
    >
      {segments.map(({ color, dur, i }) => (
        <div
          key={i}
          className="vu-seg"
          style={{
            background: color,
            '--dur': dur,
            animationDelay: `${i * 0.02}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
