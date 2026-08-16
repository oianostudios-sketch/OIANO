// ═══════════════════════════════════════════════════════════════════════════════
// OIANO SmartClock — Studio Instrument v2
// 20-person · 48-hour design standard
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ClockData, SessionPhase, SessionStatus, useClockData } from './useClockData';
import { useStudioState } from '../../context/StudioState';

// ── Layout ────────────────────────────────────────────────────────────────────
const CX = 160, CY = 160;
const R = {
  decoA:   150,   // outer deco spin ring
  decoB:   139,   // inner deco spin ring
  roomA:   129,   // Studio A session timeline
  roomB:   118,   // Studio B session timeline
  vocal:   107,   // Vocal Booth session timeline
  phase:    97,   // active session phase arc
  face:     93,   // inner face boundary
  waveOut:  88,   // live waveform outer
  waveIn:   76,   // live waveform inner
  needleTip: 96,  // where the now-needle dot sits (on face boundary)
} as const;

// ── Color system ──────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<SessionStatus, string> = {
  active:      '#3B8BFF',
  ending_soon: '#F0A63A',
  overtime:    '#D94A4A',
  idle:        '#5A9BCB', // Dome — "studio ready" now reads as Aegean blue, not gold
};

const ROOM_COLOR: Record<string, string> = {
  'Main Studio': '#3B8BFF',
  'Studio B':    '#9B6EFF',
  'Vocal Booth': '#1D9E75',
};
const ROOM_R     = [R.roomA, R.roomB, R.vocal] as const;
const ROOM_PALETTE = ['#3B8BFF', '#9B6EFF', '#1D9E75'];

const PHASE_COLOR: Record<SessionPhase, string> = {
  setup:     '#8EA0B8',
  recording: '#3B8BFF',
  break:     '#7C8794',
  review:    '#1D9E75',
  wrap_up:   '#F0A63A',
};

const STATUS_ALPHA: Record<string, number> = {
  CONFIRMED: 0.88,
  PENDING:   0.42,
  COMPLETED: 0.55,
  CANCELLED: 0.12,
  NO_SHOW:   0.12,
};

// ── Geometry ──────────────────────────────────────────────────────────────────
function polar(angle: number, r: number) {
  const rad = (angle - 90) * (Math.PI / 180);
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function arc(sa: number, ea: number, r: number): string {
  let end = ea <= sa ? ea + 360 : ea;
  if (end - sa >= 360) end = sa + 359.99;
  const s = polar(sa, r), e = polar(end, r);
  const large = end - sa > 180 ? 1 : 0;
  return `M${s.x.toFixed(2)},${s.y.toFixed(2)} A${r},${r},0,${large},1,${e.x.toFixed(2)},${e.y.toFixed(2)}`;
}

function isoAngle(iso: string): number {
  const d = new Date(iso);
  return ((d.getHours() * 60 + d.getMinutes()) / 1440) * 360;
}

function nowAngle(): number {
  const d = new Date();
  return ((d.getHours() * 60 + d.getMinutes()) / 1440) * 360;
}

function fmtTime(iso?: string | null) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtMs(ms: number): string {
  if (ms <= 0) return '00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function fmtMins(m: number | null | undefined): string {
  if (m == null) return '-';
  if (m < 0) return `${Math.abs(m)}m over`;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

// ── Personality engine ────────────────────────────────────────────────────────
type Personality = { label: string; sub: string };

const HOUR_PERSONAS: Array<{ min: number; max: number } & Personality> = [
  { min: 0,  max: 6,  label: 'GRAVEYARD HOURS', sub: 'The legendary sessions' },
  { min: 6,  max: 10, label: 'OPENING UP',       sub: 'Studio coming alive' },
  { min: 10, max: 13, label: 'MORNING SESSION',  sub: 'Peak focus window' },
  { min: 13, max: 15, label: 'MIDDAY LULL',      sub: 'Breath before the rush' },
  { min: 15, max: 20, label: 'PEAK HOURS',        sub: 'Full studio energy' },
  { min: 20, max: 23, label: 'EVENING GRIND',     sub: 'Night mode activated' },
  { min: 23, max: 24, label: 'LATE NIGHT',        sub: 'Where classics are made' },
];

function getPersonality(status: SessionStatus): Personality {
  if (status === 'overtime')    return { label: 'RUNNING DEEP',  sub: 'Overtime — keep going' };
  if (status === 'ending_soon') return { label: 'WRAPPING UP',   sub: 'Closing this chapter' };
  if (status === 'active')      return { label: 'IN SESSION',    sub: 'Booth is live' };
  const h = new Date().getHours();
  return HOUR_PERSONAS.find(p => h >= p.min && h < p.max) ?? HOUR_PERSONAS[5];
}

// ── Live waveform (pre-baked sine-sum, animated when live) ────────────────────
const WAVE_N = 64;
const WAVE_HEIGHTS = Array.from({ length: WAVE_N }, (_, i) => {
  const t = i / WAVE_N;
  const v = Math.sin(t * Math.PI * 6.7) * 0.38 + Math.cos(t * Math.PI * 4.2) * 0.28 + Math.sin(t * Math.PI * 2.1) * 0.2 + 0.35;
  return Math.max(0.08, Math.min(1, v));
});

// ── SVG Defs (gradients + glow filters) ──────────────────────────────────────
function ClockDefs({ color }: { color: string }) {
  return (
    <defs>
      {/* Face background */}
      <radialGradient id="ck-face-bg" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor="#151210" />
        <stop offset="100%" stopColor="#0a0a08" />
      </radialGradient>

      {/* Status glow halo — shifts with session color */}
      <radialGradient id="ck-face-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%"  stopColor={color} stopOpacity={0.1} />
        <stop offset="65%" stopColor={color} stopOpacity={0.03} />
        <stop offset="100%" stopColor={color} stopOpacity={0} />
      </radialGradient>

      {/* Soft glow (arcs, dots) */}
      <filter id="ck-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>

      {/* Tight glow (second hand, needle) */}
      <filter id="ck-glow-tight" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>

      {/* Strong glow (active session arc) */}
      <filter id="ck-glow-strong" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  );
}

// ── Decorative spin rings ─────────────────────────────────────────────────────
function SpinRings({ color, active }: { color: string; active: boolean }) {
  const origin = `${CX}px ${CY}px`;
  const [sDash, fDash] = active ? ['12 22', '4 20'] : ['8 30', '2 28'];
  const [sOp, fOp]     = active ? [0.25, 0.15] : [0.13, 0.08];
  const [sSec, fSec]   = active ? [28, 18] : [70, 45];

  return (
    <>
      <g style={{ transformOrigin: origin, animation: `ck-cw ${sSec}s linear infinite` }}>
        <circle cx={CX} cy={CY} r={R.decoA} fill="none"
          stroke={color} strokeWidth={1.2} strokeOpacity={sOp} strokeDasharray={sDash} />
      </g>
      <g style={{ transformOrigin: origin, animation: `ck-ccw ${fSec}s linear infinite` }}>
        <circle cx={CX} cy={CY} r={R.decoB} fill="none"
          stroke={color} strokeWidth={0.8} strokeOpacity={fOp} strokeDasharray={fDash} />
      </g>

      {/* Orbiting dot */}
      <g style={{ transformOrigin: origin, animation: `ck-cw ${active ? 12 : 22}s linear infinite` }}>
        <circle cx={CX} cy={CY - R.decoA} r={active ? 3.5 : 2.5}
          fill={color} fillOpacity={active ? 0.95 : 0.55}
          filter={active ? 'url(#ck-glow-tight)' : undefined}
        />
      </g>
      {/* Counter dot */}
      <g style={{ transformOrigin: origin, animation: `ck-ccw ${active ? 18 : 35}s linear infinite` }}>
        <circle cx={CX} cy={CY + R.decoB} r={active ? 2.5 : 1.8}
          fill={color} fillOpacity={active ? 0.6 : 0.28} />
      </g>
    </>
  );
}

// ── 24-hour tick marks ────────────────────────────────────────────────────────
function HourTicks({ color }: { color: string }) {
  const ticks = useMemo(() => Array.from({ length: 48 }, (_, i) => {
    const angle = (i / 48) * 360 - 90;
    const rad   = angle * (Math.PI / 180);
    const isMajor  = i % 12 === 0; // 0h, 6h, 12h, 18h
    const isMedium = i % 6 === 0;  // every 3h
    const r1 = R.decoA + 3;
    const r2 = isMajor ? r1 + 8 : isMedium ? r1 + 5 : r1 + 3;
    return { x1: CX + r1 * Math.cos(rad), y1: CY + r1 * Math.sin(rad),
             x2: CX + r2 * Math.cos(rad), y2: CY + r2 * Math.sin(rad),
             isMajor, isMedium, hour: i * 0.5 };
  }), []);

  return (
    <>
      {ticks.map((t, i) => (
        <line key={i}
          x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke={color}
          strokeWidth={t.isMajor ? 1.5 : t.isMedium ? 1 : 0.7}
          strokeOpacity={t.isMajor ? 0.5 : t.isMedium ? 0.28 : 0.12}
          strokeLinecap="round"
        />
      ))}
      {/* 6-hour labels */}
      {[0, 6, 12, 18].map(h => {
        const pt = polar((h / 24) * 360, R.decoA + 14);
        return (
          <text key={h} x={pt.x} y={pt.y}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={8} fill={color} fillOpacity={0.35}
            fontFamily="'JetBrains Mono', monospace">
            {String(h).padStart(2, '0')}
          </text>
        );
      })}
    </>
  );
}

// ── Three-ring room arcs ──────────────────────────────────────────────────────
interface RoomArcsProps {
  bookings: any[];
  rooms: { name: string }[];
  activeSessionId?: string;
  hoveredId: string | null;
  onHover: (id: string | null, booking: any | null) => void;
}

function RoomArcs({ bookings, rooms, activeSessionId, hoveredId, onHover }: RoomArcsProps) {
  const roomNames = rooms.slice(0, ROOM_R.length).map(room => room.name);
  const byRoom = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const name of roomNames) map[name] = [];
    for (const b of bookings) {
      const name = b.room?.name;
      if (map[name]) map[name].push(b);
    }
    return map;
  }, [bookings, roomNames.join('|')]);

  const now = Date.now();

  return (
    <>
      {roomNames.map((name, ri) => {
        const r     = ROOM_R[ri];
        const color = ROOM_COLOR[name] ?? ROOM_PALETTE[ri];
        const sessions = (byRoom[name] ?? []).filter(
          b => b.starts_at && b.ends_at && !['CANCELLED', 'NO_SHOW'].includes(b.status)
        );
        return (
          <g key={name}>
            {/* Track groove */}
            <circle cx={CX} cy={CY} r={r} fill="none"
              stroke="#111" strokeWidth={8} />
            <circle cx={CX} cy={CY} r={r} fill="none"
              stroke={color} strokeWidth={8} strokeOpacity={0.04} />

            {sessions.map(b => {
              const sa    = isoAngle(b.starts_at);
              const ea    = isoAngle(b.ends_at);
              const alpha = STATUS_ALPHA[b.status] ?? 0.5;
              const isActive   = b.id === activeSessionId;
              const isHovered  = b.id === hoveredId;
              const isRunning  = now >= new Date(b.starts_at).getTime() && now <= new Date(b.ends_at).getTime();

              return (
                <g key={b.id}
                  onMouseEnter={() => onHover(b.id, b)}
                  onMouseLeave={() => onHover(null, null)}
                  style={{ cursor: 'pointer' }}>
                  {/* Glow shadow for active running sessions */}
                  {(isActive || isRunning) && (
                    <path d={arc(sa, ea, r)} fill="none"
                      stroke={color} strokeWidth={14} strokeLinecap="round"
                      strokeOpacity={0.18} filter="url(#ck-glow-strong)" />
                  )}
                  {/* Main arc */}
                  <path d={arc(sa, ea, r)} fill="none"
                    stroke={color} strokeWidth={isHovered ? 10 : 8}
                    strokeLinecap="round"
                    strokeOpacity={isHovered ? 1 : isActive ? 0.95 : alpha}
                    style={{ transition: 'stroke-opacity 0.2s, stroke-width 0.15s' }}
                  />
                  {/* Start dot */}
                  {(() => { const p = polar(sa, r); return (
                    <circle cx={p.x} cy={p.y} r={isRunning ? 4 : 2.5}
                      fill={color} fillOpacity={isRunning ? 1 : 0.6}
                      filter={isRunning ? 'url(#ck-glow-tight)' : undefined} />
                  ); })()}
                </g>
              );
            })}
          </g>
        );
      })}
    </>
  );
}

// ── Waveform ring (live audio visualization) ──────────────────────────────────
function WaveformRing({ offset, color }: { offset: number; color: string }) {
  return (
    <>
      {WAVE_HEIGHTS.map((_, i) => {
        const h      = WAVE_HEIGHTS[(i + offset) % WAVE_N];
        const angle  = ((i / WAVE_N) * 360) - 90;
        const rad    = angle * (Math.PI / 180);
        const r1     = R.waveIn;
        const r2     = R.waveIn + h * (R.waveOut - R.waveIn);
        return (
          <line key={i}
            x1={CX + r1 * Math.cos(rad)} y1={CY + r1 * Math.sin(rad)}
            x2={CX + r2 * Math.cos(rad)} y2={CY + r2 * Math.sin(rad)}
            stroke={color} strokeWidth={1.8} strokeOpacity={0.3}
            strokeLinecap="round"
          />
        );
      })}
    </>
  );
}

// ── CSS-animated second hand ──────────────────────────────────────────────────
function SecondHand({ color }: { color: string }) {
  const delayRef = useRef<number>(0);
  useMemo(() => {
    const d = new Date();
    delayRef.current = -(d.getSeconds() + d.getMilliseconds() / 1000);
  }, []); // compute once on mount

  return (
    <g style={{
      transformOrigin: `${CX}px ${CY}px`,
      animation: `ck-second-sweep 60s linear infinite`,
      animationDelay: `${delayRef.current}s`,
    }}>
      {/* Main sweep line */}
      <line x1={CX} y1={CY - 105} x2={CX} y2={CY + 22}
        stroke={color} strokeWidth={0.9} strokeOpacity={0.65} strokeLinecap="round" />
      {/* Counterweight tail */}
      <line x1={CX} y1={CY + 22} x2={CX} y2={CY + 32}
        stroke={color} strokeWidth={3} strokeOpacity={0.35} strokeLinecap="round" />
      {/* Center pip */}
      <circle cx={CX} cy={CY} r={2.8} fill={color} fillOpacity={0.75} />
      <circle cx={CX} cy={CY} r={1.3} fill="#0a0a08" />
    </g>
  );
}

// ── Mode 0: STUDIO ────────────────────────────────────────────────────────────
interface FaceProps { data: ClockData | null; todayBookings: any[]; hoveredBooking: any | null; }

function StudioFace({ data, todayBookings, hoveredBooking }: FaceProps) {
  const [now, setNow]     = useState(new Date());
  const [angle, setAngle] = useState(nowAngle());

  useEffect(() => {
    const id = setInterval(() => { setNow(new Date()); setAngle(nowAngle()); }, 15_000);
    return () => clearInterval(id);
  }, []);

  const session  = data?.activeSession ?? null;
  const status   = data?.sessionStatus ?? 'idle';
  const color    = STATUS_COLOR[status];

  const nextSession = useMemo(() => {
    const nowMs = Date.now();
    return todayBookings
      .filter(b => b.starts_at && new Date(b.starts_at).getTime() > nowMs && !['CANCELLED', 'NO_SHOW'].includes(b.status))
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0] ?? null;
  }, [todayBookings]);

  const minsToNext = nextSession
    ? Math.max(0, Math.round((new Date(nextSession.starts_at).getTime() - Date.now()) / 60_000))
    : null;

  const sessionCount = todayBookings.filter(b => !['CANCELLED', 'NO_SHOW'].includes(b.status)).length;

  // What to show in center: hovered → session info, live → live info, else → idle
  const showHovered = !!hoveredBooking && !session;
  const showLive    = !!session;

  return (
    <>
      {/* Now needle */}
      <g transform={`rotate(${angle}, ${CX}, ${CY})`}>
        <line x1={CX} y1={CY - R.face + 6} x2={CX} y2={CY - R.face - 4}
          stroke={color} strokeWidth={2} strokeLinecap="round" />
      </g>
      {(() => { const p = polar(angle, R.face + 2); return (
        <circle cx={p.x} cy={p.y} r={4} fill={color}
          filter="url(#ck-glow-tight)" />
      ); })()}

      {/* Face */}
      <circle cx={CX} cy={CY} r={R.face} fill="url(#ck-face-bg)" />
      <circle cx={CX} cy={CY} r={R.face} fill="url(#ck-face-halo)" />
      <circle cx={CX} cy={CY} r={R.face} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.22} />

      {showHovered ? (
        /* Hovered booking details */
        <>
          <text x={CX} y={117} textAnchor="middle" fontSize={9} fill="#555"
            fontFamily="'JetBrains Mono', monospace" letterSpacing="0.1em">PREVIEW</text>
          <text x={CX} y={137} textAnchor="middle" fontSize={15} fill="#e4e4e7"
            fontFamily="'DM Sans', sans-serif" fontWeight={700}>
            {hoveredBooking.artist?.name ?? 'Artist'}
          </text>
          <text x={CX} y={153} textAnchor="middle" fontSize={10} fill={ROOM_COLOR[hoveredBooking.room?.name] ?? '#888'}
            fontFamily="'JetBrains Mono', monospace">
            {hoveredBooking.room?.name ?? 'Room TBA'}
          </text>
          <line x1={122} y1={163} x2={198} y2={163} stroke={color} strokeWidth={0.5} strokeOpacity={0.2} />
          <text x={CX} y={178} textAnchor="middle" fontSize={18} fill={color}
            fontFamily="'JetBrains Mono', monospace" fontWeight={700}>
            {fmtTime(hoveredBooking.starts_at)}
          </text>
          <text x={CX} y={195} textAnchor="middle" fontSize={10} fill="#444"
            fontFamily="'JetBrains Mono', monospace">
            → {fmtTime(hoveredBooking.ends_at)}
          </text>
          <text x={CX} y={215} textAnchor="middle" fontSize={11} fill={
            hoveredBooking.status === 'CONFIRMED' ? '#3B8BFF' :
            hoveredBooking.status === 'PENDING'   ? '#C9A84C' :
            hoveredBooking.status === 'COMPLETED' ? '#1D9E75' : '#555'
          } fontFamily="'JetBrains Mono', monospace" letterSpacing="0.08em">
            {hoveredBooking.status}
          </text>
        </>
      ) : showLive ? (
        /* Live session */
        <>
          <text x={CX} y={110} textAnchor="middle" fontSize={8} fill={color}
            fontFamily="'JetBrains Mono', monospace" letterSpacing="0.14em">
            ● LIVE
          </text>
          <text x={CX} y={130} textAnchor="middle" fontSize={22} fill="#E6EDF5"
            fontFamily="'JetBrains Mono', monospace" fontWeight={700}>
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </text>
          <text x={CX} y={148} textAnchor="middle" fontSize={12} fill="#e4e4e7"
            fontFamily="'DM Sans', sans-serif" fontWeight={700}>
            {session!.artistName}
          </text>
          <text x={CX} y={163} textAnchor="middle" fontSize={10}
            fill={ROOM_COLOR[session!.room] ?? '#888'}
            fontFamily="'JetBrains Mono', monospace">{session!.room}</text>
          <line x1={120} y1={172} x2={200} y2={172} stroke={color} strokeWidth={0.5} strokeOpacity={0.2} />
          <text x={CX} y={190} textAnchor="middle" fontSize={22} fill={color}
            fontFamily="'JetBrains Mono', monospace" fontWeight={700}>
            {fmtMins(session!.minutesRemaining)}
          </text>
          <text x={CX} y={206} textAnchor="middle" fontSize={9} fill="#444"
            fontFamily="'JetBrains Mono', monospace">left in session</text>
          {/* Progress bar */}
          <rect x={122} y={216} width={76} height={3} rx={1.5} fill="#1a1a1a" />
          <rect x={122} y={216}
            width={Math.round(76 * Math.min(1, session!.minutesElapsed / Math.max(1, session!.minutesTotal)))}
            height={3} rx={1.5} fill={color} />
          <text x={CX} y={232} textAnchor="middle" fontSize={9} fill="#333"
            fontFamily="'JetBrains Mono', monospace" letterSpacing="0.1em">
            {session!.phaseLabel}
          </text>
        </>
      ) : (
        /* Idle / next session */
        <>
          <text x={CX} y={120} textAnchor="middle" fontSize={28} fill="#E6EDF5"
            fontFamily="'JetBrains Mono', monospace" fontWeight={300}>
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </text>
          <text x={CX} y={140} textAnchor="middle" fontSize={9} fill="#5A9BCB"
            fontFamily="'JetBrains Mono', monospace" letterSpacing="0.16em">
            ◎  STUDIO READY
          </text>
          <line x1={120} y1={150} x2={200} y2={150} stroke="#5A9BCB" strokeWidth={0.5} strokeOpacity={0.2} />

          {nextSession ? (
            <>
              <text x={CX} y={165} textAnchor="middle" fontSize={9} fill="#444"
                fontFamily="'JetBrains Mono', monospace" letterSpacing="0.08em">next session in</text>
              <text x={CX} y={188} textAnchor="middle" fontSize={22} fill="#5A9BCB"
                fontFamily="'JetBrains Mono', monospace" fontWeight={700}>
                {minsToNext != null ? `${minsToNext}m` : '--'}
              </text>
              <text x={CX} y={207} textAnchor="middle" fontSize={13} fill="#e4e4e7"
                fontFamily="'DM Sans', sans-serif" fontWeight={600}>
                {nextSession.artist?.name ?? 'Artist'}
              </text>
              <text x={CX} y={222} textAnchor="middle" fontSize={10} fill="#555"
                fontFamily="'JetBrains Mono', monospace">
                {fmtTime(nextSession.starts_at)} · {nextSession.room?.name ?? 'TBA'}
              </text>
            </>
          ) : (
            <>
              <text x={CX} y={172} textAnchor="middle" fontSize={11} fill="#333"
                fontFamily="'DM Sans', sans-serif">No sessions remaining</text>
              <text x={CX} y={190} textAnchor="middle" fontSize={9} fill="#222"
                fontFamily="'JetBrains Mono', monospace">Ready to book</text>
            </>
          )}

          <text x={CX} y={242} textAnchor="middle" fontSize={9} fill="#2a2a2a"
            fontFamily="'JetBrains Mono', monospace" letterSpacing="0.1em">
            {sessionCount} booked today
          </text>
        </>
      )}
    </>
  );
}

// ── Mode 1: FOCUS (countdown) ─────────────────────────────────────────────────
function FocusFace({ data, todayBookings }: FaceProps) {
  const [ms, setMs]     = useState(0);
  const [pct, setPct]   = useState(0);
  const [label, setLabel] = useState('');
  const session = data?.activeSession ?? null;

  useEffect(() => {
    function calc() {
      const now = Date.now();
      if (session?.endsAt) {
        const end  = new Date(session.endsAt).getTime();
        const span = new Date(session.scheduledAt).getTime();
        const rem  = end - now;
        setMs(Math.max(0, rem));
        setPct(Math.max(0, Math.min(1, 1 - rem / (end - span))));
        setLabel(rem < 900_000 ? '⚡ CLOSING SOON' : 'until session ends');
      } else {
        const next = todayBookings
          .filter(b => b.starts_at && new Date(b.starts_at).getTime() > now && !['CANCELLED', 'NO_SHOW'].includes(b.status))
          .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
        if (next) {
          const start = new Date(next.starts_at).getTime();
          const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
          const rem = start - now;
          setMs(Math.max(0, rem));
          setPct(Math.max(0, Math.min(1, 1 - rem / (start - dayStart.getTime()))));
          setLabel(`until ${next.artist?.name ?? 'next session'}`);
        } else {
          setMs(0); setPct(0); setLabel('no sessions pending');
        }
      }
    }
    calc();
    const id = setInterval(calc, 500);
    return () => clearInterval(id);
  }, [session, todayBookings]);

  const ringAngle  = pct * 359.99;
  const status     = data?.sessionStatus ?? 'idle';
  const color      = STATUS_COLOR[status];
  const urgent     = session && pct > 0.85;
  const urgentColor = '#D94A4A';

  return (
    <>
      {/* Track */}
      <circle cx={CX} cy={CY} r={R.roomA} fill="none" stroke="#111" strokeWidth={10} />
      {/* Fill */}
      {ringAngle > 0 && (
        <>
          {urgent && (
            <path d={arc(0, ringAngle, R.roomA)} fill="none"
              stroke={urgentColor} strokeWidth={16} strokeLinecap="round"
              strokeOpacity={0.12} filter="url(#ck-glow-strong)" />
          )}
          <path d={arc(0, ringAngle, R.roomA)} fill="none"
            stroke={urgent ? urgentColor : color}
            strokeWidth={10} strokeLinecap="round" strokeOpacity={0.9} />
        </>
      )}
      {/* Inner face */}
      <circle cx={CX} cy={CY} r={R.face} fill="url(#ck-face-bg)" />
      <circle cx={CX} cy={CY} r={R.face} fill="url(#ck-face-halo)" />
      <circle cx={CX} cy={CY} r={R.face} fill="none" stroke={urgent ? urgentColor : color}
        strokeWidth={1} strokeOpacity={0.25} />

      <text x={CX} y={126} textAnchor="middle" fontSize={9} fill="#444"
        fontFamily="'JetBrains Mono', monospace" letterSpacing="0.14em">FOCUS MODE</text>

      <text x={CX} y={158} textAnchor="middle"
        fontFamily="'JetBrains Mono', monospace"
        fontSize={ms > 3_600_000 ? 24 : 32}
        fill={urgent ? urgentColor : '#E6EDF5'}
        fontWeight={700}
        filter={urgent ? 'url(#ck-glow-tight)' : undefined}>
        {ms > 0 ? fmtMs(ms) : '—'}
      </text>

      <text x={CX} y={176} textAnchor="middle" fontSize={10} fill={urgent ? urgentColor : color}
        fontFamily="'JetBrains Mono', monospace" letterSpacing="0.06em">{label}</text>

      <line x1={120} y1={187} x2={200} y2={187} stroke={color} strokeWidth={0.5} strokeOpacity={0.2} />

      <text x={CX} y={208} textAnchor="middle" fontSize={28} fill={urgent ? urgentColor : color}
        fontFamily="'JetBrains Mono', monospace" fontWeight={700}>
        {Math.round(pct * 100)}%
      </text>
      <text x={CX} y={225} textAnchor="middle" fontSize={10} fill="#444"
        fontFamily="system-ui">of window elapsed</text>

      {session && (
        <text x={CX} y={244} textAnchor="middle" fontSize={10} fill="#555"
          fontFamily="'JetBrains Mono', monospace">
          {session.artistName} · {session.room}
        </text>
      )}
    </>
  );
}

// ── Mode 2: DAY (radial timeline) ─────────────────────────────────────────────
function DayFace({ todayBookings, rooms }: Pick<FaceProps, 'todayBookings'> & { rooms: { name: string }[] }) {
  const roomNames = rooms.slice(0, ROOM_R.length).map(room => room.name);
  const [nowAng, setNowAng] = useState(nowAngle());
  useEffect(() => {
    const id = setInterval(() => setNowAng(nowAngle()), 30_000);
    return () => clearInterval(id);
  }, []);

  const confirmed = todayBookings.filter(b => b.status === 'CONFIRMED').length;
  const pending   = todayBookings.filter(b => b.status === 'PENDING').length;
  const done      = todayBookings.filter(b => b.status === 'COMPLETED').length;
  const total     = todayBookings.filter(b => !['CANCELLED', 'NO_SHOW'].includes(b.status)).length;

  return (
    <>
      {/* Track backgrounds */}
      {roomNames.map((name, ri) => (
        <circle key={name} cx={CX} cy={CY} r={ROOM_R[ri]} fill="none"
          stroke={ROOM_COLOR[name] ?? ROOM_PALETTE[ri]} strokeWidth={8} strokeOpacity={0.06} />
      ))}

      {/* Now needle — extends all the way through all rings */}
      <line
        x1={CX + (R.face - 4) * Math.cos((nowAng - 90) * Math.PI / 180)}
        y1={CY + (R.face - 4) * Math.sin((nowAng - 90) * Math.PI / 180)}
        x2={CX + (R.decoA + 18) * Math.cos((nowAng - 90) * Math.PI / 180)}
        y2={CY + (R.decoA + 18) * Math.sin((nowAng - 90) * Math.PI / 180)}
        stroke="#C9A84C" strokeWidth={1} strokeOpacity={0.5}
        strokeDasharray="3 6"
      />
      {(() => { const p = polar(nowAng, R.decoA + 4); return (
        <circle cx={p.x} cy={p.y} r={4} fill="#C9A84C" filter="url(#ck-glow-tight)" />
      ); })()}

      {/* Inner face */}
      <circle cx={CX} cy={CY} r={R.face} fill="url(#ck-face-bg)" />
      <circle cx={CX} cy={CY} r={R.face} fill="none" stroke="#C9A84C" strokeWidth={1} strokeOpacity={0.15} />

      {/* Stats */}
      <text x={CX} y={112} textAnchor="middle" fontSize={9} fill="#444"
        fontFamily="'JetBrains Mono', monospace" letterSpacing="0.12em">DAY OVERVIEW</text>
      <text x={CX} y={148} textAnchor="middle"
        fontFamily="'Playfair Display', serif" fontSize={38} fill="#E6EDF5">{total}</text>
      <text x={CX} y={164} textAnchor="middle" fontSize={10} fill="#666" fontFamily="'DM Sans', sans-serif">
        sessions today
      </text>
      <line x1={118} y1={174} x2={202} y2={174} stroke="#C9A84C" strokeWidth={0.5} strokeOpacity={0.2} />

      <text x={CX - 32} y={193} textAnchor="middle" fontSize={16} fill="#3B8BFF"
        fontFamily="'JetBrains Mono', monospace" fontWeight={700}>{confirmed}</text>
      <text x={CX}      y={193} textAnchor="middle" fontSize={16} fill="#C9A84C"
        fontFamily="'JetBrains Mono', monospace" fontWeight={700}>{pending}</text>
      <text x={CX + 32} y={193} textAnchor="middle" fontSize={16} fill="#1D9E75"
        fontFamily="'JetBrains Mono', monospace" fontWeight={700}>{done}</text>
      <text x={CX - 32} y={207} textAnchor="middle" fontSize={8} fill="#333" fontFamily="system-ui">conf</text>
      <text x={CX}      y={207} textAnchor="middle" fontSize={8} fill="#333" fontFamily="system-ui">pend</text>
      <text x={CX + 32} y={207} textAnchor="middle" fontSize={8} fill="#333" fontFamily="system-ui">done</text>

      {/* Room legend */}
      {roomNames.map((name, i) => {
        const y = 222 + i * 11;
        return (
          <g key={name}>
            <circle cx={120} cy={y - 2} r={3.5} fill={ROOM_COLOR[name] ?? ROOM_PALETTE[i]} fillOpacity={0.8} />
            <text x={128} y={y} fontSize={8} fill="#444" fontFamily="'JetBrains Mono', monospace">
              {name}
            </text>
          </g>
        );
      })}
    </>
  );
}

// ── Mode 3: PULSE (utilization) ───────────────────────────────────────────────
function PulseFace({ utilizationPct, weekSessions, todayBookings }: {
  utilizationPct: number; weekSessions: number; todayBookings: any[];
}) {
  const arcAngle = Math.max(0, Math.min(359.99, (utilizationPct / 100) * 360));
  const color    = utilizationPct >= 70 ? '#1D9E75' : utilizationPct >= 40 ? '#C9A84C' : '#3B8BFF';
  const health   = utilizationPct >= 70 ? 'HEALTHY' : utilizationPct >= 40 ? 'BUILDING' : 'QUIET';

  const confirmed  = todayBookings.filter(b => b.status === 'CONFIRMED').length;
  const completed  = todayBookings.filter(b => b.status === 'COMPLETED').length;
  const total      = todayBookings.filter(b => !['CANCELLED', 'NO_SHOW'].includes(b.status)).length;

  return (
    <>
      {/* Utilization track */}
      <circle cx={CX} cy={CY} r={R.roomA} fill="none" stroke="#111" strokeWidth={10} />
      {arcAngle > 0 && (
        <>
          <path d={arc(0, arcAngle, R.roomA)} fill="none"
            stroke={color} strokeWidth={16} strokeLinecap="round"
            strokeOpacity={0.12} filter="url(#ck-glow-strong)" />
          <path d={arc(0, arcAngle, R.roomA)} fill="none"
            stroke={color} strokeWidth={10} strokeLinecap="round" strokeOpacity={0.88} />
        </>
      )}
      {/* Needle at utilization point */}
      {(() => { const p = polar(arcAngle, R.roomA); return (
        <circle cx={p.x} cy={p.y} r={5} fill={color} filter="url(#ck-glow-tight)" />
      ); })()}

      {/* Inner face */}
      <circle cx={CX} cy={CY} r={R.face} fill="url(#ck-face-bg)" />
      <circle cx={CX} cy={CY} r={R.face} fill="url(#ck-face-halo)" />
      <circle cx={CX} cy={CY} r={R.face} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.22} />

      <text x={CX} y={112} textAnchor="middle" fontSize={9} fill="#444"
        fontFamily="'JetBrains Mono', monospace" letterSpacing="0.14em">STUDIO PULSE</text>

      <text x={CX} y={154} textAnchor="middle"
        fontFamily="'JetBrains Mono', monospace"
        fontSize={42} fill={color} fontWeight={700}
        filter="url(#ck-glow-tight)">
        {utilizationPct}%
      </text>
      <text x={CX} y={170} textAnchor="middle" fontSize={9} fill={color}
        fontFamily="'JetBrains Mono', monospace" letterSpacing="0.16em">{health}</text>

      <line x1={112} y1={180} x2={208} y2={180} stroke={color} strokeWidth={0.5} strokeOpacity={0.18} />

      <text x={CX - 34} y={199} textAnchor="middle" fontSize={17} fill="#3B8BFF"
        fontFamily="'JetBrains Mono', monospace" fontWeight={700}>{confirmed}</text>
      <text x={CX}      y={199} textAnchor="middle" fontSize={17} fill="#1D9E75"
        fontFamily="'JetBrains Mono', monospace" fontWeight={700}>{completed}</text>
      <text x={CX + 34} y={199} textAnchor="middle" fontSize={17} fill="#C9A84C"
        fontFamily="'JetBrains Mono', monospace" fontWeight={700}>{total}</text>
      <text x={CX - 34} y={212} textAnchor="middle" fontSize={8} fill="#333" fontFamily="system-ui">conf</text>
      <text x={CX}      y={212} textAnchor="middle" fontSize={8} fill="#333" fontFamily="system-ui">done</text>
      <text x={CX + 34} y={212} textAnchor="middle" fontSize={8} fill="#333" fontFamily="system-ui">total</text>

      <line x1={112} y1={222} x2={208} y2={222} stroke={color} strokeWidth={0.5} strokeOpacity={0.12} />

      <text x={CX} y={237} textAnchor="middle" fontSize={10} fill="#555" fontFamily="'DM Sans', sans-serif">
        {weekSessions} sessions this week
      </text>
    </>
  );
}

// ── Personality bar (inside SVG, bottom of face) ──────────────────────────────
function PersonalityBar({ persona, color }: { persona: Personality; color: string }) {
  return (
    <>
      <line x1={94} y1={270} x2={226} y2={270} stroke={color} strokeWidth={0.4} strokeOpacity={0.15} />
      <text x={CX} y={282} textAnchor="middle" fontSize={8} fill={color}
        fontFamily="'JetBrains Mono', monospace" letterSpacing="0.18em" fillOpacity={0.7}>
        {persona.label}
      </text>
      <text x={CX} y={294} textAnchor="middle" fontSize={7} fill="#333"
        fontFamily="'Playfair Display', serif" fontStyle="italic">
        {persona.sub}
      </text>
    </>
  );
}

// ── Mode bar (HTML tabs below clock) ─────────────────────────────────────────
const MODES = ['studio', 'focus', 'day', 'pulse'] as const;
type ClockMode = typeof MODES[number];
const MODE_ICONS: Record<ClockMode, string> = { studio: '◉', focus: '⏱', day: '◫', pulse: '▲' };
const MODE_LABELS: Record<ClockMode, string> = { studio: 'STUDIO', focus: 'FOCUS', day: 'DAY', pulse: 'PULSE' };

function ModeBar({ mode, color, onSelect }: { mode: ClockMode; color: string; onSelect: (m: ClockMode) => void }) {
  return (
    <div role="tablist" aria-label="Studio Clock view" style={{
      display: 'flex', gap: 2, background: '#0d0d0d',
      border: '1px solid #1a1a1a', borderRadius: 8, padding: 3,
      width: 'fit-content',
    }}>
      {MODES.map(m => {
        const active = m === mode;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls="studio-clock-display"
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(m)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const current = MODES.indexOf(m);
              const next = event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? MODES.length - 1
                  : (current + (event.key === 'ArrowRight' ? 1 : -1) + MODES.length) % MODES.length;
              onSelect(MODES[next]);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]
                ?.focus();
            }}
            style={{
            background: active ? '#1a1a1a' : 'transparent',
            border: active ? `1px solid ${color}22` : '1px solid transparent',
            borderRadius: 6,
            color: active ? color : '#333',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9, letterSpacing: '0.14em',
            padding: '5px 10px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'all 0.15s ease',
          }}>
            <span style={{ fontSize: 10 }}>{MODE_ICONS[m]}</span>
            {MODE_LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}

// ── Studio console (status panel) ────────────────────────────────────────────
const PHASES: Array<{ value: SessionPhase; label: string }> = [
  { value: 'setup',     label: 'Setup' },
  { value: 'recording', label: 'Recording' },
  { value: 'break',     label: 'Break' },
  { value: 'review',    label: 'Review' },
  { value: 'wrap_up',   label: 'Wrap-up' },
];

interface ConsoleProps {
  data: ClockData | null;
  color: string;
  setPhase: (id: string, phase: SessionPhase) => Promise<void>;
  markActivity: (id: string) => Promise<void>;
  logOvertime: (id: string, mins: number) => Promise<void>;
  error: string | null;
}

function StudioConsole({ data, color, setPhase, markActivity, logOvertime, error }: ConsoleProps) {
  const session = data?.activeSession ?? null;

  return (
    <div style={{
      width: 300, background: '#0e0e0e',
      border: `1px solid ${color}18`,
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        background: session ? `${color}0a` : '#0a0a0a',
        borderBottom: `1px solid ${color}14`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: session ? color : '#2a2a2a',
          boxShadow: session ? `0 0 8px ${color}` : 'none',
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, letterSpacing: '0.14em',
          color: session ? color : '#333',
        }}>
          {session ? `IN SESSION · ${session.room}` : 'STUDIO CONSOLE'}
        </span>
        {session && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#e4e4e7', fontWeight: 600 }}>
            {session.artistName}
          </span>
        )}
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        {[
          { label: 'Status',    value: (data?.sessionStatus ?? 'idle').replace(/_/g, ' '),   accent: true },
          { label: 'Phase',     value: session?.phaseLabel ?? '—',    accent: !!session },
          { label: 'Elapsed',   value: fmtMins(session?.minutesElapsed),  accent: false },
          { label: 'Remaining', value: fmtMins(session?.minutesRemaining), accent: !!session },
          { label: 'Est end',   value: fmtTime(data?.prediction.estimatedEndTime), accent: false },
          { label: 'OT logged', value: session?.overtimeLoggedMinutes ? `${session.overtimeLoggedMinutes}m` : '—', accent: (session?.overtimeLoggedMinutes ?? 0) > 0 },
        ].map((row, i) => (
          <div key={row.label} style={{
            padding: '8px 14px',
            borderBottom: '1px solid #111',
            borderRight: i % 2 === 0 ? '1px solid #111' : 'none',
          }}>
            <div style={{ fontSize: 9, color: '#333', fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.1em', marginBottom: 3 }}>
              {row.label.toUpperCase()}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
              color: row.accent ? color : '#888', textTransform: 'capitalize' }}>
              {row.value}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      {session && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid #111' }}>
          <div style={{ fontSize: 9, color: '#333', fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.1em', marginBottom: 8 }}>PHASE CONTROL</div>
          <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
            {PHASES.map(p => (
              <button key={p.value}
                onClick={() => setPhase(session.id, p.value)}
                style={{
                  flex: 1, background: session.phase === p.value ? `${PHASE_COLOR[p.value]}22` : '#111',
                  border: `1px solid ${session.phase === p.value ? PHASE_COLOR[p.value] + '44' : '#1a1a1a'}`,
                  borderRadius: 4, color: session.phase === p.value ? PHASE_COLOR[p.value] : '#444',
                  fontSize: 8, padding: '5px 2px', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.06em', transition: 'all 0.15s',
                }}>
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button onClick={() => markActivity(session.id)} style={consoleBtn}>
              ● Mark Activity
            </button>
            <button onClick={() => logOvertime(session.id, 30)} style={consoleBtn}>
              + 30m Overtime
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid #1a1a1a',
          fontSize: 10, color: '#D94A4A', fontFamily: "'JetBrains Mono', monospace" }}>
          ⚠ {error}
        </div>
      )}
    </div>
  );
}

// ── Main SmartClock ───────────────────────────────────────────────────────────
export interface SmartClockProps {
  size?: number;
  showLegend?: boolean;
  showStatusBar?: boolean;
  utilizationPct?: number;
  weekSessions?: number;
  defaultMode?: ClockMode;
}

export default function SmartClock({
  size = 320,
  showLegend = true,
  showStatusBar = true,
  utilizationPct = 0,
  weekSessions = 0,
  defaultMode = 'studio',
}: SmartClockProps) {
  const { data, loading, error, markActivity, setPhase, logOvertime } = useClockData();
  const studioState = useStudioState();
  const [mode, setMode]             = useState<ClockMode>(defaultMode);
  const [hoveredId, setHoveredId]   = useState<string | null>(null);
  const [hoveredBk, setHoveredBk]   = useState<any | null>(null);
  const [waveOffset, setWaveOffset] = useState(0);

  const status       = data?.sessionStatus ?? 'idle';
  const session      = data?.activeSession ?? null;
  const color        = STATUS_COLOR[status];
  const todayBookings = studioState.todaySessions;
  const isLive       = !!session;
  const persona      = getPersonality(status);

  // Waveform animation (250ms steps when live)
  useEffect(() => {
    if (!isLive) { setWaveOffset(0); return; }
    const id = setInterval(() => setWaveOffset(o => (o + 1) % WAVE_N), 250);
    return () => clearInterval(id);
  }, [isLive]);

  const handleHover = useCallback((id: string | null, bk: any | null) => {
    setHoveredId(id);
    setHoveredBk(bk);
  }, []);

  return (
    <div style={wrapStyle}>
      <style>{ANIM_CSS}</style>

      {/* Clock SVG */}
      <div style={{ position: 'relative', userSelect: 'none' }}>
        {/* Idle ambient glow */}
        {!isLive && (
          <div className="ck-idle-halo" style={{
            position: 'absolute', inset: -16, borderRadius: '50%', pointerEvents: 'none',
            background: 'radial-gradient(circle, #5A9BCB0a 0%, transparent 70%)',
          }} />
        )}

        <svg
          id="studio-clock-display"
          role="img"
          width={size} height={size} viewBox="0 0 320 320"
          style={{ overflow: 'visible', display: 'block' }}
          aria-label={`OIANO Studio Clock — ${mode} mode`}
        >
          <ClockDefs color={color} />

          <HourTicks color={color} />
          <SpinRings color={color} active={isLive} />

          {/* Live pulse ring — breathes outward from face when session active */}
          {isLive && (
            <circle cx={CX} cy={CY} r={R.face + 6} fill="none"
              stroke={color} strokeWidth={1.5} strokeOpacity={0}>
              <animate attributeName="r"
                values={`${R.face + 2};${R.face + 22}`}
                dur="2.4s" repeatCount="indefinite" calcMode="spline"
                keySplines="0.4 0 0.6 1" />
              <animate attributeName="stroke-opacity"
                values="0.55;0"
                dur="2.4s" repeatCount="indefinite" calcMode="spline"
                keySplines="0.4 0 0.6 1" />
            </circle>
          )}

          {/* Room arcs — always visible across all modes for context */}
          <g className="ck-arc-group">
          <RoomArcs
            bookings={todayBookings}
            rooms={studioState.roomStatus}
            activeSessionId={session?.id}
            hoveredId={hoveredId}
            onHover={handleHover}
          />
          </g>

          {/* Phase arc (thin ring inside room arcs) */}
          {session && (() => {
            const phaseArc = data?.phaseRing.find(p => p.active);
            if (!phaseArc) return null;
            return (
              <path d={arc(phaseArc.startAngle, phaseArc.endAngle, R.phase)}
                fill="none" stroke={PHASE_COLOR[session.phase]}
                strokeWidth={3} strokeLinecap="round" strokeOpacity={0.7} />
            );
          })()}

          {/* Face background */}
          <circle cx={CX} cy={CY} r={R.face} fill="url(#ck-face-bg)" />

          {/* Live waveform ring */}
          {isLive && <WaveformRing offset={waveOffset} color={color} />}

          {/* Mode faces */}
          <g style={{ opacity: 1, transition: 'opacity 0.2s ease' }}>
            {mode === 'studio' && <StudioFace data={data} todayBookings={todayBookings} hoveredBooking={hoveredBk} />}
            {mode === 'focus'  && <FocusFace  data={data} todayBookings={todayBookings} hoveredBooking={hoveredBk} />}
            {mode === 'day'    && <DayFace    todayBookings={todayBookings} rooms={studioState.roomStatus} />}
            {mode === 'pulse'  && <PulseFace  utilizationPct={utilizationPct} weekSessions={weekSessions} todayBookings={todayBookings} />}
          </g>

          {/* Second hand — always visible */}
          <SecondHand color={color} />

          {/* Personality bar */}
          <PersonalityBar persona={persona} color={color} />

          {/* Loading overlay */}
          {loading && !data && (
            <text x={CX} y={CY} textAnchor="middle" fontFamily="'JetBrains Mono', monospace"
              fontSize={11} fill="#444">connecting…</text>
          )}
        </svg>
      </div>

      {/* Mode selector */}
      <ModeBar mode={mode} color={color} onSelect={setMode} />

      {/* Studio console */}
      {showStatusBar && (
        <StudioConsole
          data={data} color={color}
          setPhase={setPhase}
          markActivity={markActivity}
          logOvertime={logOvertime}
          error={error}
        />
      )}

      {/* Legend */}
      {showLegend && (
        <div style={legendWrap}>
          {[
            { color: STATUS_COLOR.active,      label: 'Active' },
            { color: STATUS_COLOR.ending_soon, label: 'Ending soon' },
            { color: STATUS_COLOR.overtime,    label: 'Overtime' },
            { color: STATUS_COLOR.idle,        label: 'Idle' },
            ...studioState.roomStatus.slice(0, ROOM_R.length).map((room, index) => ({
              color: ROOM_COLOR[room.name] ?? ROOM_PALETTE[index], label: room.name,
            })),
          ].map(item => (
            <div key={item.label} style={legendItem}>
              <span style={{ width: 8, height: 8, background: item.color, borderRadius: 2, display: 'block' }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const ANIM_CSS = `
  @keyframes ck-cw           { from { transform: rotate(0deg); }    to { transform: rotate(360deg); } }
  @keyframes ck-ccw          { from { transform: rotate(0deg); }    to { transform: rotate(-360deg); } }
  @keyframes ck-second-sweep { from { transform: rotate(0deg); }    to { transform: rotate(360deg); } }
  @keyframes ck-idle-breathe { 0%,100% { opacity:0.5; transform:scale(1); } 50% { opacity:1; transform:scale(1.05); } }
  .ck-idle-halo { animation: ck-idle-breathe 5s ease-in-out infinite; }
`;

const wrapStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
};

const consoleBtn: React.CSSProperties = {
  background: '#111', border: '1px solid #1e1e1e', borderRadius: 5,
  color: '#555', fontSize: 10, padding: '7px 10px', cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em',
  transition: 'color 0.15s, border-color 0.15s',
};

const legendWrap: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', width: 300,
};

const legendItem: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7,
  color: 'rgba(255,255,255,0.3)', fontSize: 10,
  fontFamily: "'JetBrains Mono', monospace",
};
