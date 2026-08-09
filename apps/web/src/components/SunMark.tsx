import { useMemo } from 'react';
import { useStudioState } from '../context/StudioState';

// ── OIANO sun mark ──────────────────────────────────────────────────────────
// A small glowing core shedding dust particles — replaces the plain "OIANO"
// wordmark where a compact brand mark is needed (e.g. the admin header).
// Reacts to the global studio-live signal (see StudioState context): while a
// session is running the core warms from gold to amber, pulses faster, and
// throws off quicker embers — the same "the studio is breathing" language as
// the ticker/live-bar, just carried into the brand mark itself.
// Pure CSS animation, no canvas — cheap enough to sit in a header forever.
// ─────────────────────────────────────────────────────────────────────────────
export default function SunMark({ size = 28 }: { size?: number }) {
  const { isLive } = useStudioState();

  const particles = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const angle = (i / 7) * Math.PI * 2 + Math.random() * 0.6;
    const dist  = 8 + Math.random() * 6;
    const baseDur = 2.6 + Math.random() * 1.4;
    return {
      key:   i,
      left:  `${50 + Math.cos(angle) * 20}%`,
      top:   `${50 + Math.sin(angle) * 20}%`,
      dx:    `${(Math.cos(angle) * dist * (isLive ? 1.25 : 1)).toFixed(1)}px`,
      dy:    `${(Math.sin(angle) * dist - (isLive ? 18 : 14)).toFixed(1)}px`, // net upward drift
      delay: `${(i * (isLive ? 0.26 : 0.42)).toFixed(2)}s`,
      dur:   `${(isLive ? baseDur * 0.6 : baseDur).toFixed(2)}s`,
    };
  }), [isLive]);

  return (
    <span
      className={`sun-mark${isLive ? ' sun-mark-live' : ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label="OIANO"
      title="OIANO"
    >
      <span className="sun-mark-core" />
      {particles.map((p) => (
        <span
          key={p.key}
          className="sun-mark-dust"
          style={{
            left: p.left,
            top: p.top,
            animationDelay: p.delay,
            animationDuration: p.dur,
            ['--dx' as string]: p.dx,
            ['--dy' as string]: p.dy,
            background: isLive ? '#ffb066' : undefined,
          } as React.CSSProperties}
        />
      ))}
    </span>
  );
}
