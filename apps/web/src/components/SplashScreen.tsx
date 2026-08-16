import { useEffect, useState } from 'react';
import OianoBrand from './OianoBrand';

// Bar heights as percentage (0–100) — symmetric, peaks in center
const BAR_HEIGHTS = [18, 28, 42, 62, 80, 92, 100, 96, 88, 72, 55, 36, 24, 16, 10];
// Slight offset so we get full stereo-width feel
const FULL_BARS = [...BAR_HEIGHTS, ...BAR_HEIGHTS.slice(0, -1).reverse()];

interface Props {
  onDone: () => void;
}

export default function SplashScreen({ onDone }: Props) {
  const [phase, setPhase] = useState<'enter' | 'logo' | 'tag' | 'exit'>('enter');

  useEffect(() => {
    // Timeline
    const t1 = setTimeout(() => setPhase('logo'), 600);   // waveform animating → show logo
    const t2 = setTimeout(() => setPhase('tag'),  1600);  // logo shown → show tagline
    const t3 = setTimeout(() => setPhase('exit'), 3000);  // hold → begin exit
    const t4 = setTimeout(() => onDone(),         3700);  // exit complete

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [onDone]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'opacity 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: phase === 'exit' ? 0 : 1,
        pointerEvents: phase === 'exit' ? 'none' : 'auto',
        userSelect: 'none',
      }}
    >
      {/* Pulse ring behind everything */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: 340,
              height: 340,
              borderRadius: '50%',
              border: '1px solid #5A9BCB',
              animation: `splashPulseRing 3.2s ease-out ${i * 0.9}s infinite`,
              opacity: 0,
            }}
          />
        ))}
      </div>

      {/* Logo + waveform stack */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, position: 'relative' }}>

        {/* Canonical OIANO signature */}
        <div
          style={{
            marginBottom: 6,
            animation: phase === 'logo' || phase === 'tag' || phase === 'exit'
              ? 'splashLogoReveal 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards'
              : 'none',
            opacity: phase === 'enter' ? 0 : undefined,
          }}
        >
          <OianoBrand variant="full" size={52} />
        </div>

        {/* Divider line */}
        <div style={{
          height: 1,
          background: 'linear-gradient(90deg, transparent, #5A9BCB44, transparent)',
          width: '100%',
          marginBottom: 10,
          animation: phase !== 'enter' ? 'splashSubReveal 0.6s 0.3s ease both' : 'none',
          opacity: phase === 'enter' ? 0 : undefined,
        }} />

        {/* Waveform visualizer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 3,
            height: 56,
            marginBottom: 16,
          }}
        >
          {FULL_BARS.map((h, i) => {
            const isAlt = i % 3 === 1;
            const delay = (i * 0.055) % 1.2;
            return (
              <div
                key={i}
                style={{
                  width: 3,
                  height: `${h}%`,
                  background: `linear-gradient(to top, #5A9BCB, #8BBEDD88)`,
                  borderRadius: 2,
                  transformOrigin: 'bottom',
                  animation: `${isAlt ? 'waveBarAlt' : 'waveBar'} ${0.8 + (i % 4) * 0.22}s ${delay}s ease-in-out infinite`,
                  opacity: 0.85,
                }}
              />
            );
          })}
        </div>

        {/* StudioOS subtitle */}
        <div
          style={{
            fontFamily: '"DM Sans", sans-serif',
            fontSize: 11,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: '#f5f5f5',
            opacity: phase === 'enter' || phase === 'logo' ? 0 : 0.55,
            transition: 'opacity 0.5s 0.15s',
            marginBottom: 28,
          }}
        >
          StudioOS
        </div>

        {/* Tagline */}
        <div
          style={{
            fontFamily: '"DM Sans", sans-serif',
            fontSize: 13,
            color: '#f5f5f5',
            letterSpacing: '0.04em',
            animation: phase === 'tag' || phase === 'exit'
              ? 'splashTagReveal 0.8s ease forwards'
              : 'none',
            opacity: phase === 'tag' || phase === 'exit' ? undefined : 0,
            textAlign: 'center',
          }}
        >
          Built by creators, for creators.
        </div>

      </div>

      {/* Corner version */}
      <div style={{
        position: 'absolute',
        bottom: 28,
        right: 28,
        fontSize: 10,
        letterSpacing: '0.12em',
        color: '#5A9BCB',
        opacity: 0.3,
        fontFamily: '"JetBrains Mono", monospace',
      }}>
        DREAMZ MUSIC LAB
      </div>
    </div>
  );
}
