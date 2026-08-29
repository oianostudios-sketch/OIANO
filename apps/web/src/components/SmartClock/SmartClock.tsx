// ═══════════════════════════════════════════════════════════════════════════════
// OIANO SmartClock — Studio Instrument v2
// 20-person · 48-hour design standard
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState, useCallback } from 'react';
import { useClockData } from './useClockData';
import { useStudioState } from '../../context/StudioState';
import {
  arc, CX, CY, getPersonality,
  PHASE_COLOR, R, ROOM_COLOR, ROOM_PALETTE, ROOM_R,
  STATUS_COLOR, WAVE_N,
} from './smartClockModel';
import type { Personality } from './smartClockModel';
import { ClockDefs, HourTicks, SecondHand, SpinRings, WaveformRing } from './ClockPrimitives';
import { DayFace, PulseFace } from './ClockOverviewFaces';
import FocusFace from './ClockFocusFace';
import StudioFace from './ClockStudioFace';
import RoomArcs from './ClockRoomArcs';
import StudioConsole from './ClockStudioConsole';

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
            {mode === 'focus'  && <FocusFace  data={data} todayBookings={todayBookings} />}
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

const legendWrap: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', width: 300,
};

const legendItem: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7,
  color: 'rgba(255,255,255,0.3)', fontSize: 10,
  fontFamily: "'JetBrains Mono', monospace",
};
