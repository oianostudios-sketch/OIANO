import { useMemo, useRef } from 'react';
import { CX, CY, polar, R, WAVE_HEIGHTS, WAVE_N } from './smartClockModel';

export function ClockDefs({ color }: { color: string }) {
  return (
    <defs>
      <radialGradient id="ck-face-bg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#151210" />
        <stop offset="100%" stopColor="#0a0a08" />
      </radialGradient>
      <radialGradient id="ck-face-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={color} stopOpacity={0.1} />
        <stop offset="65%" stopColor={color} stopOpacity={0.03} />
        <stop offset="100%" stopColor={color} stopOpacity={0} />
      </radialGradient>
      <filter id="ck-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="ck-glow-tight" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="ck-glow-strong" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  );
}

export function SpinRings({ color, active }: { color: string; active: boolean }) {
  const origin = `${CX}px ${CY}px`;
  const [slowDash, fastDash] = active ? ['12 22', '4 20'] : ['8 30', '2 28'];
  const [slowOpacity, fastOpacity] = active ? [0.25, 0.15] : [0.13, 0.08];
  const [slowSeconds, fastSeconds] = active ? [28, 18] : [70, 45];

  return (
    <>
      <g style={{ transformOrigin: origin, animation: `ck-cw ${slowSeconds}s linear infinite` }}>
        <circle cx={CX} cy={CY} r={R.decoA} fill="none" stroke={color} strokeWidth={1.2} strokeOpacity={slowOpacity} strokeDasharray={slowDash} />
      </g>
      <g style={{ transformOrigin: origin, animation: `ck-ccw ${fastSeconds}s linear infinite` }}>
        <circle cx={CX} cy={CY} r={R.decoB} fill="none" stroke={color} strokeWidth={0.8} strokeOpacity={fastOpacity} strokeDasharray={fastDash} />
      </g>
      <g style={{ transformOrigin: origin, animation: `ck-cw ${active ? 12 : 22}s linear infinite` }}>
        <circle cx={CX} cy={CY - R.decoA} r={active ? 3.5 : 2.5} fill={color} fillOpacity={active ? 0.95 : 0.55} filter={active ? 'url(#ck-glow-tight)' : undefined} />
      </g>
      <g style={{ transformOrigin: origin, animation: `ck-ccw ${active ? 18 : 35}s linear infinite` }}>
        <circle cx={CX} cy={CY + R.decoB} r={active ? 2.5 : 1.8} fill={color} fillOpacity={active ? 0.6 : 0.28} />
      </g>
    </>
  );
}

export function HourTicks({ color }: { color: string }) {
  const ticks = useMemo(() => Array.from({ length: 48 }, (_, index) => {
    const angle = (index / 48) * 360 - 90;
    const radians = angle * (Math.PI / 180);
    const isMajor = index % 12 === 0;
    const isMedium = index % 6 === 0;
    const innerRadius = R.decoA + 3;
    const outerRadius = isMajor ? innerRadius + 8 : isMedium ? innerRadius + 5 : innerRadius + 3;
    return {
      x1: CX + innerRadius * Math.cos(radians),
      y1: CY + innerRadius * Math.sin(radians),
      x2: CX + outerRadius * Math.cos(radians),
      y2: CY + outerRadius * Math.sin(radians),
      isMajor,
      isMedium,
    };
  }), []);

  return (
    <>
      {ticks.map((tick, index) => (
        <line key={index} x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} stroke={color}
          strokeWidth={tick.isMajor ? 1.5 : tick.isMedium ? 1 : 0.7}
          strokeOpacity={tick.isMajor ? 0.5 : tick.isMedium ? 0.28 : 0.12} strokeLinecap="round" />
      ))}
      {[0, 6, 12, 18].map(hour => {
        const point = polar((hour / 24) * 360, R.decoA + 14);
        return (
          <text key={hour} x={point.x} y={point.y} textAnchor="middle" dominantBaseline="middle"
            fontSize={8} fill={color} fillOpacity={0.35} fontFamily="'JetBrains Mono', monospace">
            {String(hour).padStart(2, '0')}
          </text>
        );
      })}
    </>
  );
}

export function WaveformRing({ offset, color }: { offset: number; color: string }) {
  return (
    <>
      {WAVE_HEIGHTS.map((_, index) => {
        const height = WAVE_HEIGHTS[(index + offset) % WAVE_N];
        const angle = ((index / WAVE_N) * 360) - 90;
        const radians = angle * (Math.PI / 180);
        const innerRadius = R.waveIn;
        const outerRadius = R.waveIn + height * (R.waveOut - R.waveIn);
        return (
          <line key={index}
            x1={CX + innerRadius * Math.cos(radians)} y1={CY + innerRadius * Math.sin(radians)}
            x2={CX + outerRadius * Math.cos(radians)} y2={CY + outerRadius * Math.sin(radians)}
            stroke={color} strokeWidth={1.8} strokeOpacity={0.3} strokeLinecap="round" />
        );
      })}
    </>
  );
}

export function SecondHand({ color }: { color: string }) {
  const delayRef = useRef(0);
  useMemo(() => {
    const date = new Date();
    delayRef.current = -(date.getSeconds() + date.getMilliseconds() / 1000);
  }, []);

  return (
    <g style={{
      transformOrigin: `${CX}px ${CY}px`,
      animation: 'ck-second-sweep 60s linear infinite',
      animationDelay: `${delayRef.current}s`,
    }}>
      <line x1={CX} y1={CY - 105} x2={CX} y2={CY + 22} stroke={color} strokeWidth={0.9} strokeOpacity={0.65} strokeLinecap="round" />
      <line x1={CX} y1={CY + 22} x2={CX} y2={CY + 32} stroke={color} strokeWidth={3} strokeOpacity={0.35} strokeLinecap="round" />
      <circle cx={CX} cy={CY} r={2.8} fill={color} fillOpacity={0.75} />
      <circle cx={CX} cy={CY} r={1.3} fill="#0a0a08" />
    </g>
  );
}
