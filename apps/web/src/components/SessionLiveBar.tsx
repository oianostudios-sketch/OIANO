import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudioState } from '../context/StudioState';

function fmtTime(iso?: string) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function useCountdown(endsAt?: string) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    if (!endsAt) { setRemaining(''); return; }
    function calc() {
      const ms = new Date(endsAt as string).getTime() - Date.now();
      if (ms <= 0) { setRemaining('ending'); return; }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1_000);
      if (h > 0) setRemaining(`${h}h ${String(m).padStart(2,'0')}m`);
      else if (m > 0) setRemaining(`${m}m ${String(s).padStart(2,'0')}s`);
      else setRemaining(`${s}s`);
    }
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return remaining;
}

export default function SessionLiveBar() {
  const { isLive, activeSession } = useStudioState();
  const navigate = useNavigate();
  const remaining = useCountdown(activeSession?.ends_at);
  const [visible, setVisible] = useState(false);

  // Animate in/out
  useEffect(() => {
    if (isLive) setVisible(true);
    else {
      const t = setTimeout(() => setVisible(false), 400);
      return () => clearTimeout(t);
    }
  }, [isLive]);

  if (!visible) return null;

  const artist = activeSession?.artist?.name ?? 'Session';
  const room   = activeSession?.room?.name ?? 'Studio';
  const starts = fmtTime(activeSession?.starts_at);
  const ends   = fmtTime(activeSession?.ends_at);

  // Show to all roles
  return (
    <>
      <style>{BAR_CSS}</style>
      <div
        className={`slb-bar ${isLive ? 'slb-in' : 'slb-out'}`}
        onClick={() => activeSession?.id && navigate(`/bookings/${activeSession.id}`)}
        role="button"
        tabIndex={0}
        title="View session details"
      >
        {/* Pulse dot */}
        <span className="slb-dot" />

        {/* Label */}
        <span className="slb-pill">● SESSION LIVE</span>
        <span className="slb-divider">·</span>
        <span className="slb-artist">{artist}</span>
        <span className="slb-divider">·</span>
        <span className="slb-room">{room}</span>
        <span className="slb-divider">·</span>
        <span className="slb-time">{starts} → {ends}</span>

        {/* Countdown */}
        {remaining && (
          <>
            <span className="slb-divider">·</span>
            <span className="slb-remaining">{remaining} left</span>
          </>
        )}

        <span style={{ flex: 1 }} />
        <span className="slb-click-hint">View ↗</span>
      </div>
    </>
  );
}

const BAR_CSS = `
  @keyframes slb-slide-in {
    from { opacity: 0; transform: translateY(-100%); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes slb-slide-out {
    from { opacity: 1; transform: translateY(0); }
    to   { opacity: 0; transform: translateY(-100%); }
  }

  .slb-bar {
    position: fixed;
    top: 28px; /* below StudioTicker */
    left: 0; right: 0;
    height: 32px;
    z-index: 900;
    display: flex; align-items: center; gap: 10px;
    padding: 0 16px;
    background: linear-gradient(90deg, #0f0d08 0%, #131008 60%, #0f0d08 100%);
    border-bottom: 1px solid #C9A84C30;
    cursor: pointer;
    overflow: hidden;
  }
  .slb-in  { animation: slb-slide-in  240ms cubic-bezier(0.16,1,0.3,1) forwards; }
  .slb-out { animation: slb-slide-out 200ms ease forwards; }

  /* Animated shimmer */
  .slb-bar::before {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent 0%, #C9A84C06 50%, transparent 100%);
    background-size: 200% 100%;
    animation: slb-shimmer 3s linear infinite;
  }
  @keyframes slb-shimmer {
    from { background-position: 200% 0; }
    to   { background-position: -200% 0; }
  }

  .slb-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #C9A84C; box-shadow: 0 0 6px #C9A84C;
    flex-shrink: 0; position: relative;
    animation: slb-dot-pulse 1.6s ease-in-out infinite;
  }
  @keyframes slb-dot-pulse {
    0%, 100% { box-shadow: 0 0 4px #C9A84C; }
    50%       { box-shadow: 0 0 12px #C9A84C, 0 0 24px #C9A84C40; }
  }

  .slb-pill {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px; letter-spacing: 0.12em;
    color: #C9A84C; flex-shrink: 0;
  }
  .slb-divider { color: #2a2a2a; font-size: 10px; flex-shrink: 0; }
  .slb-artist  { font-size: 12px; color: #e4e4e7; font-weight: 600; flex-shrink: 0; }
  .slb-room    { font-size: 11px; color: #71717a; flex-shrink: 0; }
  .slb-time    { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #555; flex-shrink: 0; }
  .slb-remaining { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #C9A84C88; flex-shrink: 0; }
  .slb-click-hint { font-size: 10px; color: #2a2a2a; flex-shrink: 0; transition: color 0.15s; }
  .slb-bar:hover .slb-click-hint { color: #C9A84C88; }
`;
