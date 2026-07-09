/**
 * StudioPulseWidget — ambient studio state badge, visible on every screen.
 * Floats in the top-right corner. Driven by StudioState context.
 * Shows: LIVE artist+room | NEXT session time | STUDIO READY
 */
import { useState } from 'react';
import { useStudioState } from '../context/StudioState';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function minsUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export default function StudioPulseWidget() {
  const { isLive, activeSession, todaySessions } = useStudioState();
  const [expanded, setExpanded] = useState(false);

  const nextSession = !isLive
    ? todaySessions
        .filter(s => s.starts_at && new Date(s.starts_at).getTime() > Date.now())
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0]
    : null;

  return (
    <div
      className="studio-pulse-widget"
      onClick={() => setExpanded(e => !e)}
      title="Studio state — click to expand"
    >
      {isLive ? (
        /* ── LIVE ── */
        <div className="spw-live">
          <span className="spw-dot spw-dot-live" />
          <span className="spw-label">LIVE</span>
          {expanded && activeSession && (
            <span className="spw-detail">
              {(activeSession as any).artist?.name ?? 'Session'}
              {' · '}
              {(activeSession as any).room?.name ?? 'Studio'}
            </span>
          )}
        </div>
      ) : nextSession ? (
        /* ── NEXT SESSION ── */
        <div className="spw-next">
          <span className="spw-dot spw-dot-ready" />
          <span className="spw-label">NEXT</span>
          <span className="spw-time">{formatTime(nextSession.starts_at)}</span>
          {expanded && (
            <span className="spw-detail">
              in {minsUntil(nextSession.starts_at)}
              {' · '}
              {nextSession.artist?.name ?? 'Artist'}
            </span>
          )}
        </div>
      ) : (
        /* ── IDLE ── */
        <div className="spw-idle">
          <span className="spw-dot spw-dot-idle" />
          {expanded ? <span className="spw-label">STUDIO READY</span> : <span className="spw-label">◎</span>}
        </div>
      )}
    </div>
  );
}
