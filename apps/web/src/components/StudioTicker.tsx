/**
 * StudioTicker — quiet cycling status strip.
 * One info item at a time, fading between them. No scrolling marquee.
 * Driven by StudioState context.
 */
import { useEffect, useState } from 'react';
import { useStudioState } from '../context/StudioState';

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function StudioTicker() {
  const { isLive, activeSession, todaySessions, roomStatus } = useStudioState();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  // Build the items to cycle through
  const items: { label: string; value: string; accent?: boolean }[] = [];

  if (isLive && activeSession) {
    items.push({ label: 'live', value: `${(activeSession as any).artist?.name ?? 'Session'} · ${(activeSession as any).room?.name ?? 'Studio'}`, accent: true });
  }

  roomStatus.forEach(r => {
    items.push({ label: r.name, value: r.busy ? 'in use' : 'open' });
  });

  const nextSession = todaySessions
    .filter(s => s.starts_at && new Date(s.starts_at).getTime() > Date.now())
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];

  if (nextSession) {
    items.push({ label: 'next session', value: `${fmtTime(nextSession.starts_at)} · ${nextSession.artist?.name ?? 'Artist'}` });
  } else {
    items.push({ label: 'today', value: `${todaySessions.filter(s => !['CANCELLED','NO_SHOW'].includes(s.status ?? '')).length} session${todaySessions.length !== 1 ? 's' : ''} booked` });
  }

  items.push({ label: 'studio', value: 'Dreamz Music Lab' });

  // Cycle every 4 seconds with a fade transition
  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex(i => (i + 1) % items.length);
        setVisible(true);
      }, 300);
    }, 4000);
    return () => clearInterval(id);
  }, [items.length]);

  const current = items[index % items.length];
  if (!current) return null;

  return (
    <div className="studio-ticker-strip">
      <span className="sts-dot" style={{ background: isLive ? 'var(--live-accent, #E8823A)' : '#22c55e' }} />
      <div
        className="sts-content"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease' }}
      >
        <span className="sts-label">{current.label}</span>
        <span className="sts-sep">·</span>
        <span className={`sts-value ${current.accent ? 'sts-accent' : ''}`}>{current.value}</span>
      </div>
    </div>
  );
}
