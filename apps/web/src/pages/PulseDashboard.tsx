/**
 * PulseDashboard — OIANO Command Centre
 * Discipline · Order · Sound
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import VUMeter from '../components/VUMeter';
import SmartClock from '../components/SmartClock/SmartClock';
import StudioIntelligencePanel, { PulseData } from '../components/StudioIntelligencePanel';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Artist {
  id: string; name: string; alias: string | null;
  email: string; genres: string[]; vocal_type: string | null; created_at: string;
}

interface Session {
  id: string; title?: string; starts_at?: string; ends_at?: string;
  status?: string; payment_status?: string; total_usd?: number | string | null;
  service?: { id?: string; name?: string } | null;
  artist?: { id: string; name: string; alias: string | null };
  room?: { id: string; name: string; room_type: string; status: string } | null;
  engineer?: { id?: string; name?: string } | null;
  notes?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sessionStart(s: Session)  { return s.starts_at ?? ''; }
function sessionTitle(s: Session)  { return s.service?.name ?? s.title ?? 'Studio session'; }
function sessionArtist(s: Session) { return s.artist?.name ?? 'Unknown'; }
function paymentAmount(s: Session) { return Number(s.total_usd ?? 0); }

function fmtTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function isToday(iso?: string) {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}
function initials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
function collection<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === 'object' && Array.isArray((v as any).data)) return (v as any).data;
  return [];
}
function fmtMins(m: number) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

// ── Animated counter ──────────────────────────────────────────────────────────

function useCounter(target: number, duration = 800) {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (target === prev.current) return;
    const start = prev.current; const diff = target - start;
    const t0 = performance.now();
    function step(now: number) {
      const t = Math.min((now - t0) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(start + diff * ease));
      if (t < 1) requestAnimationFrame(step);
      else { prev.current = target; setVal(target); }
    }
    requestAnimationFrame(step);
  }, [target, duration]);
  return val;
}

// ── Ticking clock ─────────────────────────────────────────────────────────────

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = now.getHours().toString().padStart(2, '0');
  const mm = now.getMinutes().toString().padStart(2, '0');
  const ss = now.getSeconds().toString().padStart(2, '0');
  return (
    <span className="cmd-clock">
      {hh}<span style={{ opacity: now.getSeconds() % 2 === 0 ? 1 : 0.25, transition: 'opacity 0.2s' }}>:</span>{mm}
      <span className="cmd-clock-sec">:{ss}</span>
    </span>
  );
}

// ── Session progress bar ──────────────────────────────────────────────────────

function SessionProgress({ session }: { session: Session }) {
  const [pct, setPct] = useState(0);
  const [minsLeft, setMinsLeft] = useState(0);
  useEffect(() => {
    function calc() {
      const start = new Date(session.starts_at!).getTime();
      const end   = new Date(session.ends_at!).getTime();
      const now   = Date.now();
      const p = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
      setPct(p);
      setMinsLeft(Math.max(0, Math.floor((end - now) / 60_000)));
    }
    calc();
    const id = setInterval(calc, 10_000);
    return () => clearInterval(id);
  }, [session]);
  return (
    <div className="sp-wrap">
      <div className="sp-track">
        <div className="sp-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="sp-labels">
        <span>{Math.round(pct)}% elapsed</span>
        <span>{fmtMins(minsLeft)} left</span>
      </div>
    </div>
  );
}

// ── Today timeline strip ──────────────────────────────────────────────────────

function TimelineStrip({ sessions }: { sessions: Session[] }) {
  const START_H = 8, END_H = 22, TOTAL = END_H - START_H;
  const nowPct = useMemo(() => {
    const now = new Date();
    return ((now.getHours() + now.getMinutes() / 60) - START_H) / TOTAL * 100;
  }, []);
  if (!sessions.length) return null;
  return (
    <div className="tl-wrap">
      <div className="tl-track">
        {nowPct >= 0 && nowPct <= 100 && (
          <div className="tl-now" style={{ left: `${nowPct}%` }} />
        )}
        {sessions.map(s => {
          const sh = new Date(s.starts_at!).getHours() + new Date(s.starts_at!).getMinutes() / 60;
          const eh = new Date(s.ends_at!).getHours()   + new Date(s.ends_at!).getMinutes()   / 60;
          const left  = Math.max(0, (sh - START_H) / TOTAL * 100);
          const width = Math.min(100 - left, (eh - sh) / TOTAL * 100);
          const colors: Record<string, string> = {
            CONFIRMED: '#1D9E75', PENDING: '#C9A84C',
            COMPLETED: '#3f3f46', CANCELLED: '#7f1d1d',
          };
          return (
            <div key={s.id} className="tl-block"
              title={`${sessionArtist(s)} · ${fmtTime(s.starts_at)}–${fmtTime(s.ends_at)}`}
              style={{ left: `${left}%`, width: `${Math.max(width, 1)}%`, background: colors[s.status ?? ''] ?? '#2a2a2a' }}
            />
          );
        })}
      </div>
      <div className="tl-labels">
        <span>8 AM</span><span>12</span><span>4 PM</span><span>10 PM</span>
      </div>
    </div>
  );
}

// ── Wave bars ─────────────────────────────────────────────────────────────────

const BAR_DELAYS  = [0, 0.18, 0.06, 0.28, 0.12, 0.35, 0.04, 0.22, 0.14, 0.32, 0.08, 0.25, 0.16, 0.38, 0.02, 0.20];
const BAR_HEIGHTS = [55, 80, 40, 90, 65, 45, 75, 50, 85, 60, 70, 48, 88, 35, 78, 58];

type WaveMode = 'active' | 'idle' | 'overrun' | 'off';

function RoomWave({ color, active, mode }: { color: string; active: boolean; mode?: WaveMode }) {
  const resolvedMode: WaveMode = mode ?? (active ? 'active' : 'idle');
  const animClass = { active:'rwb-active', idle:'rwb-idle', overrun:'rwb-over', off:'rwb-off' }[resolvedMode];
  return (
    <div className="room-wave-wrap" aria-hidden="true">
      {BAR_DELAYS.map((delay, i) => (
        <span key={i} className={`room-wave-bar ${animClass}`}
          style={{
            '--rwb-color':  color,
            '--rwb-delay':  `${delay}s`,
            '--rwb-height': `${resolvedMode === 'active' ? BAR_HEIGHTS[i] : resolvedMode === 'overrun' ? Math.min(BAR_HEIGHTS[i] + 15, 100) : 18}%`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ── Hub state resolver ────────────────────────────────────────────────────────

type HubState = 'open' | 'soon' | 'active' | 'back-to-back' | 'overrun' | 'booked' | 'offline';

interface HubInfo {
  state: HubState;
  activeSession?: Session; nextSession?: Session;
  minsUntil?: number; minsOver?: number; minsLeft?: number;
}

function resolveHubState(todaySessions: Session[], utilizationPct: number, studioOnline: boolean): HubInfo {
  if (!studioOnline) return { state: 'offline' };
  const now  = Date.now();
  const live = todaySessions.filter(s => !['CANCELLED','NO_SHOW'].includes(s.status ?? ''));

  const active = live.find(s =>
    s.starts_at && s.ends_at &&
    new Date(s.starts_at).getTime() <= now && now < new Date(s.ends_at).getTime()
  );
  const overrun = !active && live.find(s => {
    if (!s.ends_at) return false;
    const e = new Date(s.ends_at).getTime();
    return e < now && e > now - 60 * 60_000 && !['COMPLETED','CANCELLED','NO_SHOW'].includes(s.status ?? '');
  });
  if (overrun) return { state: 'overrun', activeSession: overrun,
    minsOver: Math.floor((now - new Date(overrun.ends_at!).getTime()) / 60_000) };

  const upcoming = live
    .filter(s => s.starts_at && new Date(s.starts_at).getTime() > now)
    .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime())[0];

  if (active) {
    const minsLeft = Math.max(0, Math.floor((new Date(active.ends_at!).getTime() - now) / 60_000));
    if (upcoming) {
      const gap = new Date(upcoming.starts_at!).getTime() - new Date(active.ends_at!).getTime();
      if (gap < 90 * 60_000) return { state: 'back-to-back', activeSession: active, nextSession: upcoming, minsLeft };
    }
    return { state: 'active', activeSession: active, nextSession: upcoming, minsLeft };
  }
  if (upcoming) {
    const minsUntil = Math.floor((new Date(upcoming.starts_at!).getTime() - now) / 60_000);
    if (minsUntil <= 30) return { state: 'soon', nextSession: upcoming, minsUntil };
  }
  if (utilizationPct >= 88 && !upcoming) return { state: 'booked' };
  return { state: 'open', nextSession: upcoming };
}


// ── Room session helper ───────────────────────────────────────────────────────

function getRoomSession(sessions: Session[], pattern: string): { active: Session | null; next: Session | null } {
  const now = Date.now();
  const room = sessions.filter(s =>
    s.room?.name?.toLowerCase().includes(pattern.toLowerCase())
  );
  const active = room.find(s =>
    s.starts_at && s.ends_at &&
    new Date(s.starts_at).getTime() <= now && now < new Date(s.ends_at).getTime()
  ) ?? null;
  const next = !active
    ? room.filter(s => s.starts_at && new Date(s.starts_at).getTime() > now)
        .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime())[0] ?? null
    : null;
  return { active, next };
}

// ── Main Studio card — gold, wave, left-border architectural ──────────────────

function MainStudioCard({ sessions }: { sessions: Session[] }) {
  const { active, next } = getRoomSession(sessions, 'main');
  const isLive = !!active;
  const LIVE = '#5A9BCB';
  const TEAL = '#1D9E75';
  const accent = isLive ? LIVE : TEAL;

  const minsLeft = active
    ? Math.max(0, Math.floor((new Date(active.ends_at!).getTime() - Date.now()) / 60_000))
    : null;

  return (
    <div className={`rcm${isLive ? ' rcm-live' : ''}`}
      style={{ borderLeftColor: accent }}>
      <div className="rcm-header">
        <span className="rcm-name">Main Studio</span>
        <span className="rcm-pill"
          style={{ color: accent, background: `${accent}10`, border: `1px solid ${accent}28`,
            animation: isLive ? 'breath 2s ease-in-out infinite' : 'none' }}>
          {isLive ? '● LIVE' : next ? '◑' : '◎'}
        </span>
      </div>
      <div className="rcm-wave">
        <RoomWave
          color={accent}
          active={isLive}
          mode={isLive ? 'active' : next ? 'idle' : 'idle'}
        />
      </div>
      {(active ?? next) ? (
        <p className="rcm-artist" style={{ color: isLive ? '#888' : '#3a3a3a' }}>
          {(active ?? next)?.artist?.name?.split(' ')[0] ?? '—'}
          {minsLeft !== null ? <span style={{ color: accent }}> · {fmtMins(minsLeft)}</span> : null}
          {!active && next ? <span> · {fmtTime(next.starts_at)}</span> : null}
        </p>
      ) : (
        <p className="rcm-artist" style={{ color: '#1e1e1e' }}>Open</p>
      )}
    </div>
  );
}

// ── Studio B card — blue, geometric, different personality ────────────────────

const SB_HEIGHTS = [70, 40, 90, 55, 75, 35, 85, 50, 65];

function StudioBCard({ sessions }: { sessions: Session[] }) {
  const { active, next } = getRoomSession(sessions, 'studio b');
  const isLive = !!active;
  const BLUE = '#3B8BFF';

  return (
    <div className={`rcb${isLive ? ' rcb-live' : ''}`}>
      <div className="rcb-top">
        <span className="rcb-name">Studio B</span>
        <span className="rcb-status" style={{ color: isLive ? BLUE : '#2a3a4a' }}>
          {isLive ? 'LIVE' : next ? 'SOON' : 'OPEN'}
        </span>
      </div>
      {/* Vertical bar equaliser — different geometry from Main's horizontal wave */}
      <div className="rcb-bars">
        {SB_HEIGHTS.map((h, i) => (
          <div key={i}
            className={`rcb-bar${isLive ? ' rcb-bar-live' : ''}`}
            style={{ '--sb-h': `${h}%`, '--sb-d': `${i * 0.09}s`, '--sb-c': BLUE } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="rcb-footer">
        <span className="rcb-dot" style={{ background: isLive ? BLUE : '#1a2a3a', boxShadow: isLive ? `0 0 5px ${BLUE}` : 'none' }} />
        <span className="rcb-artist">
          {(active ?? next)?.artist?.name?.split(' ')[0] ?? (isLive ? '—' : 'Ready')}
        </span>
      </div>
    </div>
  );
}

// ── Command Hub Panel — the wave IS the studio ────────────────────────────────

function CommandHubPanel({ todaySessions, utilizationPct, studioOnline }: {
  todaySessions: Session[]; utilizationPct: number; studioOnline: boolean;
}) {
  const info = resolveHubState(todaySessions, utilizationPct, studioOnline);
  const { state, activeSession, nextSession, minsUntil, minsOver, minsLeft } = info;

  const GOLD = '#C9A84C';
  const RED  = '#D94A4A';
  const TEAL = '#1D9E75';

  const cfg: Record<HubState, { waveColor: string; waveMode: WaveMode; accentColor: string; pillText: string; dotPulse: boolean }> = {
    open:           { waveColor: TEAL, waveMode: 'idle',    accentColor: TEAL, pillText: '◎  OPEN',        dotPulse: false },
    soon:           { waveColor: GOLD, waveMode: 'idle',    accentColor: GOLD, pillText: '◑  INCOMING',    dotPulse: false },
    active:         { waveColor: GOLD, waveMode: 'active',  accentColor: GOLD, pillText: '●  IN SESSION',  dotPulse: true  },
    'back-to-back': { waveColor: GOLD, waveMode: 'active',  accentColor: GOLD, pillText: '●  BACK TO BACK',dotPulse: true  },
    overrun:        { waveColor: RED,  waveMode: 'overrun', accentColor: RED,  pillText: '⚠  OVERRUN',     dotPulse: true  },
    booked:         { waveColor: TEAL, waveMode: 'idle',    accentColor: TEAL, pillText: '✓  FULLY BOOKED',dotPulse: false },
    offline:        { waveColor: '#444', waveMode: 'off',   accentColor: '#444', pillText: '○  OFFLINE',   dotPulse: false },
  };
  const c = cfg[state];
  const isLive = state === 'active' || state === 'back-to-back';
  const todayCount = todaySessions.filter(s => !['CANCELLED','NO_SHOW'].includes(s.status ?? '')).length;

  return (
    <div className={`chp${isLive ? ' chp-live' : ''}`}
      style={{ '--chp-accent': c.accentColor } as React.CSSProperties}>

      {/* Studio ID + state pill */}
      <div className="chp-top">
        <span className="chp-studio-id">Dreamz Music Lab</span>
        <span className="chp-pill" style={{
          color: c.accentColor, background: `${c.accentColor}12`,
          border: `1px solid ${c.accentColor}30`,
          animation: c.dotPulse ? 'breath 2s ease-in-out infinite' : 'none',
        }}>
          {c.pillText}
        </span>
      </div>

      {/* Session clock */}
      <div className="chp-clock-zone">
        <SmartClock
          size={220}
          showLegend={false}
          showStatusBar={false}
          utilizationPct={utilizationPct}
          weekSessions={0}
        />
      </div>

      {/* THE WAVE — OIANO signature */}
      <div className="chp-wave-zone">
        <div className="chp-wave-glow" style={{ background: `radial-gradient(ellipse at 50% 100%, ${c.waveColor}18 0%, transparent 70%)` }} />
        <RoomWave color={c.waveColor} active={isLive} mode={c.waveMode} />
      </div>

      {/* Active / soon artist chip */}
      {(isLive || state === 'overrun' || state === 'soon') && (activeSession ?? nextSession) && (() => {
        const s = activeSession ?? nextSession!;
        return (
          <div className="chp-artist-row">
            <div className="chp-av" style={{ background: `${c.accentColor}18`, border: `1px solid ${c.accentColor}30`, color: c.accentColor }}>
              {initials(s.artist?.name)}
            </div>
            <div className="chp-artist-info">
              <p className="chp-artist-name" style={{ color: isLive || state === 'overrun' ? '#f0ede8' : '#888' }}>
                {s.artist?.name ?? 'Walk-in'}
              </p>
              <p className="chp-artist-sub">
                {sessionTitle(s)}
                {state === 'soon' && nextSession ? ` · in ${fmtMins(minsUntil ?? 0)}` : ''}
                {state === 'overrun' ? ` · +${fmtMins(minsOver ?? 0)} overrun` : ''}
              </p>
            </div>
            {(isLive || state === 'overrun') && (
              <span className="chp-countdown" style={{ color: c.accentColor }}>
                {state === 'overrun' ? `-${fmtMins(minsOver ?? 0)}` : `${fmtMins(minsLeft ?? 0)}`}
              </span>
            )}
          </div>
        );
      })()}

      {/* Session progress */}
      {isLive && activeSession && (
        <div className="chp-progress">
          <SessionProgress session={activeSession} />
        </div>
      )}

      {/* Back-to-back ghost */}
      {state === 'back-to-back' && nextSession && (
        <div className="chp-artist-row chp-ghost">
          <div className="chp-av" style={{ background: '#3B8BFF14', border: '1px solid #3B8BFF22', color: '#3B8BFF60' }}>
            {initials(nextSession.artist?.name)}
          </div>
          <div className="chp-artist-info">
            <p className="chp-artist-name" style={{ color: '#3a3a3a' }}>{nextSession.artist?.name ?? 'Walk-in'}</p>
            <p className="chp-artist-sub">Up next · {fmtTime(nextSession.starts_at)}</p>
          </div>
        </div>
      )}

      {/* Stats footer */}
      <div className="chp-stats">
        <div className="chp-stat">
          <span className="chp-sv" style={{ color: isLive ? c.accentColor : '#52525b' }}>
            {isLive ? '1' : '0'}
          </span>
          <span className="chp-sl">Live</span>
        </div>
        <div className="chp-divider" />
        <div className="chp-stat">
          <span className="chp-sv">{todayCount}</span>
          <span className="chp-sl">Today</span>
        </div>
        <div className="chp-divider" />
        <div className="chp-stat">
          <span className="chp-sv" style={{ color: utilizationPct >= 70 ? TEAL : '#52525b' }}>
            {Math.round(utilizationPct)}%
          </span>
          <span className="chp-sl">Util</span>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function PulseDashboard() {
  const navigate = useNavigate();
  const [artists, setArtists]     = useState<Artist[]>([]);
  const [sessions, setSessions]   = useState<Session[]>([]);
  const [pulseData, setPulseData] = useState<PulseData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [pulseLoading, setPulseLoading] = useState(true);
  const [error, setError]         = useState('');
  const [tick, setTick]           = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [aRes, sRes] = await Promise.all([
        api.get('/artists',  { params: { limit: 100 } }),
        api.get('/bookings', { params: { limit: 100 } }),
      ]);
      setArtists(collection<Artist>(aRes.data));
      setSessions(collection<Session>(sRes.data));
    } catch {
      setError('Could not reach the API — make sure the backend is running on port 4000.');
    } finally { setLoading(false); }
  }, []);

  const loadPulse = useCallback(async () => {
    setPulseLoading(true);
    try {
      const { data } = await api.get('/studio/pulse');
      setPulseData(data);
    } catch { /* non-fatal */ } finally { setPulseLoading(false); }
  }, []);

  useEffect(() => { loadData(); loadPulse(); }, [loadData, loadPulse]);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setInterval(() => loadPulse(), 5 * 60_000);
    return () => clearInterval(id);
  }, [loadPulse]);

  const sorted = useMemo(
    () => [...sessions].sort((a, b) => new Date(sessionStart(a)).getTime() - new Date(sessionStart(b)).getTime()),
    [sessions]
  );
  const todaySessions = useMemo(
    () => sorted.filter(s => isToday(sessionStart(s)) && !['CANCELLED','NO_SHOW'].includes(s.status ?? '')),
    [sorted, tick]
  );
  const activeSession = useMemo(() => {
    const now = Date.now();
    return sorted.find(s =>
      s.starts_at && s.ends_at &&
      new Date(s.starts_at).getTime() <= now && now <= new Date(s.ends_at).getTime()
    );
  }, [sorted, tick]);

  const nextSession = useMemo(() => {
    const now = Date.now();
    return sorted.filter(s =>
      s.starts_at && new Date(s.starts_at).getTime() > now &&
      !['CANCELLED','NO_SHOW'].includes(s.status ?? '')
    ).sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime())[0] ?? null;
  }, [sorted, tick]);

  const revenuePaid        = sessions.filter(s => s.payment_status === 'PAID').reduce((sum, b) => sum + paymentAmount(b), 0);
  const revenueOutstanding = sessions.filter(s => s.payment_status !== 'PAID').reduce((sum, s) => sum + paymentAmount(s), 0);

  const thisWeekSessions = useMemo(() => {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return sorted.filter(s => s.starts_at && new Date(s.starts_at) >= weekStart &&
      !['CANCELLED','NO_SHOW'].includes(s.status ?? ''));
  }, [sorted]);

  const utilizationPct = pulseData?.utilization.today_pct  ?? 0;
  const cArtists       = useCounter(artists.length);

  // Live countdown state (ticks every second for hero)
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Next-session countdown string
  const nextCountdown = useMemo(() => {
    if (!nextSession?.starts_at) return null;
    const ms = Math.max(0, new Date(nextSession.starts_at).getTime() - nowMs);
    const h  = Math.floor(ms / 3_600_000);
    const m  = Math.floor((ms % 3_600_000) / 60_000);
    const s  = Math.floor((ms % 60_000) / 1_000);
    return h > 0 ? `${h}h ${m.toString().padStart(2,'0')}m` : `${m.toString().padStart(2,'0')}m ${s.toString().padStart(2,'0')}s`;
  }, [nextSession, nowMs]);

  return (
    <>
      <style>{CSS}</style>
      <div className={`cmd${activeSession ? ' cmd-live' : ''}`}>

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <aside className="cmd-sidebar">
          <div className="cmd-brand">
            <div className={`cmd-mark${activeSession ? ' cmd-mark-live' : ''}`}>O</div>
            <div>
              <strong>OIANO</strong>
              <span>Command Centre</span>
            </div>
          </div>

          <div className="cmd-vu-block">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <span className="cmd-section-label">{activeSession ? 'Recording' : 'Studio online'}</span>
              <span style={{
                width:6, height:6, borderRadius:'50%', flexShrink:0,
                background: activeSession ? '#5A9BCB' : '#22c55e',
                boxShadow: `0 0 6px ${activeSession ? '#5A9BCB' : '#22c55e'}`,
                animation: activeSession ? 'breath 1.8s ease-in-out infinite' : 'none',
                display:'inline-block',
              }} />
            </div>
            <VUMeter active={!!activeSession} bars={18} height={22} />
          </div>

          <nav className="cmd-nav">
            {[
              { label: 'Pulse',       to: null },
              { label: 'Admin',       to: '/admin' },
              { label: 'Calendar',    to: '/calendar' },
              { label: 'Book studio', to: '/book' },
              { label: 'Artist view', to: '/dashboard' },
            ].map(n => (
              <button key={n.label}
                className={n.to === null ? 'cmd-nav-btn active' : 'cmd-nav-btn'}
                onClick={() => n.to && navigate(n.to)}>
                {n.label}
              </button>
            ))}
          </nav>

          {/* ── Room status widgets ── */}
          <div className="cmd-rooms">
            <p className="cmd-section-label" style={{ marginBottom:8 }}>Studios</p>
            <MainStudioCard sessions={todaySessions} />
            <StudioBCard sessions={todaySessions} />
          </div>

          {/* Pulse summary */}
          {pulseData && (
            <div className="cmd-sidebar-pulse">
              <p className="cmd-section-label">Utilisation</p>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                <span style={{ fontSize:11, color:'#52525b' }}>Today</span>
                <span style={{ fontSize:11, color: utilizationPct >= 70 ? '#1D9E75' : '#C9A84C', fontFamily:'monospace' }}>
                  {utilizationPct}%
                </span>
              </div>
              <div style={{ height:3, background:'#141414', borderRadius:2, overflow:'hidden', marginBottom:10 }}>
                <div style={{ height:'100%', width:`${utilizationPct}%`, background: utilizationPct >= 70 ? '#1D9E75' : '#C9A84C', transition:'width 1s ease' }} />
              </div>
              {pulseData.trending_genre && (
                <p style={{ fontSize:10, color:'#2a2a2a' }}>
                  Trending <span style={{ color:'#5A9BCB60' }}>{pulseData.trending_genre.genre}</span>
                </p>
              )}
            </div>
          )}
        </aside>

        {/* ── Main ────────────────────────────────────────────────────── */}
        <main className="cmd-main">

          {/* Top bar */}
          <header className="cmd-topbar">
            <div className="cmd-topbar-left">
              <p className="cmd-topbar-date">
                {new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}
              </p>
              <div className="cmd-topbar-divider" />
              <LiveClock />
              <div className={`cmd-badge ${activeSession ? 'badge-live' : 'badge-open'}`}>
                {activeSession ? '● SESSION LIVE' : '◎ STUDIO ONLINE'}
              </div>
            </div>
            <div className="cmd-topbar-right">
              <button className="cmd-btn" onClick={() => { loadData(); loadPulse(); }}>↻ Refresh</button>
              <button className="cmd-btn primary" onClick={() => navigate('/book')}>+ New booking</button>
            </div>
          </header>

          {error && (
            <div className="cmd-error">{error}</div>
          )}

          {/* Hero band — live session OR next session countdown */}
          <div className={`cmd-hero${activeSession ? ' hero-live' : ' hero-idle'}`}>
            {activeSession ? (
              <>
                <div className="hero-glow" />
                <div className="hero-left">
                  <span className="hero-live-pill">● IN SESSION</span>
                  <h2 className="hero-artist-name">{sessionArtist(activeSession)}</h2>
                  <p className="hero-detail">
                    {sessionTitle(activeSession)}
                    {activeSession.room ? ` · ${activeSession.room.name}` : ''}
                  </p>
                </div>
                <div className="hero-right">
                  <div className="hero-time-range">
                    {fmtTime(activeSession.starts_at)} – {fmtTime(activeSession.ends_at)}
                  </div>
                  <div style={{ marginTop:8, width:220 }}>
                    <SessionProgress session={activeSession} />
                  </div>
                </div>
              </>
            ) : nextSession ? (
              <>
                <div className="hero-left">
                  <span className="hero-idle-pill">◎ NEXT SESSION</span>
                  <h2 className="hero-artist-name hero-artist-dim">{sessionArtist(nextSession)}</h2>
                  <p className="hero-detail">{sessionTitle(nextSession)} · {fmtTime(nextSession.starts_at)}</p>
                </div>
                <div className="hero-right">
                  <span className="hero-countdown">{nextCountdown}</span>
                  <span className="hero-countdown-sub">until session</span>
                </div>
              </>
            ) : (
              <div className="hero-empty">
                <span className="hero-idle-pill">◎ STUDIO OPEN</span>
                <p className="hero-empty-msg">No sessions scheduled today — the studio is ready.</p>
                <button className="cmd-btn primary" onClick={() => navigate('/book')}>Book a session →</button>
              </div>
            )}
          </div>

          {/* Body: 3 columns */}
          <div className="cmd-body">

            {/* Left: hub panel */}
            <div className="cmd-hub-col">
              <CommandHubPanel
                todaySessions={todaySessions}
                utilizationPct={utilizationPct}
                studioOnline={!error}
              />
            </div>

            {/* Center: schedule */}
            <div className="cmd-schedule-col">
              <div className="cmd-schedule-head">
                <span className="cmd-section-label">Today's schedule</span>
                <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                  <span className="cmd-kpi-inline">
                    <strong>{todaySessions.length}</strong> today
                  </span>
                  <span className="cmd-kpi-inline">
                    <strong>{thisWeekSessions.length}</strong> this week
                  </span>
                  <span className="cmd-kpi-inline">
                    <strong>{cArtists}</strong> artists
                  </span>
                  <button className="cmd-btn-sm" onClick={() => navigate('/book')}>+ Book</button>
                </div>
              </div>

              <TimelineStrip sessions={todaySessions} />

              <div className="cmd-session-list">
                {loading ? (
                  <div className="cmd-empty">Loading…</div>
                ) : todaySessions.length === 0 ? (
                  <div className="cmd-empty-idle">
                    <p style={{ fontFamily:"'Playfair Display',serif", fontSize:15, color:'#2a2a2a', marginBottom:6 }}>
                      The studio is listening.
                    </p>
                    <p style={{ fontSize:12, color:'#1e1e1e', marginBottom:14 }}>
                      No sessions booked today.
                    </p>
                    <button className="cmd-btn primary" onClick={() => navigate('/book')}>
                      Book a session →
                    </button>
                  </div>
                ) : (
                  todaySessions.map(s => {
                    const isActive = activeSession?.id === s.id;
                    const statusColors: Record<string, string> = {
                      CONFIRMED:'#1D9E75', PENDING:'#C9A84C',
                      COMPLETED:'#3f3f46', CANCELLED:'#7f1d1d', NO_SHOW:'#7f1d1d',
                    };
                    return (
                      <button key={s.id}
                        className={`cmd-session-row${isActive ? ' row-active' : ''}`}
                        onClick={() => navigate(`/bookings/${s.id}`)}>
                        <div className="csr-time">
                          <span>{fmtTime(s.starts_at)}</span>
                          <span className="csr-end">{fmtTime(s.ends_at)}</span>
                        </div>
                        <div className="csr-dot" style={{
                          background: isActive ? '#5A9BCB' : (statusColors[s.status ?? ''] ?? '#2a2a2a'),
                          boxShadow: isActive ? '0 0 6px #5A9BCB' : 'none',
                          animation: isActive ? 'breath 1.8s ease-in-out infinite' : 'none',
                        }} />
                        <div className="csr-info">
                          <p className="csr-name">{sessionArtist(s)}</p>
                          <p className="csr-sub">
                            {sessionTitle(s)}{s.room?.name ? ` · ${s.room.name}` : ''}
                          </p>
                        </div>
                        <div className="csr-right">
                          <span className="csr-amount">${Number(s.total_usd ?? 0).toFixed(0)}</span>
                          <span className={`csr-pill ${isActive ? 'pill-live' : s.status === 'CONFIRMED' ? 'pill-green' : s.status === 'PENDING' ? 'pill-gold' : 'pill-grey'}`}>
                            {isActive ? '● LIVE' : s.status?.toLowerCase()}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: revenue + intelligence */}
            <div className="cmd-intel-col">

              {/* Revenue block */}
              <div className="cmd-revenue">
                <p className="cmd-section-label" style={{ marginBottom:14 }}>Revenue</p>
                <div className="cmd-rev-row">
                  <div className="cmd-rev-item">
                    <span className="cmd-rev-val">{fmtCurrency(revenuePaid)}</span>
                    <span className="cmd-rev-lbl">Collected</span>
                  </div>
                  <div className="cmd-rev-divider" />
                  <div className="cmd-rev-item">
                    <span className="cmd-rev-val" style={{ color: revenueOutstanding > 0 ? '#5A9BCB' : '#3f3f46' }}>
                      {fmtCurrency(revenueOutstanding)}
                    </span>
                    <span className="cmd-rev-lbl">Outstanding</span>
                  </div>
                </div>
              </div>

              {/* Intelligence panel */}
              <div className="cmd-intel-panel">
                <StudioIntelligencePanel pulseData={pulseData} loading={pulseLoading} />
              </div>

            </div>
          </div>
        </main>
      </div>
    </>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
  @keyframes breath      { 0%,100%{opacity:0.5} 50%{opacity:1} }
  @keyframes pulse-ring  { 0%{transform:scale(1);opacity:.8} 100%{transform:scale(2.6);opacity:0} }
  @keyframes idle-glow   { 0%,100%{opacity:.03;transform:scale(1)} 50%{opacity:.07;transform:scale(1.04)} }
  @keyframes wave-over   { 0%,100%{height:50%} 50%{height:var(--rwb-height,90%)} }
  @keyframes wave-off    { 0%,100%{height:5%;opacity:.06} 50%{height:8%;opacity:.1} }

  /* ── Shell ── */
  .cmd,  .cmd * { box-sizing:border-box; margin:0; padding:0; }
  .cmd {
    display: grid;
    grid-template-columns: 152px minmax(0,1fr);
    height: 100vh; overflow: hidden;
    background: #070707;
    color: #f0ede8;
    font-family: 'DM Sans','Inter',Arial,sans-serif;
    position: relative;
  }
  .cmd::before {
    content:'';
    position:fixed; top:-180px; right:-180px;
    width:520px; height:520px; border-radius:50%;
    background: radial-gradient(circle, #5A9BCB 0%, transparent 70%);
    pointer-events:none; z-index:0;
    animation: idle-glow 7s ease-in-out infinite;
    opacity: 0.03;
  }
  .cmd.cmd-live::before { opacity:1; animation-duration:4s; }

  /* ── Sidebar ── */
  .cmd-sidebar {
    z-index:1; height:100vh; overflow-y:auto; overflow-x:hidden;
    background:#080808; border-right:1px solid #111;
    display:flex; flex-direction:column;
  }
  .cmd-brand {
    display:flex; align-items:center; gap:8px;
    padding:14px 12px; border-bottom:1px solid #111; flex-shrink:0;
  }
  .cmd-mark {
    width:26px; height:26px; flex-shrink:0;
    display:grid; place-items:center;
    border:1px solid #5A9BCB33; color:#5A9BCB;
    font-weight:700; font-size:12px; font-family:'Playfair Display',serif;
    transition: border-color .5s, box-shadow .5s;
  }
  .cmd-mark.cmd-mark-live { border-color:#5A9BCB; box-shadow:0 0 14px #5A9BCB33; }
  .cmd-brand strong { display:block; font-size:11px; color:#d4d4d8; letter-spacing:.02em; }
  .cmd-brand span   { display:block; font-size:9px;  color:#333; margin-top:1px; letter-spacing:.04em; }
  .cmd-vu-block { padding:12px; border-bottom:1px solid #111; flex-shrink:0; }
  .cmd-section-label {
    font-size:9px; color:#333; letter-spacing:.16em;
    text-transform:uppercase; font-family:'JetBrains Mono',monospace;
    display:block;
  }
  .cmd-nav { display:flex; flex-direction:column; gap:2px; padding:10px 8px; flex-shrink:0; }
  .cmd-nav-btn {
    width:100%; text-align:left; background:none; border:none; cursor:pointer;
    font-size:12px; color:#52525b; padding:7px 10px; border-radius:5px;
    font-family:inherit; transition:background .12s, color .12s;
  }
  .cmd-nav-btn:hover { background:#111; color:#a1a1aa; }
  .cmd-nav-btn.active { background:#1a1a1a; color:#5A9BCB; }
  .cmd-sidebar-pulse { padding:12px; margin-top:auto; border-top:1px solid #111; flex-shrink:0; }

  /* ── Main ── */
  .cmd-main { display:flex; flex-direction:column; height:100vh; overflow:hidden; z-index:1; }

  /* Topbar */
  .cmd-topbar {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 18px; border-bottom:1px solid #111;
    flex-shrink:0; height:48px; background:#070707;
  }
  .cmd-topbar-left  { display:flex; align-items:center; gap:14px; }
  .cmd-topbar-right { display:flex; align-items:center; gap:8px; }
  .cmd-topbar-date  { font-size:11px; color:#3a3a3a; font-family:'JetBrains Mono',monospace; letter-spacing:.04em; }
  .cmd-topbar-divider { width:1px; height:16px; background:#1e1e1e; }
  .cmd-clock {
    font-family:'JetBrains Mono',monospace; font-size:13px; color:#5A9BCB; letter-spacing:.1em;
  }
  .cmd-clock-sec { font-size:11px; color:#555; }
  .cmd-badge {
    font-size:9px; font-weight:700; letter-spacing:.12em;
    padding:3px 10px; border-radius:12px; font-family:'JetBrains Mono',monospace;
  }
  .badge-live { color:#5A9BCB; background:#5A9BCB12; border:1px solid #5A9BCB30; animation:breath 2s ease-in-out infinite; }
  .badge-open { color:#1D9E75; background:#1D9E7510; border:1px solid #1D9E7522; }

  .cmd-btn {
    font-size:11px; color:#555; background:none; border:1px solid #1e1e1e;
    padding:5px 12px; border-radius:6px; cursor:pointer; font-family:inherit;
    transition: border-color .15s, color .15s;
  }
  .cmd-btn:hover { color:#a1a1aa; border-color:#333; }
  .cmd-btn.primary { background:#5A9BCB; color:#000; border-color:transparent; font-weight:700; }
  .cmd-btn.primary:hover { background:#d9bb62; }
  .cmd-btn-sm {
    font-size:10px; color:#3a3a3a; background:none; border:1px solid #1a1a1a;
    padding:3px 10px; border-radius:5px; cursor:pointer; font-family:inherit;
    transition: color .15s, border-color .15s;
  }
  .cmd-btn-sm:hover { color:#888; border-color:#333; }
  .cmd-error { background:#1a0808; border-bottom:1px solid #3a1010; color:#f87171; font-size:12px; padding:8px 18px; flex-shrink:0; }

  /* Hero band */
  .cmd-hero {
    display:flex; align-items:center; justify-content:space-between;
    padding:14px 20px; border-bottom:1px solid #111;
    flex-shrink:0; min-height:72px; position:relative; overflow:hidden;
    gap:24px;
  }
  .hero-live { background:linear-gradient(90deg,#0f0d07 0%,#0a0a0a 100%); border-bottom-color:#5A9BCB22; }
  .hero-idle { background:#090909; }
  .hero-glow {
    position:absolute; top:-40px; left:-40px;
    width:200px; height:200px; border-radius:50%;
    background:radial-gradient(circle,#5A9BCB0c 0%,transparent 70%);
    pointer-events:none;
  }
  .hero-left  { display:flex; flex-direction:column; gap:3px; position:relative; flex:1; min-width:0; }
  .hero-right { display:flex; flex-direction:column; align-items:flex-end; flex-shrink:0; }
  .hero-live-pill {
    font-size:9px; font-weight:700; letter-spacing:.16em;
    color:#5A9BCB; font-family:'JetBrains Mono',monospace;
    animation:breath 2s ease-in-out infinite;
  }
  .hero-idle-pill {
    font-size:9px; font-weight:700; letter-spacing:.16em;
    color:#1D9E75; font-family:'JetBrains Mono',monospace;
  }
  .hero-artist-name {
    font-family:'Playfair Display',serif; font-size:22px; font-weight:700;
    color:#f0ede8; letter-spacing:-.01em; line-height:1.1;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .hero-artist-dim { color:#52525b; }
  .hero-detail { font-size:11px; color:#52525b; font-family:'JetBrains Mono',monospace; letter-spacing:.04em; }
  .hero-time-range { font-size:12px; color:#555; font-family:'JetBrains Mono',monospace; letter-spacing:.06em; }
  .hero-countdown {
    font-family:'JetBrains Mono',monospace; font-size:20px; color:#5A9BCB; font-weight:700; letter-spacing:.04em; line-height:1;
  }
  .hero-countdown-sub { font-size:10px; color:#3a3a3a; font-family:'JetBrains Mono',monospace; letter-spacing:.1em; margin-top:3px; }
  .hero-empty { display:flex; align-items:center; gap:20px; }
  .hero-empty-msg { font-size:12px; color:#2a2a2a; }

  /* Body 3-col */
  .cmd-body {
    display:grid;
    grid-template-columns: 268px minmax(0,1fr) 210px;
    flex:1; min-height:0; overflow:hidden;
  }
  .cmd-hub-col      { border-right:1px solid #111; overflow:hidden; display:flex; flex-direction:column; }
  .cmd-schedule-col { border-right:1px solid #111; overflow:hidden; display:flex; flex-direction:column; }
  .cmd-intel-col    { overflow:hidden; display:flex; flex-direction:column; }

  /* ── Command Hub Panel ── */
  .chp {
    flex:1; display:flex; flex-direction:column;
    background:#0a0a0a; padding:0;
    transition: background .5s;
  }
  .chp-live { background:linear-gradient(180deg,#0d0b07 0%,#0a0a0a 100%); }
  .chp-top {
    display:flex; align-items:center; justify-content:space-between;
    padding:14px 16px 10px;
  }
  .chp-studio-id {
    font-size:10px; color:#2a2a2a; letter-spacing:.1em;
    text-transform:uppercase; font-family:'JetBrains Mono',monospace;
  }
  .chp-pill {
    font-size:9px; font-weight:700; letter-spacing:.1em;
    padding:3px 9px; border-radius:12px; font-family:'JetBrains Mono',monospace;
  }

  /* Clock zone */
  .chp-clock-zone {
    display:flex; align-items:center; justify-content:center;
    padding:4px 0 0; flex-shrink:0;
  }

  /* THE WAVE — the centrepiece */
  .chp-wave-zone {
    flex:1; min-height:0;
    position:relative; overflow:hidden;
    display:flex; align-items:flex-end;
    padding:0 14px 10px;
  }
  .chp-wave-glow {
    position:absolute; bottom:0; left:0; right:0; height:100px;
    pointer-events:none;
  }
  .chp-wave-zone .room-wave-wrap {
    width:100%; height:64px; position:relative; z-index:1;
    display:flex; align-items:flex-end; gap:3px;
  }
  .chp-wave-zone .room-wave-bar { width:8px; border-radius:2px 2px 1px 1px; flex:1; max-width:12px; }

  /* Artist row */
  .chp-artist-row {
    display:flex; align-items:center; gap:10px;
    padding:10px 14px; border-top:1px solid #0f0f0f;
  }
  .chp-ghost { opacity:.4; }
  .chp-av {
    width:32px; height:32px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-size:12px; font-weight:700;
  }
  .chp-artist-info { flex:1; min-width:0; }
  .chp-artist-name { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .chp-artist-sub  { font-size:10px; color:#52525b; font-family:'JetBrains Mono',monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .chp-countdown   { font-family:'JetBrains Mono',monospace; font-size:13px; font-weight:700; flex-shrink:0; padding-left:6px; }

  /* Progress */
  .chp-progress { padding:0 14px 12px; }

  /* Stats footer */
  .chp-stats {
    display:flex; align-items:center;
    padding:10px 14px 14px; border-top:1px solid #0f0f0f;
    flex-shrink:0;
  }
  .chp-stat { display:flex; flex-direction:column; gap:2px; flex:1; align-items:center; }
  .chp-sv { font-size:16px; font-weight:700; color:#52525b; font-family:'JetBrains Mono',monospace; line-height:1; }
  .chp-sl { font-size:9px; color:#2a2a2a; text-transform:uppercase; letter-spacing:.08em; }
  .chp-divider { width:1px; height:28px; background:#141414; }

  /* Session progress bar */
  .sp-wrap { display:flex; flex-direction:column; gap:5px; }
  .sp-track { height:3px; background:#141414; border-radius:2px; overflow:hidden; }
  .sp-fill  { height:100%; background:linear-gradient(90deg,#5A9BCB,#8BBEDD); border-radius:2px; transition:width 10s linear; box-shadow:0 0 6px #5A9BCB60; }
  .sp-labels { display:flex; justify-content:space-between; font-size:10px; color:#3a3a3a; font-family:'JetBrains Mono',monospace; }

  /* Wave bar animations */
  @keyframes rwb-bounce {
    0%,100% { height:var(--rwb-height, 60%); }
    50%      { height:calc(var(--rwb-height, 60%) * 0.55); }
  }
  @keyframes rwb-idle {
    0%,100% { height:20%; opacity:.4; }
    50%      { height:30%; opacity:.6; }
  }
  .room-wave-wrap { display:flex; align-items:flex-end; gap:2px; }
  .room-wave-bar  { border-radius:2px 2px 1px 1px; flex-shrink:0; width:6px; }
  .rwb-active {
    animation: rwb-bounce .65s ease-in-out infinite;
    animation-delay: var(--rwb-delay,0s);
    background-color: var(--rwb-color,#5A9BCB);
    opacity:.9;
  }
  .rwb-idle {
    animation: rwb-idle 2.4s ease-in-out infinite;
    animation-delay: var(--rwb-delay,0s);
    background-color: var(--rwb-color,#5A9BCB);
  }
  .rwb-over {
    animation: wave-over .7s ease-in-out infinite;
    animation-delay: var(--rwb-delay,0s);
    background-color: var(--rwb-color,#D94A4A);
    opacity:.85;
  }
  .rwb-off {
    animation: wave-off 4s ease-in-out infinite;
    animation-delay: var(--rwb-delay,0s);
    background-color: var(--rwb-color,#3f3f46);
    opacity:.08;
  }

  /* Timeline strip */
  .tl-wrap { padding:10px 16px; border-bottom:1px solid #0f0f0f; flex-shrink:0; }
  .tl-track {
    position:relative; height:22px;
    background:#0a0a0a; border-radius:3px;
    border:1px solid #141414; overflow:hidden; margin-bottom:4px;
  }
  .tl-now  { position:absolute; top:0; bottom:0; width:1px; background:#5A9BCB; z-index:2; box-shadow:0 0 4px #5A9BCB; }
  .tl-block { position:absolute; top:3px; bottom:3px; border-radius:2px; z-index:1; min-width:2px; }
  .tl-labels { display:flex; justify-content:space-between; font-size:9px; color:#2a2a2a; font-family:'JetBrains Mono',monospace; }

  /* Schedule */
  .cmd-schedule-head {
    display:flex; align-items:center; justify-content:space-between;
    padding:12px 16px 8px; border-bottom:1px solid #0f0f0f; flex-shrink:0;
  }
  .cmd-kpi-inline { font-size:11px; color:#3a3a3a; }
  .cmd-kpi-inline strong { color:#888; }
  .cmd-session-list { flex:1; overflow-y:auto; }
  .cmd-session-row {
    display:flex; align-items:center; gap:12px;
    padding:11px 16px; border-bottom:1px solid #0d0d0d;
    background:transparent; border-left:2px solid transparent;
    width:100%; text-align:left; cursor:pointer; font-family:inherit;
    transition: background .1s;
  }
  .cmd-session-row:hover { background:#0d0d0d; }
  .cmd-session-row.row-active { background:#0f0d07; border-left-color:#5A9BCB; }
  .csr-time { width:48px; flex-shrink:0; }
  .csr-time span { display:block; font-family:'JetBrains Mono',monospace; font-size:11px; color:#5A9BCB; }
  .csr-end  { font-size:10px; color:#3a3a3a !important; }
  .csr-dot  { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
  .csr-info { flex:1; min-width:0; }
  .csr-name { font-size:13px; font-weight:600; color:#d4d4d8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .csr-sub  { font-size:11px; color:#3f3f46; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px; }
  .csr-right { display:flex; flex-direction:column; align-items:flex-end; flex-shrink:0; gap:3px; }
  .csr-amount { font-size:12px; color:#555; font-family:'JetBrains Mono',monospace; }
  .csr-pill { font-size:9px; font-family:'JetBrains Mono',monospace; letter-spacing:.04em; padding:2px 7px; border-radius:4px; }
  .pill-live  { color:#5A9BCB; background:#5A9BCB10; border:1px solid #5A9BCB30; animation:breath 2s ease-in-out infinite; }
  .pill-green { color:#1D9E75; background:#1D9E7510; border:1px solid #1D9E7520; }
  .pill-gold  { color:#C9A84C; background:#C9A84C10; border:1px solid #C9A84C20; }
  .pill-grey  { color:#52525b; background:#52525b10; border:1px solid #52525b20; }
  .cmd-empty { padding:24px; text-align:center; font-size:12px; color:#2a2a2a; }
  .cmd-empty-idle { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px 24px; flex:1; }

  /* Revenue */
  .cmd-revenue { padding:14px 14px 12px; border-bottom:1px solid #111; flex-shrink:0; }
  .cmd-rev-row { display:flex; align-items:stretch; gap:0; }
  .cmd-rev-item { flex:1; display:flex; flex-direction:column; gap:3px; }
  .cmd-rev-val  { font-family:'Playfair Display',serif; font-size:20px; font-weight:700; color:#f0ede8; line-height:1; }
  .cmd-rev-lbl  { font-size:9px; color:#2a2a2a; letter-spacing:.12em; text-transform:uppercase; font-family:'JetBrains Mono',monospace; }
  .cmd-rev-divider { width:1px; background:#141414; margin:0 14px; flex-shrink:0; }

  /* Intelligence */
  .cmd-intel-panel { flex:1; overflow:auto; min-height:0; }

  /* session-live global class integration */
  body.session-live .cmd-hero.hero-live { background:linear-gradient(90deg,#100e06 0%,#0a0a0a 100%); }
  body.session-live .cmd-sidebar { background:#090806; }

  /* ── Room status cards ── */
  .cmd-rooms { padding:10px 8px 6px; border-top:1px solid #111; flex-shrink:0; }

  /* Main Studio */
  .rcm {
    background:#0c0c0c; border-radius:6px;
    border:1px solid #141414; border-left:3px solid #1D9E75;
    padding:9px 9px 7px; margin-bottom:6px;
    transition: border-left-color .4s;
  }
  .rcm-live { background:#0e0d0a; }
  .rcm-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:7px; }
  .rcm-name  { font-size:9px; color:#333; font-family:'JetBrains Mono',monospace; letter-spacing:.1em; text-transform:uppercase; }
  .rcm-pill  { font-size:8px; font-weight:700; letter-spacing:.06em; padding:1px 6px; border-radius:8px; font-family:'JetBrains Mono',monospace; }
  .rcm-wave .room-wave-wrap { height:24px; gap:2px; }
  .rcm-wave .room-wave-bar  { width:3px; max-width:5px; border-radius:1px 1px 0 0; }
  .rcm-artist { font-size:10px; margin-top:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family:'JetBrains Mono',monospace; }

  /* Studio B */
  .rcb {
    background:#08090f;
    border-radius:0 7px 7px 0;
    border:1px solid #0f1018;
    border-left:2px solid #3B8BFF18;
    padding:9px 9px 7px;
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%);
    transition: border-left-color .4s, background .4s;
  }
  .rcb-live { border-left-color:#3B8BFF40; background:#080b12; }
  .rcb-top  { display:flex; align-items:center; justify-content:space-between; margin-bottom:7px; }
  .rcb-name { font-size:9px; color:#1a2a3a; font-family:'JetBrains Mono',monospace; letter-spacing:.1em; text-transform:uppercase; }
  .rcb-status { font-size:8px; font-weight:700; letter-spacing:.1em; font-family:'JetBrains Mono',monospace; }
  .rcb-bars { display:flex; align-items:flex-end; gap:2px; height:24px; margin-bottom:7px; }
  .rcb-bar {
    flex:1; max-width:9px; border-radius:1px;
    background:#111827;
    height:var(--sb-h,50%);
    transition: height .3s, background .4s;
  }
  @keyframes sb-bounce { 0%,100%{height:var(--sb-h,50%)} 50%{height:calc(var(--sb-h,50%) * 0.3)} }
  .rcb-bar-live {
    background:var(--sb-c,#3B8BFF);
    opacity:.65;
    animation: sb-bounce .65s ease-in-out infinite;
    animation-delay:var(--sb-d,0s);
  }
  .rcb-footer { display:flex; align-items:center; gap:5px; }
  .rcb-dot    { width:5px; height:5px; border-radius:50%; flex-shrink:0; transition:background .4s, box-shadow .4s; }
  .rcb-artist { font-size:10px; color:#1e3050; font-family:'JetBrains Mono',monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .rcb-live .rcb-artist { color:#3B8BFF60; }
  body.session-live .cmd-topbar  { border-bottom-color:#5A9BCB14; }
`;
