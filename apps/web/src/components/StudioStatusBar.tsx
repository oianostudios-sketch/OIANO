/**
 * StudioStatusBar — the single "is the studio live right now" indicator.
 * Replaces StudioTicker + SessionLiveBar + StudioPulseWidget, which were
 * three independently-mounted widgets all rendering the same underlying
 * StudioState fact (live session / next session / room status) at once.
 *
 * Live session in progress → detailed banner (artist, room, time, countdown,
 * click through to the booking). Otherwise → a quiet cycling ticker of
 * ambient status (room availability, next session, today's session count).
 */
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
      if (h > 0) setRemaining(`${h}h ${String(m).padStart(2, '0')}m`);
      else if (m > 0) setRemaining(`${m}m ${String(s).padStart(2, '0')}s`);
      else setRemaining(`${s}s`);
    }
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return remaining;
}

function LiveBanner() {
  const { activeSession } = useStudioState();
  const navigate = useNavigate();
  const remaining = useCountdown(activeSession?.ends_at);

  const artist = activeSession?.artist?.name ?? 'Session';
  const room   = activeSession?.room?.name ?? 'Studio';

  return (
    <div
      className="ssb-bar ssb-live"
      onClick={() => activeSession?.id && navigate(`/bookings/${activeSession.id}`)}
      role="button"
      tabIndex={0}
      title="View session details"
    >
      <span className="ssb-dot ssb-dot-live" />
      <span className="ssb-pill">● SESSION LIVE</span>
      <span className="ssb-divider">·</span>
      <span className="ssb-artist">{artist}</span>
      <span className="ssb-divider">·</span>
      <span className="ssb-room">{room}</span>
      <span className="ssb-divider">·</span>
      <span className="ssb-time">{fmtTime(activeSession?.starts_at)} → {fmtTime(activeSession?.ends_at)}</span>
      {remaining && (
        <>
          <span className="ssb-divider">·</span>
          <span className="ssb-remaining">{remaining} left</span>
        </>
      )}
      <span style={{ flex: 1 }} />
      <span className="ssb-click-hint">View ↗</span>
    </div>
  );
}

function AmbientTicker() {
  const { todaySessions, roomStatus, studioName } = useStudioState();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  const items: { label: string; value: string }[] = [];
  roomStatus.forEach((r) => {
    items.push({ label: r.name, value: r.busy ? 'in use' : 'open' });
  });

  const nextSession = todaySessions
    .filter((s) => s.starts_at && new Date(s.starts_at).getTime() > Date.now())
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];

  if (nextSession) {
    items.push({ label: 'next session', value: `${fmtTime(nextSession.starts_at)} · ${nextSession.artist?.name ?? 'Artist'}` });
  } else {
    items.push({ label: 'today', value: `${todaySessions.filter((s) => !['CANCELLED', 'NO_SHOW'].includes(s.status ?? '')).length} session${todaySessions.length !== 1 ? 's' : ''} booked` });
  }
  items.push({ label: 'studio', value: studioName });

  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % items.length);
        setVisible(true);
      }, 300);
    }, 4000);
    return () => clearInterval(id);
  }, [items.length]);

  const current = items[index % items.length];
  if (!current) return null;

  return (
    <div className="ssb-bar ssb-ambient">
      <span className="ssb-dot ssb-dot-ready" />
      <div className="ssb-ambient-content" style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease' }}>
        <span className="ssb-label">{current.label}</span>
        <span className="ssb-divider">·</span>
        <span className="ssb-value">{current.value}</span>
      </div>
    </div>
  );
}

export default function StudioStatusBar() {
  const { isLive } = useStudioState();
  return isLive ? <LiveBanner /> : <AmbientTicker />;
}
