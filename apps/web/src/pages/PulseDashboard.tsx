/**
 * PulseDashboard — OIANO Command Centre
 * Discipline · Order · Sound
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import VUMeter from '../components/VUMeter';
import SmartClock from '../components/SmartClock/SmartClock';
import StudioIntelligencePanel, { PulseData, Insight } from '../components/StudioIntelligencePanel';
import OianoBrand from '../components/OianoBrand';
import { Activity, LayoutDashboard, Calendar, ClipboardList, DollarSign, Gauge, Wallet } from 'lucide-react';
import { useToast } from '../components/Toast';
import ArtistAvatar from '../components/ArtistAvatar';
import { BookingStatus, STATUS_HEX } from '../lib/bookingStatus';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Artist {
  id: string; name: string; alias: string | null;
  email: string; genres: string[]; vocal_type: string | null; created_at: string;
}

interface Session {
  id: string; title?: string; starts_at?: string; ends_at?: string;
  status?: string; payment_status?: string; total_usd?: number | string | null;
  payment?: { status?: string; amount_usd?: number | string | null } | null;
  service?: { id?: string; name?: string } | null;
  artist?: { id: string; name: string; alias: string | null };
  room?: { id: string; name: string; room_type: string; status: string } | null;
  engineer?: { id?: string; name?: string } | null;
  notes?: string | null;
}

interface CircleMember {
  id: string;
  consent_status: 'ELIGIBLE' | 'REQUESTED' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN';
  visibility: 'HIDDEN' | 'INITIALS' | 'STAGE_NAME' | 'FULL_PROFILE';
  session_count: number;
  last_session_at: string;
  artist: {
    id: string; name: string; alias: string | null; avatar_url: string | null;
    passport?: { passport_code: string; creative_dna: { genres?: string[] } | null; profile_strength: number } | null;
  };
}

interface CircleData {
  total_verified: number;
  visible_count: number;
  pending_consent: number;
  members: CircleMember[];
}

interface WorkPerson { id: string; name: string; alias?: string | null; avatar_url?: string | null }
interface CurrentWorkProject {
  id: string; title: string; phase: string; last_session_at?: string | null;
  artist?: WorkPerson | null; producer: WorkPerson;
  bookings: Array<{ id: string; starts_at: string; ends_at: string; status: string; room: { name: string }; engineer?: WorkPerson | null }>;
}
interface CurrentWorkSession {
  id: string; starts_at: string; ends_at: string; status: string;
  artist: WorkPerson; engineer?: WorkPerson | null; room: { name: string }; service: { name: string };
}
interface CurrentWorkData { privacy: string; projects: CurrentWorkProject[]; sessions: CurrentWorkSession[] }

// ── Helpers ───────────────────────────────────────────────────────────────────

function sessionStart(s: Session)  { return s.starts_at ?? ''; }
function sessionTitle(s: Session)  { return s.service?.name ?? s.title ?? 'Studio session'; }
function sessionArtist(s: Session) { return s.artist?.name ?? 'Unknown'; }
function paymentAmount(s: Session) { return Number(s.total_usd ?? 0); }
function paymentStatus(s: Session) { return s.payment?.status ?? s.payment_status ?? 'UNPAID'; }

function fmtTime(iso?: string, timeZone?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone });
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

function LiveClock({ timeZone }: { timeZone?: string }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).formatToParts(now);
  const hh = parts.find(part => part.type === 'hour')?.value ?? '00';
  const mm = parts.find(part => part.type === 'minute')?.value ?? '00';
  const ss = parts.find(part => part.type === 'second')?.value ?? '00';
  return (
    <span className="cmd-clock" aria-label={`Studio time ${hh}:${mm}`}>
      {hh}<span style={{ opacity: now.getSeconds() % 2 === 0 ? 1 : 0.25, transition: 'opacity 0.2s' }}>:</span>{mm}
      <span className="cmd-clock-sec">:{ss}</span>
    </span>
  );
}

// ── Pulse dial — the hero centrepiece. A ring showing real elapsed % while a
// session is live, a slow breathing ring otherwise, with the state/countdown
// text set inside it rather than beside it. ────────────────────────────────

function PulseDial({ activeSession, nextSession, nextCountdown, studioName }: {
  activeSession?: Session; nextSession?: Session | null; nextCountdown?: string | null; studioName?: string;
}) {
  const size = 148, r = 62, cx = size / 2, cy = size / 2, sw = 5;
  const isLive = !!activeSession;

  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (!activeSession?.starts_at || !activeSession?.ends_at) { setPct(0); return; }
    function calc() {
      const start = new Date(activeSession!.starts_at!).getTime();
      const end   = new Date(activeSession!.ends_at!).getTime();
      const now   = Date.now();
      setPct(Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)));
    }
    calc();
    const id = setInterval(calc, 10_000);
    return () => clearInterval(id);
  }, [activeSession]);

  const accent = isLive ? '#E8823A' : nextSession ? '#5A9BCB' : '#1D9E75';
  const angle = Math.min(359.99, (pct / 100) * 360);
  const rad = (angle - 90) * (Math.PI / 180);
  const startRad = -Math.PI / 2;
  const sx = cx + r * Math.cos(startRad), sy = cy + r * Math.sin(startRad);
  const ex = cx + r * Math.cos(rad), ey = cy + r * Math.sin(rad);
  const large = angle > 180 ? 1 : 0;

  const minsLeft = isLive && activeSession?.ends_at
    ? Math.max(0, Math.round((new Date(activeSession.ends_at).getTime() - Date.now()) / 60_000))
    : null;

  const stateLabel = isLive ? 'In session' : nextSession ? 'Studio ready' : 'Studio open';
  const bigText = isLive ? fmtMins(minsLeft ?? 0) : nextSession ? (nextCountdown ?? '—') : '—';
  const bigSub  = isLive ? 'remaining' : nextSession ? 'until next session' : '';

  // Sweep segment — a short arc that continuously rotates around the track,
  // independent of the real progress arc. Gives the ring an "always scanning"
  // read even when idle, instead of only animating via the slow breath.
  const sweepDeg = 34;
  const sw0 = -Math.PI / 2;
  const sw1 = (sweepDeg - 90) * (Math.PI / 180);
  const swSx = cx + r * Math.cos(sw0), swSy = cy + r * Math.sin(sw0);
  const swEx = cx + r * Math.cos(sw1), swEy = cy + r * Math.sin(sw1);
  const sweepPath = `M${swSx.toFixed(2)},${swSy.toFixed(2)} A${r},${r},0,0,1,${swEx.toFixed(2)},${swEy.toFixed(2)}`;

  return (
    <div className={`pulse-dial${isLive ? ' pulse-dial-live' : ''}`}>
      <svg className="pulse-vinyl" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`${studioName ?? 'Oiano Studio'} vinyl status`}>
        <defs>
          <radialGradient id="vinylFace" cx="38%" cy="30%">
            <stop offset="0" stopColor="#24282d"/><stop offset=".42" stopColor="#111316"/><stop offset="1" stopColor="#030405"/>
          </radialGradient>
          <radialGradient id="vinylLabel" cx="38%" cy="32%">
            <stop offset="0" stopColor="#e1c86f"/><stop offset="1" stopColor="#8d7130"/>
          </radialGradient>
        </defs>
        <g className="pulse-vinyl-rotor">
          <circle cx={cx} cy={cy} r="58" fill="url(#vinylFace)" stroke="#ffffff12" strokeWidth="1"/>
          {[52,48,43,38].map(groove=><circle key={groove} cx={cx} cy={cy} r={groove} fill="none" stroke="#ffffff10" strokeWidth=".7"/>)}
          <path d="M34 47 A48 48 0 0 1 96 31" fill="none" stroke="#ffffff16" strokeWidth="2" strokeLinecap="round"/>
          <circle cx={cx} cy={cy} r="22" fill="url(#vinylLabel)" stroke="#f4dea050" strokeWidth="1"/>
          <circle cx={cx} cy={cy} r="3" fill="#08090a" stroke="#fff4c755" strokeWidth="1"/>
        </g>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1a1a" strokeWidth={sw} />
        <g className="pulse-dial-sweep-rotor" style={{ color: accent }}>
          <path d={sweepPath} fill="none" stroke={accent} strokeWidth={sw * 0.55} strokeLinecap="round" opacity={0.5} />
        </g>
        {isLive && pct > 0 && (
          <path
            d={`M${sx.toFixed(2)},${sy.toFixed(2)} A${r},${r},0,${large},1,${ex.toFixed(2)},${ey.toFixed(2)}`}
            fill="none" stroke={accent} strokeWidth={sw} strokeLinecap="round"
          />
        )}
        {!isLive && (
          <circle className="pulse-dial-breathe" cx={cx} cy={cy} r={r} fill="none" stroke={accent} strokeWidth={sw} />
        )}
      </svg>
      <div className="pulse-vinyl-brand" aria-hidden="true">
        <span>{studioName ?? 'OIANO STUDIO'}</span>
        <i>OIANO · PULSE</i>
      </div>
      <div className="pulse-dial-center">
        <span className="pulse-dial-state" style={{ color: accent }}>{stateLabel}</span>
        <span className="pulse-dial-big">{bigText}</span>
        {bigSub && <span className="pulse-dial-sub">{bigSub}</span>}
        {nextSession?.room?.name && !isLive && (
          <span className="pulse-dial-room">{nextSession.room.name}</span>
        )}
      </div>
    </div>
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
          return (
            <div key={s.id} className="tl-block"
              title={`${sessionArtist(s)} · ${fmtTime(s.starts_at)}–${fmtTime(s.ends_at)}`}
              style={{ left: `${left}%`, width: `${Math.max(width, 1)}%`, background: STATUS_HEX[s.status as BookingStatus] ?? '#2a2a2a' }}
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


const OPERATING_DAY_START = 8;
const OPERATING_DAY_END = 22;

function RoomStateTimeline({ sessions, roomName }: { sessions: Session[]; roomName: string }) {
  const dayMinutes = (OPERATING_DAY_END - OPERATING_DAY_START) * 60;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes() - OPERATING_DAY_START * 60;
  const nowPct = Math.max(0, Math.min(100, (nowMinutes / dayMinutes) * 100));
  const valid = sessions.filter(session =>
    session.starts_at && session.ends_at && !['CANCELLED', 'NO_SHOW'].includes(session.status ?? '')
  );

  return (
    <div className="room-state-timeline" role="img" aria-label={`${roomName} booking timeline from 8 AM to 10 PM, ${valid.length} booked period${valid.length === 1 ? '' : 's'}`}>
      <div className="rst-track">
        {valid.map(session => {
          const start = new Date(session.starts_at!);
          const end = new Date(session.ends_at!);
          const startMinutes = start.getHours() * 60 + start.getMinutes() - OPERATING_DAY_START * 60;
          const endMinutes = end.getHours() * 60 + end.getMinutes() - OPERATING_DAY_START * 60;
          const left = Math.max(0, Math.min(100, (startMinutes / dayMinutes) * 100));
          const right = Math.max(0, Math.min(100, (endMinutes / dayMinutes) * 100));
          const isActive = start <= now && now < end;
          const isComplete = end <= now || session.status === 'COMPLETED';
          return (
            <span
              key={session.id}
              className={`rst-block${isActive ? ' active' : isComplete ? ' complete' : ' upcoming'}`}
              style={{ left: `${left}%`, width: `${Math.max(1.5, right - left)}%` }}
              title={`${fmtTime(session.starts_at)}–${fmtTime(session.ends_at)} · ${sessionArtist(session)}`}
            />
          );
        })}
        {nowMinutes >= 0 && nowMinutes <= dayMinutes && <i className="rst-now" style={{ left: `${nowPct}%` }} />}
      </div>
      <div className="rst-axis"><span>08</span><span>15</span><span>22</span></div>
    </div>
  );
}

function DynamicRoomCard({ room, sessions }: { room: { id: string; name: string }; sessions: Session[] }) {
  const now = Date.now();
  const roomSessions = sessions.filter(session => session.room?.id === room.id);
  const active = roomSessions.find(session => session.starts_at && session.ends_at && new Date(session.starts_at).getTime() <= now && now < new Date(session.ends_at).getTime());
  const next = roomSessions.filter(session => session.starts_at && new Date(session.starts_at).getTime() > now).sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime())[0];
  const accent = active ? '#5A9BCB' : '#1D9E75';
  const pct = active
    ? Math.min(100, Math.max(0, ((now - new Date(active.starts_at!).getTime()) /
        (new Date(active.ends_at!).getTime() - new Date(active.starts_at!).getTime())) * 100))
    : 0;
  return (
    <div className={`rcm${active ? ' rcm-live' : ''}`} style={{ borderLeftColor: accent }}>
      <div className="rcm-header"><span className="rcm-name">{room.name}</span><span className="rcm-pill" style={{ color: accent, background: `${accent}10`, border: `1px solid ${accent}30` }}>{active ? '● LIVE' : 'READY'}</span></div>
      <RoomWave color={accent} active={!!active}/>
      <RoomStateTimeline sessions={roomSessions} roomName={room.name} />
      <p className="rcm-artist">{active ? sessionArtist(active) : next ? `Next · ${sessionArtist(next)}` : 'Available'}</p>
      <p className="rcm-sub">{active ? `${fmtTime(active.starts_at)}–${fmtTime(active.ends_at)}` : next ? fmtTime(next.starts_at) : 'No session queued'}</p>
      {active?.engineer?.name && (
        <p className="rcm-engineer">Engineer: {active.engineer.name}</p>
      )}
      {active && (
        <div className="rcm-progress"><div style={{ width: `${pct}%`, background: accent }} /></div>
      )}
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
          defaultMode="pulse"
        />
      </div>

      {/* THE WAVE — OIANO signature */}
      <div className="chp-wave-zone">
        <div
          className={`chp-wave-glow${state === 'overrun' || state === 'back-to-back' ? ' chp-flare' : ''}`}
          style={{ background: `radial-gradient(ellipse at 50% 100%, ${c.waveColor}18 0%, transparent 70%)` }}
        />
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
  const toast = useToast();
  const [artists, setArtists]     = useState<Artist[]>([]);
  const [sessions, setSessions]   = useState<Session[]>([]);
  const [pulseData, setPulseData] = useState<PulseData | null>(null);
  const [circleData, setCircleData] = useState<CircleData | null>(null);
  const [currentWork, setCurrentWork] = useState<CurrentWorkData | null>(null);
  const [requestingCircleId, setRequestingCircleId] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [pulseLoading, setPulseLoading] = useState(true);
  const [error, setError]         = useState('');
  const [tick, setTick]           = useState(0);
  const [updatingBooking, setUpdatingBooking] = useState<string | null>(null);
  const [assigningBooking, setAssigningBooking] = useState<string | null>(null);

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

  const loadCircle = useCallback(async () => {
    try {
      const { data } = await api.get('/studio-circle/studio');
      setCircleData(data);
    } catch { /* Non-blocking while Circle data initializes. */ }
  }, []);

  const loadCurrentWork = useCallback(async () => {
    try {
      const { data } = await api.get('/studio-circle/current-work');
      setCurrentWork(data);
    } catch { /* Non-blocking operational enhancement. */ }
  }, []);

  const requestCircleConsent = useCallback(async (member: CircleMember) => {
    setRequestingCircleId(member.id);
    try {
      await api.post(`/studio-circle/${member.id}/request`);
      await loadCircle();
      toast.success(`Circle invitation sent to ${member.artist.alias ?? member.artist.name}`);
    } catch { toast.error('Could not send the Circle invitation'); }
    finally { setRequestingCircleId(null); }
  }, [loadCircle, toast]);

  const changeBookingStatus = useCallback(async (booking: Session, status: 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED') => {
    setUpdatingBooking(booking.id);
    try {
      await api.patch(`/bookings/${booking.id}/status`, { status });
      await Promise.all([loadData(), loadPulse(), loadCurrentWork()]);
      toast.success(status === 'CONFIRMED' ? 'Booking confirmed' : status === 'IN_PROGRESS' ? 'Session started' : 'Session completed');
    } catch {
      toast.error('Could not update the session');
    } finally {
      setUpdatingBooking(null);
    }
  }, [loadData, loadPulse, loadCurrentWork, toast]);

  const assignEngineer = useCallback(async (booking: Session, engineerId: string) => {
    setUpdatingBooking(booking.id);
    try {
      await api.patch(`/bookings/${booking.id}/engineer`, { engineer_id: engineerId || null });
      await loadData();
      toast.success(engineerId ? 'Engineer assigned' : 'Engineer assignment cleared');
      setAssigningBooking(null);
    } catch { toast.error('Could not assign the engineer'); }
    finally { setUpdatingBooking(null); }
  }, [loadData, toast]);

  useEffect(() => { loadData(); loadPulse(); loadCircle(); loadCurrentWork(); }, [loadData, loadPulse, loadCircle, loadCurrentWork]);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setInterval(() => loadPulse(), 5 * 60_000);
    return () => clearInterval(id);
  }, [loadPulse]);

  // ── Auto-scroll the intelligence panel — a slow, self-driving ticker so the
  // revenue/signal/productivity/moving cards are all visible without the
  // operator having to touch anything. Pauses on hover/touch so a manual
  // scroll isn't fought, and dwells briefly at each end before reversing.
  const intelPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = intelPanelRef.current;
    if (!el) return;

    let raf = 0;
    let dir: 1 | -1 = 1;
    let paused = false;
    // Phase-based (not position-threshold-based) so a boundary touch dwells
    // exactly once — a threshold check like "scrollTop <= 1" would keep
    // re-triggering every frame while the slow increment lingers near 0.
    let phase: 'moving' | 'dwelling' = 'moving';
    let dwellEnd = 0;
    // scrollTop only holds whole pixels — a sub-pixel-per-frame increment
    // read back from el.scrollTop rounds to 0 every frame and never
    // accumulates. Track the true (fractional) position ourselves instead.
    let pos = el.scrollTop;

    function tick(now: number) {
      const max = el!.scrollHeight - el!.clientHeight;
      if (!paused && max > 4) {
        if (phase === 'dwelling') {
          if (now >= dwellEnd) phase = 'moving';
        } else {
          pos += dir * 0.35;
          if (pos >= max) {
            pos = max;
            dir = -1;
            phase = 'dwelling';
            dwellEnd = now + 1600;
          } else if (pos <= 0) {
            pos = 0;
            dir = 1;
            phase = 'dwelling';
            dwellEnd = now + 1600;
          }
          el!.scrollTop = pos;
        }
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    const pause  = () => { paused = true; };
    const resume = () => { paused = false; };
    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', resume);
    el.addEventListener('touchstart', pause, { passive: true });
    el.addEventListener('touchend', () => setTimeout(resume, 1500));

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('mouseenter', pause);
      el.removeEventListener('mouseleave', resume);
      el.removeEventListener('touchstart', pause);
    };
  }, []);

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

  const revenuePaid        = pulseData?.finance?.collected_usd ?? sessions.filter(s => paymentStatus(s) === 'PAID').reduce((sum, b) => sum + paymentAmount(b), 0);
  const revenueOutstanding = pulseData?.finance?.outstanding_usd ?? sessions.filter(s => paymentStatus(s) !== 'PAID').reduce((sum, s) => sum + paymentAmount(s), 0);
  const todayRevenue       = pulseData?.finance?.today_booked_usd ?? todaySessions.reduce((sum, s) => sum + paymentAmount(s), 0);

  const thisWeekSessions = useMemo(() => {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return sorted.filter(s => s.starts_at && new Date(s.starts_at) >= weekStart &&
      !['CANCELLED','NO_SHOW'].includes(s.status ?? ''));
  }, [sorted]);
  const weekRevenue = pulseData?.finance?.week_collected_usd ?? thisWeekSessions.reduce((sum, s) => sum + paymentAmount(s), 0);

  const utilizationPct = pulseData?.utilization.today_pct  ?? 0;
  const cArtists       = useCounter(pulseData?.coverage?.artist_count ?? artists.length);

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

  // ── Intelligence — the "what should the manager do" layer. Each card is
  // computed from data already loaded on this page (no extra fetch), so it
  // can point at a specific artist/room/amount instead of a bare count.
  // Ranked risk > payment > opportunity > trend, capped so it stays a short,
  // actually-actionable list rather than a wall of facts.
  const insights = useMemo((): Insight[] => {
    const out: Insight[] = [];
    const roomNames = pulseData?.rooms?.map(room => room.name) ?? [];
    const DAY_HOURS = 14; // 8am–10pm per room

    // Booking risk — soonest still-unconfirmed session
    const risk = sorted.find(s =>
      s.status === 'PENDING' && s.starts_at && new Date(s.starts_at).getTime() > nowMs
    );
    if (risk) {
      const minsUntil = Math.round((new Date(risk.starts_at!).getTime() - nowMs) / 60_000);
      out.push({
        id: 'risk', icon: '⚠', label: 'Booking risk', severity: 'risk',
        headline: `${sessionArtist(risk)} — confirmation pending`,
        detail: `Session starts in ${fmtMins(minsUntil)}`,
        cta: 'Review booking →',
        onClick: () => navigate(`/bookings/${risk.id}`),
      });
    }

    // Payment follow-up — largest outstanding balance on a confirmed/completed session
    const outstanding = sessions
      .filter(s => paymentStatus(s) !== 'PAID' && ['CONFIRMED', 'COMPLETED'].includes(s.status ?? ''))
      .sort((a, b) => paymentAmount(b) - paymentAmount(a))[0];
    if (outstanding && paymentAmount(outstanding) > 0) {
      out.push({
        id: 'payment', icon: '🧾', label: 'Payment follow-up', severity: 'payment',
        headline: `${sessionArtist(outstanding)} — ${fmtCurrency(paymentAmount(outstanding))} outstanding`,
        detail: outstanding.starts_at ? `Session ${fmtTime(outstanding.starts_at)} · ${outstanding.status?.toLowerCase()}` : 'Payment pending',
        cta: 'View booking →',
        onClick: () => navigate(`/bookings/${outstanding.id}`),
      });
    }

    // Revenue opportunity — the room with the most unused hours today
    const avgRate = (() => {
      const priced = sessions.filter(s => paymentAmount(s) > 0 && s.starts_at && s.ends_at);
      if (!priced.length) return 30;
      const total = priced.reduce((sum, s) => {
        const hrs = (new Date(s.ends_at!).getTime() - new Date(s.starts_at!).getTime()) / 3_600_000;
        return sum + (hrs > 0 ? paymentAmount(s) / hrs : 0);
      }, 0);
      return total / priced.length;
    })();
    const roomGaps = roomNames.map(name => {
      const bookedHrs = todaySessions
        .filter(s => s.room?.name === name)
        .reduce((sum, s) => sum + (new Date(s.ends_at!).getTime() - new Date(s.starts_at!).getTime()) / 3_600_000, 0);
      return { name, unused: Math.max(0, DAY_HOURS - bookedHrs) };
    }).sort((a, b) => b.unused - a.unused);
    const topGap = roomGaps[0];
    if (topGap && topGap.unused >= 2) {
      out.push({
        id: 'opportunity', icon: '💰', label: 'Revenue opportunity', severity: 'opportunity',
        headline: `${topGap.name} has ${topGap.unused.toFixed(1)}h unused today`,
        detail: `Potential revenue: ${fmtCurrency(topGap.unused * avgRate)}`,
        cta: 'Open availability →',
        onClick: () => navigate('/calendar'),
      });
    }

    // Trend — trending genre + the 4h window with the most session starts
    if (pulseData?.trending_genre) {
      const buckets = new Array(24).fill(0);
      sessions.forEach(s => { if (s.starts_at) buckets[new Date(s.starts_at).getHours()]++; });
      let bestStart = 8, bestSum = -1;
      for (let h = 8; h <= 18; h++) {
        const sum = buckets.slice(h, h + 4).reduce((a, b) => a + b, 0);
        if (sum > bestSum) { bestSum = sum; bestStart = h; }
      }
      if (bestSum > 0) {
        const g = pulseData.trending_genre;
        out.push({
          id: 'trend', icon: '📈', label: 'Pulse insight', severity: 'trend',
          headline: `${g.genre} sessions lead this month at ${g.pct}%`,
          detail: `Highest-demand window: ${bestStart % 12 || 12}${bestStart < 12 ? 'am' : 'pm'}–${(bestStart + 4) % 12 || 12}${bestStart + 4 < 12 || bestStart + 4 === 24 ? 'am' : 'pm'}`,
          cta: 'View calendar →',
          onClick: () => navigate('/calendar'),
        });
      }
    }

    return out.slice(0, 4);
  }, [sorted, sessions, todaySessions, pulseData, nowMs, navigate]);

  return (
    <>
      <style>{CSS}</style>
      <div className={`cmd${activeSession ? ' cmd-live' : ''}`}>

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <aside className="cmd-sidebar">
          <div className="cmd-brand">
            <OianoBrand variant="compact" size={21} />
            <div>
              <strong>{pulseData?.studio?.name ?? 'Command Centre'}</strong>
              <span style={{display:'block',fontSize:8,color:'#3f3f46',textTransform:'uppercase',letterSpacing:'.14em',marginTop:2}}>Pulse · Operator live</span>
            </div>
          </div>

          <div className="cmd-vu-block">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <span className="cmd-section-label">Studio state</span>
              <span style={{
                width:6, height:6, borderRadius:'50%', flexShrink:0,
                background: activeSession ? '#5A9BCB' : '#22c55e',
                boxShadow: `0 0 6px ${activeSession ? '#5A9BCB' : '#22c55e'}`,
                animation: activeSession ? 'breath 1.8s ease-in-out infinite' : 'none',
                display:'inline-block',
              }} />
            </div>
            <VUMeter active={!!activeSession} bars={18} height={22} />
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:7, gap:8 }}>
              <strong style={{ fontSize:8, letterSpacing:'.12em', color: activeSession ? '#8fc5ec' : '#46a987', fontFamily:"'JetBrains Mono',monospace" }}>
                {activeSession ? 'IN USE · SESSION LIVE' : 'READY · NO ACTIVE SESSION'}
              </strong>
              <span style={{ fontSize:7, color:'#343a40', letterSpacing:'.08em', whiteSpace:'nowrap' }}>ACTIVITY MODE</span>
            </div>
          </div>

          <nav className="cmd-nav">
            {[
              { label: 'Pulse',       to: null,          icon: Activity },
              { label: 'Operator',    to: '/admin',       icon: LayoutDashboard },
              { label: 'Calendar',    to: '/calendar',    icon: Calendar },
              { label: 'Runsheet',    to: '/runsheet',    icon: ClipboardList },
            ].map(n => (
              <button key={n.label}
                className={n.to === null ? 'cmd-nav-btn active' : 'cmd-nav-btn'}
                aria-label={n.label}
                onClick={() => n.to && navigate(n.to)}>
                <n.icon size={14} strokeWidth={1.75} />
                <span className="cmd-nav-label">{n.label}</span>
              </button>
            ))}
          </nav>

          {/* ── Room status widgets ── */}
          <div className="cmd-rooms">
            <p className="cmd-section-label" style={{ marginBottom:8 }}>Studios</p>
            {(pulseData?.rooms ?? []).map(room => <DynamicRoomCard key={room.id} room={room} sessions={todaySessions}/>) }
            {!pulseLoading && !(pulseData?.rooms?.length) && <p style={{fontSize:10,color:'#3f3f46'}}>No rooms configured</p>}
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
              <LiveClock timeZone={pulseData?.studio?.timezone} />
              <div role="status" aria-live="polite" className={`cmd-badge ${activeSession ? 'badge-live' : 'badge-open'}`}>
                {activeSession ? '● SESSION LIVE' : '◎ STUDIO ONLINE'}
              </div>
            </div>
            <div className="cmd-topbar-right">
              <button className="cmd-btn" onClick={() => { loadData(); loadPulse(); loadCircle(); loadCurrentWork(); }}>↻ Refresh</button>
              <button className="cmd-btn primary" onClick={() => navigate('/admin')}>Operator desk</button>
            </div>
          </header>

          {error && (
            <div className="cmd-error" role="alert">{error}</div>
          )}

          {/* Hero band — a big circular pulse dial as the centrepiece instead
              of a text-first bar. Elapsed-session % when live, a breathing
              ring otherwise; the countdown/state text lives inside it. */}
          <div className={`cmd-hero${activeSession ? ' hero-live' : ' hero-idle'}`}>
            {activeSession ? <div className="hero-glow" /> : null}
            <div className="hero-left">
              <div className="hero-identity">
                <span className="hero-identity-overline">OIANO CONTROL INSTRUMENT</span>
                <strong>STUDIO <i>PULSE</i></strong>
                <span className="hero-identity-rule"/>
              </div>
              {activeSession ? (
                <>
                  <span className="hero-live-pill">● IN SESSION</span>
                  <h2 className="hero-artist-name">{sessionArtist(activeSession)}</h2>
                  <p className="hero-detail">
                    {sessionTitle(activeSession)}
                    {activeSession.room ? ` · ${activeSession.room.name}` : ''}
                    {' · '}{fmtTime(activeSession.starts_at)}–{fmtTime(activeSession.ends_at)}
                  </p>
                </>
              ) : nextSession ? (
                <>
                  <span className="hero-idle-pill">◎ NEXT SESSION</span>
                  <h2 className="hero-artist-name hero-artist-dim">{sessionArtist(nextSession)}</h2>
                  <p className="hero-detail">
                    {sessionTitle(nextSession)} · {fmtTime(nextSession.starts_at)}
                    {nextSession.room ? ` · ${nextSession.room.name}` : ''}
                  </p>
                </>
              ) : (
                <>
                  <span className="hero-idle-pill">◎ STUDIO OPEN</span>
                  <p className="hero-empty-msg">No sessions scheduled today — the studio is ready.</p>
                  <button className="cmd-btn primary" style={{ marginTop:8, alignSelf:'flex-start' }} onClick={() => navigate('/admin')}>Open operator desk →</button>
                </>
              )}
            </div>
            <PulseDial activeSession={activeSession} nextSession={nextSession} nextCountdown={nextCountdown} studioName={pulseData?.studio?.name} />
          </div>

          {/* TODAY strip — one glanceable line instead of hunting the same
              four numbers across the sidebar, hub footer, and revenue block. */}
          <div className="cmd-today-strip">
            <div className="cts-item">
              <span className="cts-badge" style={{ color: '#5A9BCB', background: '#5A9BCB14' }}><Calendar size={14} strokeWidth={2} /></span>
              <span className="cts-text">
                <span className="cts-val">{todaySessions.length}</span>
                <span className="cts-lbl">Bookings</span>
              </span>
            </div>
            <div className="cts-div" />
            <div className="cts-item">
              <span className="cts-badge" style={{ color: '#C9A84C', background: '#C9A84C14' }}><DollarSign size={14} strokeWidth={2} /></span>
              <span className="cts-text">
                <span className="cts-val">{fmtCurrency(todayRevenue)}</span>
                <span className="cts-lbl">Revenue</span>
              </span>
            </div>
            <div className="cts-div" />
            <div className="cts-item">
              <span className="cts-badge" style={{
                color: utilizationPct >= 70 ? '#1D9E75' : '#5A9BCB',
                background: utilizationPct >= 70 ? '#1D9E7514' : '#5A9BCB14',
              }}><Gauge size={14} strokeWidth={2} /></span>
              <span className="cts-text">
                <span className="cts-val" style={{ color: utilizationPct >= 70 ? '#1D9E75' : undefined }}>{Math.round(utilizationPct)}%</span>
                <span className="cts-lbl">Utilization</span>
              </span>
            </div>
            <div className="cts-div" />
            <div className="cts-item">
              <span className="cts-badge" style={{
                color: revenueOutstanding > 0 ? '#E8823A' : '#3f3f46',
                background: revenueOutstanding > 0 ? '#E8823A14' : '#3f3f4614',
              }}><Wallet size={14} strokeWidth={2} /></span>
              <span className="cts-text">
                <span className="cts-val" style={{ color: revenueOutstanding > 0 ? '#E8823A' : undefined }}>{fmtCurrency(revenueOutstanding)}</span>
                <span className="cts-lbl">Outstanding</span>
              </span>
            </div>
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
              <section className="work-faces" aria-labelledby="current-work-title">
                <div className="work-faces-head">
                  <div><span className="cmd-section-label">Private workspace</span><strong id="current-work-title">Current Work · Project Faces</strong></div>
                  <span>Operational access only</span>
                </div>
                {(currentWork?.projects.length || currentWork?.sessions.length) ? (
                  <div className="work-faces-rail">
                    {currentWork?.projects.map(project => {
                      const latest = project.bookings[0];
                      const primary = project.artist;
                      const primaryName = primary ? (primary.alias ?? primary.name) : project.title;
                      const producerName = project.producer.alias ?? project.producer.name;
                      return (
                        <button key={project.id} className="work-face-card" onClick={() => latest && navigate(`/bookings/${latest.id}`)} disabled={!latest}>
                          <div className="work-face-stack">
                            <ArtistAvatar src={primary?.avatar_url} name={primaryName} size={45} />
                            <ArtistAvatar src={project.producer.avatar_url} name={producerName} size={24} />
                          </div>
                          <div className="work-face-copy">
                            <span className="work-face-kind">Project · {project.phase.replaceAll('_', ' ')}</span>
                            <strong>{project.title}</strong>
                            <span>{primaryName} · Producer {producerName}</span>
                            <em>{latest ? `${latest.room.name} · ${fmtTime(latest.starts_at)}` : 'No linked session'}</em>
                          </div>
                        </button>
                      );
                    })}
                    {currentWork?.sessions.map(session => {
                      const artistName = session.artist.alias ?? session.artist.name;
                      return (
                        <button key={session.id} className="work-face-card" onClick={() => navigate(`/bookings/${session.id}`)}>
                          <div className="work-face-stack"><ArtistAvatar src={session.artist.avatar_url} name={artistName} size={45} /></div>
                          <div className="work-face-copy">
                            <span className="work-face-kind">Booked artist · {session.status.replaceAll('_', ' ')}</span>
                            <strong>{artistName}</strong>
                            <span>{session.service.name} · {session.room.name}</span>
                            <em>{fmtTime(session.starts_at)} · Project not linked</em>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : <p className="work-faces-empty">Upcoming bookings and active projects will appear here with their working team.</p>}
              </section>
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
                  <button className="cmd-btn-sm" onClick={() => navigate('/admin')}>Manage</button>
                </div>
              </div>

              <TimelineStrip sessions={todaySessions} />

              <div className="cmd-session-list" aria-label="Today's studio sessions">
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
                    <button className="cmd-btn primary" onClick={() => navigate('/admin')}>
                      Open operator desk →
                    </button>
                  </div>
                ) : (
                  todaySessions.map(s => {
                    const isActive = activeSession?.id === s.id;
                    return (
                      <div key={s.id} role="button" tabIndex={0}
                        className={`cmd-session-row${isActive ? ' row-active' : ''}`}
                        onClick={() => navigate(`/bookings/${s.id}`)}
                        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') navigate(`/bookings/${s.id}`); }}>
                        <div className="csr-time">
                          <span>{fmtTime(s.starts_at)}</span>
                          <span className="csr-end">{fmtTime(s.ends_at)}</span>
                        </div>
                        <div className="csr-dot" style={{
                          background: isActive ? '#5A9BCB' : (STATUS_HEX[s.status as BookingStatus] ?? '#2a2a2a'),
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
                          <button className="pulse-engineer-trigger" onClick={event => { event.stopPropagation(); setAssigningBooking(assigningBooking === s.id ? null : s.id); }}>{s.engineer?.name ?? 'Assign engineer'}</button>
                          {assigningBooking === s.id && <div className="pulse-engineer-menu" onClick={event => event.stopPropagation()}><button onClick={()=>assignEngineer(s,'')}>Unassigned</button>{(pulseData?.engineers ?? []).map(engineer=><button key={engineer.id} onClick={()=>assignEngineer(s,engineer.id)}>{engineer.name}</button>)}</div>}
                          {s.status === 'PENDING' && <button disabled={updatingBooking === s.id} className="pulse-row-action confirm" onClick={event => { event.stopPropagation(); changeBookingStatus(s, 'CONFIRMED'); }}>{updatingBooking === s.id ? 'Saving…' : 'Confirm'}</button>}
                          {s.status === 'CONFIRMED' && !isActive && <button disabled={updatingBooking === s.id} className="pulse-row-action start" onClick={event => { event.stopPropagation(); changeBookingStatus(s, 'IN_PROGRESS'); }}>{updatingBooking === s.id ? 'Starting…' : 'Start'}</button>}
                          {(s.status === 'IN_PROGRESS' || isActive) && <button disabled={updatingBooking === s.id} className="pulse-row-action complete" onClick={event => { event.stopPropagation(); changeBookingStatus(s, 'COMPLETED'); }}>{updatingBooking === s.id ? 'Saving…' : 'Complete'}</button>}
                          <span className={`csr-pill ${isActive ? 'pill-live' : s.status === 'CONFIRMED' ? 'pill-green' : s.status === 'PENDING' ? 'pill-gold' : 'pill-grey'}`}>
                            {isActive ? '● LIVE' : s.status?.toLowerCase()}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: revenue + intelligence */}
            <div className="cmd-intel-col">

              <section className="circle-panel" aria-labelledby="studio-circle-title">
                <div className="circle-head">
                  <div>
                    <p id="studio-circle-title" className="cmd-section-label">Studio Circle</p>
                    <strong>{circleData?.total_verified ?? 0} verified creator{circleData?.total_verified === 1 ? '' : 's'}</strong>
                  </div>
                  {!!circleData?.pending_consent && <span>{circleData.pending_consent} private</span>}
                </div>
                {circleData?.members.length ? (
                  <div className="circle-rail">
                    {circleData.members.slice(0, 8).map(member => {
                      const artistName = member.artist.alias ?? member.artist.name;
                      const genre = member.artist.passport?.creative_dna?.genres?.[0] ?? 'Creator';
                      const accepted = member.consent_status === 'ACCEPTED';
                      return (
                        <article key={member.id} className="circle-person">
                          <div className="circle-avatar-wrap">
                            <ArtistAvatar src={member.artist.avatar_url} name={artistName} size={38} />
                            <i className={accepted ? 'circle-verified' : 'circle-private'}>{accepted ? '✓' : '○'}</i>
                          </div>
                          <div className="circle-person-copy">
                            <strong>{artistName}</strong>
                            <span>{genre} · {member.session_count} session{member.session_count === 1 ? '' : 's'}</span>
                          </div>
                          {member.consent_status === 'ELIGIBLE' && (
                            <button disabled={requestingCircleId === member.id} onClick={() => requestCircleConsent(member)}>
                              {requestingCircleId === member.id ? 'Sending…' : 'Invite'}
                            </button>
                          )}
                          {member.consent_status === 'REQUESTED' && <em>Consent requested</em>}
                          {accepted && <em className="accepted">Visible by consent</em>}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="circle-empty">Completed sessions will form the studio’s verified creative network.</p>
                )}
              </section>

              {/* Revenue block — "Outstanding" used to be duplicated here and
                  in the TODAY strip above with the identical number. Kept it
                  in the TODAY strip (matches the Bookings/Revenue/Utilization/
                  Outstanding spec) and swapped this one for genuinely
                  different info: all-time collected + this week's revenue. */}
              <div className="cmd-revenue">
                <p className="cmd-section-label" style={{ marginBottom:14 }}>Revenue</p>
                <div className="cmd-rev-row">
                  <div className="cmd-rev-item">
                    <span className="cmd-rev-val">{fmtCurrency(revenuePaid)}</span>
                    <span className="cmd-rev-lbl">Collected</span>
                  </div>
                  <div className="cmd-rev-divider" />
                  <div className="cmd-rev-item">
                    <span className="cmd-rev-val" style={{ color: weekRevenue > 0 ? '#1D9E75' : '#3f3f46' }}>
                      {fmtCurrency(weekRevenue)}
                    </span>
                    <span className="cmd-rev-lbl">This week</span>
                  </div>
                </div>
              </div>

              {/* Intelligence panel */}
              <div className="cmd-intel-panel">
                <StudioIntelligencePanel pulseData={pulseData} loading={pulseLoading} insights={insights} />
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
    background:
      radial-gradient(circle at 76% 18%,rgba(90,155,203,.075),transparent 26%),
      radial-gradient(circle at 18% 90%,rgba(201,168,76,.04),transparent 30%),
      linear-gradient(145deg,#060708 0%,#080a0c 54%,#060708 100%);
    color: #f0ede8;
    font-family: 'DM Sans','Inter',Arial,sans-serif;
    position: relative;
  }
  .cmd-main::before {
    content:''; position:fixed; pointer-events:none; z-index:-1;
    width:min(62vw,780px); aspect-ratio:1; right:-18vw; top:-32vw;
    border:1px solid rgba(90,155,203,.09); border-radius:50%;
    box-shadow:0 0 0 70px rgba(90,155,203,.018),0 0 0 150px rgba(201,168,76,.012);
    transform:rotate(-18deg);
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

  /* Sun-arc wash — additive layer, doesn't touch the dome-blue "idle/ready"
     identity above. Traces the real day (dawn/noon/dusk) via the same
     --sun-arc-* vars the global ambient glow uses (see StudioState +
     index.css) so the Command Centre — OIANO's own control room — visibly
     runs on the same solar clock as its brand mark. */
  .cmd::after {
    content:'';
    position:fixed; inset:0;
    pointer-events:none; z-index:0;
    background: radial-gradient(ellipse 55% 45% at 100% 0%, var(--sun-arc-color, #C9A84C) 0%, transparent 65%);
    opacity: var(--sun-arc-wash-op, 0.05);
    transition: opacity 3s ease, background 3s ease;
  }

  /* ── Sidebar ── */
  .cmd-sidebar {
    min-width:0;
    z-index:1; height:100vh; overflow-y:auto; overflow-x:hidden;
    background:linear-gradient(180deg,rgba(10,12,15,.98),rgba(6,7,8,.98)); border-right:1px solid rgba(255,255,255,.07);
    display:flex; flex-direction:column;
  }
  .cmd-brand {
    display:flex; align-items:center; gap:8px;
    padding:16px 12px; border-bottom:1px solid rgba(255,255,255,.06); flex-shrink:0;
  }
  .cmd-brand strong { display:block; font-size:11px; color:#d4d4d8; letter-spacing:.02em; }
  .cmd-vu-block { padding:12px; border-bottom:1px solid #111; flex-shrink:0; }
  .cmd-section-label {
    font-size:9px; color:#333; letter-spacing:.16em;
    text-transform:uppercase; font-family:'JetBrains Mono',monospace;
    display:block;
  }
  .cmd-nav { display:flex; flex-direction:column; align-items:stretch; gap:3px; padding:12px 8px; flex-shrink:0; }
  .cmd-nav-btn {
    position:relative;
    flex:1; display:flex; align-items:center; justify-content:flex-start; gap:9px;
    height:34px; padding:0 10px; background:none; border:none; cursor:pointer;
    color:#52525b; border-radius:5px;
    font-family:inherit; transition:background .12s, color .12s;
  }
  .cmd-nav-label { display:inline; font-size:9px; letter-spacing:.06em; white-space:nowrap; }
  .cmd-nav-btn:hover { background:rgba(255,255,255,.045); color:#d4d4d8; }
  .cmd-nav-btn.active { background:linear-gradient(90deg,rgba(90,155,203,.15),rgba(90,155,203,.025)); color:#8fc5ec; box-shadow:inset 2px 0 #5A9BCB; }
  .cmd-nav-tip {
    position:absolute; top:calc(100% + 6px); left:50%; transform:translateX(-50%);
    white-space:nowrap; background:#111; border:1px solid #1e1e1e; border-radius:5px;
    padding:4px 8px; font-size:9px; letter-spacing:.12em; text-transform:uppercase;
    color:#d4d4d8; font-family:'JetBrains Mono',monospace;
    opacity:0; pointer-events:none; transition:opacity .15s; z-index:30;
  }
  .cmd-nav-btn:hover .cmd-nav-tip { opacity:1; }
  .cmd-sidebar-pulse { padding:12px; margin-top:auto; border-top:1px solid #111; flex-shrink:0; }

  /* ── Main ── */
  .cmd-main { min-width:0; display:flex; flex-direction:column; height:100vh; overflow:hidden; z-index:1; }

  /* Topbar */
  .cmd-topbar {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 18px; border-bottom:1px solid #111;
    flex-shrink:0; height:56px; background:rgba(6,8,10,.76); backdrop-filter:blur(18px);
  }
  .cmd-topbar-left  { display:flex; align-items:center; gap:14px; }
  .cmd-topbar-right { display:flex; align-items:center; gap:8px; }
  .cmd-topbar-date  { font-size:11px; color:#3a3a3a; font-family:'JetBrains Mono',monospace; letter-spacing:.04em; }
  .cmd-topbar-divider { width:1px; height:16px; background:#1e1e1e; }
  .cmd-clock {
    font-family:'JetBrains Mono',monospace; font-size:13px; color:#8fc5ec; letter-spacing:.1em;
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
  .cmd-btn.primary { background:linear-gradient(135deg,#77add4,#C9A84C); color:#070809; border-color:transparent; font-weight:750; box-shadow:0 8px 24px rgba(90,155,203,.12); }
  .cmd-btn.primary:hover { filter:brightness(1.12); }
  .cmd-btn-sm {
    font-size:10px; color:#3a3a3a; background:none; border:1px solid #1a1a1a;
    padding:3px 10px; border-radius:5px; cursor:pointer; font-family:inherit;
    transition: color .15s, border-color .15s;
  }
  .cmd-btn-sm:hover { color:#888; border-color:#333; }
  .cmd-error { background:#1a0808; border-bottom:1px solid #3a1010; color:#f87171; font-size:12px; padding:8px 18px; flex-shrink:0; }

  /* Hero band */
  .cmd-hero {
    display:grid; grid-template-columns:minmax(0,1fr) 180px; align-items:center;
    padding:22px 34px; border-bottom:1px solid #111;
    flex-shrink:0; min-height:190px; position:relative; overflow:hidden;
    gap:38px; isolation:isolate;
  }
  .hero-live { background:linear-gradient(90deg,#0f0d07 0%,#0a0a0a 100%); border-bottom-color:#5A9BCB22; }
  .hero-idle { background:linear-gradient(115deg,rgba(10,13,17,.96),rgba(8,9,11,.92)); }
  .cmd-hero::after { content:''; position:absolute; width:340px; height:96px; left:32px; bottom:-82px; border:1px solid rgba(90,155,203,.13); border-radius:50%; transform:rotate(-7deg); box-shadow:0 0 35px rgba(90,155,203,.04); z-index:-1; }
  .hero-glow {
    position:absolute; top:-40px; left:-40px;
    width:200px; height:200px; border-radius:50%;
    background:radial-gradient(circle,#5A9BCB0c 0%,transparent 70%);
    pointer-events:none;
  }
  .hero-left  { display:flex; flex-direction:column; gap:5px; position:relative; min-width:0; justify-content:center; }
  .hero-right { display:flex; flex-direction:column; align-items:flex-end; flex-shrink:0; }
  .hero-identity { margin-bottom:17px; display:flex; flex-direction:column; align-items:flex-start; }
  .hero-identity-overline { color:#5A9BCB88; font:600 7px 'JetBrains Mono',monospace; letter-spacing:.26em; }
  .hero-identity strong { margin-top:5px; color:#f0ede8; font:700 clamp(27px,3vw,42px) 'DM Sans','Inter',sans-serif; letter-spacing:-.055em; line-height:.95; }
  .hero-identity strong i { color:#8fc5ec; font-style:normal; font-weight:300; text-shadow:0 0 28px rgba(90,155,203,.2); }
  .hero-identity-rule { margin-top:11px; width:clamp(120px,21vw,240px); height:1px; background:linear-gradient(90deg,#C9A84Caa,#5A9BCB55,transparent); }

  /* Pulse dial — hero centrepiece */
  .pulse-dial { position:relative; width:148px; height:148px; justify-self:center; flex-shrink:0; z-index:1; transform:scale(1.08); }
  .pulse-dial svg { display:block; overflow:visible; }
  .pulse-dial svg path { transition: stroke 0.6s ease; }
  .pulse-vinyl-rotor { transform-origin:74px 74px; animation:vinyl-spin 18s linear infinite; }
  .pulse-dial-live .pulse-vinyl-rotor { animation-duration:7s; }
  @keyframes vinyl-spin { to { transform:rotate(360deg); } }
  .pulse-vinyl-brand { position:absolute; inset:0; z-index:3; pointer-events:none; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; transform:translateY(-1px); }
  .pulse-vinyl-brand span { width:38px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#17130a; font:800 5px 'JetBrains Mono',monospace; letter-spacing:.02em; text-transform:uppercase; }
  .pulse-vinyl-brand i { margin-top:2px; color:#3a2d13; font:600 3.5px 'JetBrains Mono',monospace; letter-spacing:.08em; font-style:normal; }
  .pulse-dial-breathe { animation: pulse-dial-breathe 3.2s ease-in-out infinite; transform-origin:center; }
  .pulse-dial-sweep-rotor {
    transform-origin: 74px 74px;
    animation: pulse-dial-sweep 5s linear infinite;
    filter: drop-shadow(0 0 2px currentColor);
  }
  @keyframes pulse-dial-sweep { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes pulse-dial-breathe {
    0%, 100% { opacity:.3; transform:scale(1); }
    50%      { opacity:.65; transform:scale(1.015); }
  }
  .pulse-dial-center {
    position:absolute; inset:0; display:flex; flex-direction:column;
    align-items:center; justify-content:center; text-align:center; gap:3px;
    padding:0 16px; pointer-events:none; z-index:4;
  }
  .pulse-dial-state { position:absolute; top:9px; padding:2px 6px; border-radius:99px; background:#060708d9; backdrop-filter:blur(5px); font-size:6px; letter-spacing:.14em; text-transform:uppercase; font-family:'JetBrains Mono',monospace; font-weight:700; }
  .pulse-dial-big { position:absolute; bottom:12px; padding:2px 7px; border-radius:99px; background:#060708e8; font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:700; color:#f0ede8; line-height:1.2; box-shadow:0 4px 16px #0009; }
  .pulse-dial-sub,.pulse-dial-room { display:none; }
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

  /* TODAY strip */
  .cmd-today-strip {
    display:flex; align-items:center;
    padding:12px 20px; gap:22px;
    border-bottom:1px solid #111; flex-shrink:0;
  }
  .cts-item { display:flex; align-items:center; gap:10px; }
  .cts-badge {
    width:30px; height:30px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    transition: background .4s, color .4s;
  }
  .cts-text { display:flex; flex-direction:column; gap:1px; }
  .cts-val { font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:700; color:#e4e4e7; line-height:1.1; }
  .cts-lbl { font-size:9px; color:#3a3a3a; letter-spacing:.1em; text-transform:uppercase; }
  .cts-div { width:1px; height:24px; background:#141414; }

  /* Body 3-col */
  .cmd-body {
    display:grid;
    grid-template-columns: 268px minmax(0,1fr) 250px;
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
    transition: opacity .5s;
  }
  /* Corona flare — when a session runs hot (overrun / back-to-back), the
     wave's glow stops being a static wash and starts behaving like an
     actual solar flare: brighter, wider, breathing faster than the calm
     idle/active states. Reuses the wave's own color (red for overrun,
     gold for back-to-back) so it still reads as status, not decoration. */
  @keyframes corona-flare {
    0%, 100% { opacity:.65; transform:scale(1)    translateY(0); filter:blur(0); }
    50%      { opacity:1;   transform:scale(1.22) translateY(-4px); filter:blur(1px); }
  }
  .chp-flare { animation: corona-flare 1.3s ease-in-out infinite; }
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
  .work-faces { flex-shrink:0; padding:11px 14px; border-bottom:1px solid #111; background:linear-gradient(115deg,rgba(201,168,76,.04),rgba(90,155,203,.025) 55%,transparent); }
  .work-faces-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:9px; }
  .work-faces-head strong { display:block; margin-top:3px; color:#d4d4d8; font:12px 'DM Sans',sans-serif; }
  .work-faces-head > span { color:#504a3d; border:1px solid #2b261c; border-radius:9px; padding:2px 7px; font:7px 'JetBrains Mono',monospace; text-transform:uppercase; letter-spacing:.08em; }
  .work-faces-rail { display:flex; gap:8px; overflow-x:auto; padding-bottom:3px; scrollbar-width:thin; scrollbar-color:#262626 transparent; }
  .work-face-card { min-width:225px; display:flex; align-items:center; gap:10px; padding:9px; border:1px solid #1a1a1a; border-radius:9px; background:rgba(8,9,11,.84); color:inherit; text-align:left; cursor:pointer; transition:border-color .15s,background .15s,transform .15s; }
  .work-face-card:hover { border-color:#5A9BCB38; background:#0d1013; transform:translateY(-1px); }
  .work-face-card:disabled { cursor:default; opacity:.7; }
  .work-face-stack { position:relative; width:54px; flex:0 0 54px; }
  .work-face-stack > :nth-child(2) { position:absolute !important; right:0; bottom:-3px; border:2px solid #090a0c !important; }
  .work-face-copy { min-width:0; }
  .work-face-copy > * { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .work-face-kind { color:#5A9BCB80; font:7px 'JetBrains Mono',monospace; letter-spacing:.08em; text-transform:uppercase; }
  .work-face-copy strong { margin-top:3px; color:#d4d4d8; font-size:11px; }
  .work-face-copy span:not(.work-face-kind) { margin-top:2px; color:#52525b; font-size:8px; }
  .work-face-copy em { margin-top:3px; color:#34343a; font:italic 7px 'JetBrains Mono',monospace; }
  .work-faces-empty { color:#34343a; font-size:10px; line-height:1.5; }
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
  .pulse-row-action { border-radius:5px; padding:3px 7px; font:600 8px 'JetBrains Mono',monospace; text-transform:uppercase; letter-spacing:.06em; cursor:pointer; transition:.15s; }
  .pulse-row-action:disabled { opacity:.45; cursor:wait; }
  .pulse-row-action.confirm { color:#C9A84C; border:1px solid #C9A84C35; background:#C9A84C0b; }
  .pulse-row-action.start { color:#5A9BCB; border:1px solid #5A9BCB35; background:#5A9BCB0b; }
  .pulse-row-action.complete { color:#1D9E75; border:1px solid #1D9E7535; background:#1D9E750b; }
  .pulse-row-action:hover { filter:brightness(1.35); }
  .pulse-engineer-trigger { max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border:0; background:transparent; color:#71717a; font-size:9px; cursor:pointer; text-decoration:underline; text-decoration-color:#27272a; text-underline-offset:3px; }
  .pulse-engineer-menu { position:absolute; right:8px; top:calc(100% - 4px); z-index:50; min-width:150px; overflow:hidden; border:1px solid #27272a; border-radius:7px; background:#101010; box-shadow:0 14px 30px #000a; }
  .pulse-engineer-menu button { display:block; width:100%; border:0; border-bottom:1px solid #1b1b1b; padding:8px 10px; background:transparent; color:#a1a1aa; text-align:left; font-size:10px; cursor:pointer; }
  .pulse-engineer-menu button:hover { background:#181818; color:#fff; }
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
  .circle-panel { padding:12px 14px; border-bottom:1px solid #111; background:linear-gradient(135deg,rgba(90,155,203,.045),transparent 62%); }
  .circle-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:10px; }
  .circle-head strong { display:block; margin-top:4px; color:#d4d4d8; font:12px 'DM Sans',sans-serif; }
  .circle-head > span { color:#57534e; border:1px solid #27272a; border-radius:10px; padding:2px 7px; font:7px 'JetBrains Mono',monospace; letter-spacing:.08em; text-transform:uppercase; }
  .circle-rail { display:flex; gap:8px; overflow-x:auto; padding-bottom:3px; scrollbar-width:thin; scrollbar-color:#262626 transparent; }
  .circle-person { min-width:176px; display:grid; grid-template-columns:38px minmax(0,1fr); align-items:center; column-gap:8px; row-gap:5px; padding:8px; border:1px solid #171717; border-radius:8px; background:rgba(9,10,12,.82); }
  .circle-avatar-wrap { position:relative; grid-row:1/3; }
  .circle-avatar-wrap i { position:absolute; right:-2px; bottom:-2px; width:14px; height:14px; display:grid; place-items:center; border-radius:50%; border:2px solid #090a0c; font:8px monospace; }
  .circle-verified { color:#07110e; background:#46a987; }
  .circle-private { color:#71717a; background:#202124; }
  .circle-person-copy { min-width:0; }
  .circle-person-copy strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#b8b8bd; font-size:10px; }
  .circle-person-copy span { display:block; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#3f3f46; font:7px 'JetBrains Mono',monospace; }
  .circle-person button { grid-column:2; justify-self:start; border:1px solid #5A9BCB35; border-radius:5px; padding:3px 7px; background:#5A9BCB0d; color:#78b4df; cursor:pointer; font:7px 'JetBrains Mono',monospace; text-transform:uppercase; letter-spacing:.08em; }
  .circle-person button:disabled { opacity:.45; cursor:wait; }
  .circle-person em { grid-column:2; color:#57534e; font:italic 7px 'JetBrains Mono',monospace; }
  .circle-person em.accepted { color:#3d806c; }
  .circle-empty { color:#34343a; font-size:10px; line-height:1.5; }

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
  .rcm-engineer { font-size:9px; color:#3a3a3a; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .rcm-progress { height:2px; background:#141414; border-radius:2px; overflow:hidden; margin-top:6px; }
  .rcm-progress div { height:100%; transition:width 10s linear; }
  .room-state-timeline { margin-top:7px; }
  .rst-track {
    position:relative; height:6px; overflow:hidden; border-radius:2px;
    background:linear-gradient(90deg,#111 0%,#161616 50%,#111 100%);
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.025);
  }
  .rst-block { position:absolute; top:1px; bottom:1px; min-width:2px; border-radius:1px; }
  .rst-block.complete { background:#1D9E7560; }
  .rst-block.upcoming { background:#C9A84C90; box-shadow:0 0 5px #C9A84C25; }
  .rst-block.active { background:#5A9BCB; box-shadow:0 0 7px #5A9BCB70; }
  .rst-now { position:absolute; z-index:2; top:-1px; bottom:-1px; width:1px; background:#f4f4f5; box-shadow:0 0 5px #fff; }
  .rst-axis { display:flex; justify-content:space-between; margin-top:3px; color:#292929; font:6px 'JetBrains Mono',monospace; letter-spacing:.08em; }

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
  .rcb-engineer { font-size:9px; color:#1a2a3a; margin-top:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .rcb-progress { height:2px; background:#0f1018; border-radius:2px; overflow:hidden; margin-top:6px; }
  .rcb-progress div { height:100%; transition:width 10s linear; }
  body.session-live .cmd-topbar  { border-bottom-color:#5A9BCB14; }

  @media (max-width:1100px) {
    .cmd { grid-template-columns:1fr; height:auto; min-height:100dvh; overflow-x:clip; overflow-y:visible; }
    .cmd-sidebar { width:100%; height:auto; position:sticky; top:0; z-index:40; overflow:visible; flex-direction:row; align-items:center; border-right:0; border-bottom:1px solid #151515; }
    .cmd-brand { width:auto; min-width:180px; border-bottom:0; border-right:1px solid #151515; }
    .cmd-vu-block,.cmd-rooms,.cmd-sidebar-pulse { display:none; }
    .cmd-nav { flex:1; justify-content:flex-end; gap:5px; }
    .cmd-nav-btn { flex:0 1 auto; width:auto; padding:0 10px; gap:7px; }
    .cmd-nav-label { display:inline; }
    .cmd-nav-tip { display:none; }
    .cmd-main { width:100%; height:auto; min-height:calc(100dvh - 57px); overflow:visible; }
    .cmd-body { grid-template-columns:230px minmax(0,1fr); overflow:visible; }
    .cmd-hub-col,.cmd-schedule-col,.cmd-intel-col { min-height:520px; }
    .cmd-intel-col { grid-column:1/-1; border-top:1px solid #111; min-height:0; }
    .cmd-intel-panel { max-height:none; overflow:visible; }
  }

  @media (max-width:720px) {
    .cmd::before, .cmd-main::before { display:none; }
    .cmd-sidebar { position:static; flex-wrap:wrap; }
    .cmd-brand { width:100%; border-right:0; padding:11px 14px; }
    .cmd-nav { width:100%; overflow-x:auto; justify-content:flex-start; border-top:1px solid #111; padding:7px 8px; }
    .cmd-nav-btn { min-width:max-content; }
    .cmd-topbar { height:auto; min-height:48px; padding:9px 12px; }
    .cmd-topbar-date,.cmd-topbar-divider,.cmd-clock-sec,.cmd-topbar-right .cmd-btn:first-child { display:none; }
    .cmd-hero { grid-template-columns:minmax(0,1fr) 104px; min-height:0; padding:18px 15px; gap:10px; }
    .hero-identity { margin-bottom:12px; }
    .hero-identity strong { font-size:22px; }
    .hero-identity-overline { font-size:5px; letter-spacing:.16em; }
    .pulse-dial { transform:scale(.68); margin:-24px; }
    .hero-artist-name { font-size:18px; white-space:normal; }
    .hero-detail { line-height:1.45; }
    .cmd-today-strip { overflow-x:auto; gap:14px; padding:10px 13px; }
    .cts-item { min-width:max-content; }
    .cmd-body { display:flex; flex-direction:column; }
    .cmd-hub-col { display:none; }
    .cmd-schedule-col { border-right:0; min-height:460px; }
    .cmd-schedule-head { align-items:flex-start; gap:10px; }
    .cmd-schedule-head > div .cmd-kpi-inline:nth-child(n+2) { display:none; }
    .cmd-session-row { padding:10px; gap:8px; }
    .csr-time { width:47px; }
    .csr-sub { max-width:150px; }
    .csr-amount { display:none; }
    .cmd-intel-col { min-height:0; }
  }

  @media (prefers-reduced-motion:reduce) {
    .cmd *, .cmd::before, .cmd::after { animation-duration:.001ms !important; animation-iteration-count:1 !important; scroll-behavior:auto !important; }
    .pulse-dial-sweep-rotor { display:none; }
    .pulse-vinyl-rotor { animation:none !important; }
  }
`;
