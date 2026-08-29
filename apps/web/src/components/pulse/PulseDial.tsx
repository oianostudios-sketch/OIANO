import { useEffect, useState } from 'react';

type PulseSession = {
  starts_at?: string;
  ends_at?: string;
  room?: { name: string } | null;
};

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

type PulseDialProps = {
  activeSession?: PulseSession;
  nextSession?: PulseSession | null;
  nextCountdown?: string | null;
  studioName?: string;
};

/** Live studio-state dial, isolated from the dashboard data orchestration. */
export default function PulseDial({ activeSession, nextSession, nextCountdown, studioName }: PulseDialProps) {
  const size = 148;
  const radius = 62;
  const centre = size / 2;
  const strokeWidth = 5;
  const isLive = Boolean(activeSession);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!activeSession?.starts_at || !activeSession.ends_at) {
      setProgress(0);
      return;
    }
    const calculate = () => {
      const start = new Date(activeSession.starts_at!).getTime();
      const end = new Date(activeSession.ends_at!).getTime();
      setProgress(Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100)));
    };
    calculate();
    const timer = window.setInterval(calculate, 10_000);
    return () => window.clearInterval(timer);
  }, [activeSession]);

  const accent = isLive ? '#E8823A' : nextSession ? '#5A9BCB' : '#1D9E75';
  const angle = Math.min(359.99, (progress / 100) * 360);
  const radians = (angle - 90) * (Math.PI / 180);
  const startRadians = -Math.PI / 2;
  const startX = centre + radius * Math.cos(startRadians);
  const startY = centre + radius * Math.sin(startRadians);
  const endX = centre + radius * Math.cos(radians);
  const endY = centre + radius * Math.sin(radians);
  const largeArc = angle > 180 ? 1 : 0;
  const minutesLeft = isLive && activeSession?.ends_at
    ? Math.max(0, Math.round((new Date(activeSession.ends_at).getTime() - Date.now()) / 60_000))
    : null;
  const stateLabel = isLive ? 'In session' : nextSession ? 'Studio ready' : 'Studio open';
  const primaryText = isLive ? formatMinutes(minutesLeft ?? 0) : nextSession ? (nextCountdown ?? '—') : '—';
  const secondaryText = isLive ? 'remaining' : nextSession ? 'until next session' : '';
  const sweepRadians = (34 - 90) * (Math.PI / 180);
  const sweepEndX = centre + radius * Math.cos(sweepRadians);
  const sweepEndY = centre + radius * Math.sin(sweepRadians);
  const sweepPath = `M${startX.toFixed(2)},${startY.toFixed(2)} A${radius},${radius},0,0,1,${sweepEndX.toFixed(2)},${sweepEndY.toFixed(2)}`;

  return (
    <div className={`pulse-dial${isLive ? ' pulse-dial-live' : ''}`}>
      <svg className="pulse-vinyl" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`${studioName ?? 'Oiano Studio'} vinyl status`}>
        <defs>
          <radialGradient id="vinylFace" cx="38%" cy="30%"><stop offset="0" stopColor="#24282d"/><stop offset=".42" stopColor="#111316"/><stop offset="1" stopColor="#030405"/></radialGradient>
          <radialGradient id="vinylLabel" cx="38%" cy="32%"><stop offset="0" stopColor="#e1c86f"/><stop offset="1" stopColor="#8d7130"/></radialGradient>
        </defs>
        <g className="pulse-vinyl-rotor">
          <circle cx={centre} cy={centre} r="58" fill="url(#vinylFace)" stroke="#ffffff12" strokeWidth="1"/>
          {[52, 48, 43, 38].map(groove => <circle key={groove} cx={centre} cy={centre} r={groove} fill="none" stroke="#ffffff10" strokeWidth=".7"/>)}
          <path d="M34 47 A48 48 0 0 1 96 31" fill="none" stroke="#ffffff16" strokeWidth="2" strokeLinecap="round"/>
          <circle cx={centre} cy={centre} r="22" fill="url(#vinylLabel)" stroke="#f4dea050" strokeWidth="1"/>
          <circle cx={centre} cy={centre} r="3" fill="#08090a" stroke="#fff4c755" strokeWidth="1"/>
        </g>
        <circle cx={centre} cy={centre} r={radius} fill="none" stroke="#1a1a1a" strokeWidth={strokeWidth}/>
        <g className="pulse-dial-sweep-rotor" style={{ color: accent }}>
          <path d={sweepPath} fill="none" stroke={accent} strokeWidth={strokeWidth * 0.55} strokeLinecap="round" opacity={0.5}/>
        </g>
        {isLive && progress > 0 && <path d={`M${startX.toFixed(2)},${startY.toFixed(2)} A${radius},${radius},0,${largeArc},1,${endX.toFixed(2)},${endY.toFixed(2)}`} fill="none" stroke={accent} strokeWidth={strokeWidth} strokeLinecap="round"/>}
        {!isLive && (
          <circle className="pulse-dial-breathe" cx={centre} cy={centre} r={radius} fill="none" stroke={accent} strokeWidth={strokeWidth} />
        )}
      </svg>
      <div className="pulse-vinyl-brand" aria-hidden="true"><span>{studioName ?? 'OIANO STUDIO'}</span><i>OIANO · PULSE</i></div>
      <div className="pulse-dial-center">
        <span className="pulse-dial-state" style={{ color: accent }}>{stateLabel}</span>
        <span className="pulse-dial-big">{primaryText}</span>
        {secondaryText && <span className="pulse-dial-sub">{secondaryText}</span>}
        {nextSession?.room?.name && !isLive && <span className="pulse-dial-room">{nextSession.room.name}</span>}
      </div>
    </div>
  );
}
