import type { CSSProperties } from 'react';
import type { ClockData, SessionPhase } from './useClockData';
import { fmtMins, fmtTime, PHASE_COLOR } from './smartClockModel';

const PHASES: Array<{ value: SessionPhase; label: string }> = [
  { value: 'setup', label: 'Setup' },
  { value: 'recording', label: 'Recording' },
  { value: 'break', label: 'Break' },
  { value: 'review', label: 'Review' },
  { value: 'wrap_up', label: 'Wrap-up' },
];

interface Props {
  data: ClockData | null;
  color: string;
  setPhase: (id: string, phase: SessionPhase) => Promise<void>;
  markActivity: (id: string) => Promise<void>;
  logOvertime: (id: string, mins: number) => Promise<void>;
  error: string | null;
}

const buttonStyle: CSSProperties = {
  background: '#111', border: '1px solid #1e1e1e', borderRadius: 5,
  color: '#555', fontSize: 10, padding: '7px 10px', cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em',
  transition: 'color 0.15s, border-color 0.15s',
};

export default function StudioConsole({ data, color, setPhase, markActivity, logOvertime, error }: Props) {
  const session = data?.activeSession ?? null;
  const metrics = [
    { label: 'Status', value: (data?.sessionStatus ?? 'idle').replace(/_/g, ' '), accent: true },
    { label: 'Phase', value: session?.phaseLabel ?? '—', accent: Boolean(session) },
    { label: 'Elapsed', value: fmtMins(session?.minutesElapsed), accent: false },
    { label: 'Remaining', value: fmtMins(session?.minutesRemaining), accent: Boolean(session) },
    { label: 'Est end', value: fmtTime(data?.prediction.estimatedEndTime), accent: false },
    { label: 'OT logged', value: session?.overtimeLoggedMinutes ? `${session.overtimeLoggedMinutes}m` : '—', accent: (session?.overtimeLoggedMinutes ?? 0) > 0 },
  ];

  return <div style={{ width: 300, background: '#0e0e0e', border: `1px solid ${color}18`, borderRadius: 10, overflow: 'hidden' }}>
    <div style={{ padding: '10px 14px', background: session ? `${color}0a` : '#0a0a0a', borderBottom: `1px solid ${color}14`, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: session ? color : '#2a2a2a', boxShadow: session ? `0 0 8px ${color}` : 'none', flexShrink: 0 }} />
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.14em', color: session ? color : '#333' }}>
        {session ? `IN SESSION · ${session.room}` : 'STUDIO CONSOLE'}
      </span>
      {session && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#e4e4e7', fontWeight: 600 }}>{session.artistName}</span>}
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
      {metrics.map((metric, index) => <div key={metric.label} style={{ padding: '8px 14px', borderBottom: '1px solid #111', borderRight: index % 2 === 0 ? '1px solid #111' : 'none' }}>
        <div style={{ fontSize: 9, color: '#333', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', marginBottom: 3 }}>{metric.label.toUpperCase()}</div>
        <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: metric.accent ? color : '#888', textTransform: 'capitalize' }}>{metric.value}</div>
      </div>)}
    </div>

    {session && <div style={{ padding: '10px 14px', borderTop: '1px solid #111' }}>
      <div style={{ fontSize: 9, color: '#333', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', marginBottom: 8 }}>PHASE CONTROL</div>
      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
        {PHASES.map(phase => <button key={phase.value} type="button" onClick={() => setPhase(session.id, phase.value)} style={{
          flex: 1, background: session.phase === phase.value ? `${PHASE_COLOR[phase.value]}22` : '#111',
          border: `1px solid ${session.phase === phase.value ? `${PHASE_COLOR[phase.value]}44` : '#1a1a1a'}`,
          borderRadius: 4, color: session.phase === phase.value ? PHASE_COLOR[phase.value] : '#444',
          fontSize: 8, padding: '5px 2px', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em', transition: 'all 0.15s',
        }}>{phase.label}</button>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <button type="button" onClick={() => markActivity(session.id)} style={buttonStyle}>● Mark Activity</button>
        <button type="button" onClick={() => logOvertime(session.id, 30)} style={buttonStyle}>+ 30m Overtime</button>
      </div>
    </div>}

    {error && <div style={{ padding: '8px 14px', borderTop: '1px solid #1a1a1a', fontSize: 10, color: '#D94A4A', fontFamily: "'JetBrains Mono', monospace" }}>⚠ {error}</div>}
  </div>;
}
