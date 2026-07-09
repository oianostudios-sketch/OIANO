import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PulseData {
  utilization: {
    today_pct: number;
    today_booked_hours: number;
    today_available_hours: number;
    week_sessions: number;
  };
  trending_genre: {
    genre: string;
    count: number;
    pct: number;
    runner_up: { genre: string; pct: number } | null;
  } | null;
  wins: Array<{ type: string; message: string; artist_name: string; icon: string }>;
  next_moves: Array<{ type: string; message: string; count: number; severity: string }>;
}

// ── Studio mantras — seeded by day of year so they rotate daily ───────────────

const MANTRAS = [
  { text: "The booth is the most honest room in the building.", author: "OIANO" },
  { text: "Every rough cut is next year's classic.", author: "Dreamz ML" },
  { text: "Frequency doesn't lie. Neither does the work.", author: "OIANO" },
  { text: "Great sessions aren't booked — they're built.", author: "Studio law" },
  { text: "The room is ready. Are you?", author: "OIANO" },
  { text: "Your sound is your signature. Protect it.", author: "Dreamz ML" },
  { text: "Today's session could be the one that changes everything.", author: "Studio law" },
  { text: "Studio time is sacred. Use it well.", author: "OIANO" },
  { text: "Behind every great record is a team in a great room.", author: "Dreamz ML" },
  { text: "The best take is the next one.", author: "Studio law" },
  { text: "Dreamz Music Lab — where sound becomes legacy.", author: "OIANO" },
  { text: "The mic doesn't know who you used to be. Only who you are now.", author: "Studio law" },
  { text: "Every great artist was once in this room, figuring it out.", author: "OIANO" },
  { text: "Consistency builds catalogs. Catalogs build careers.", author: "Dreamz ML" },
  { text: "Today's discipline is tomorrow's masterpiece.", author: "Studio law" },
  { text: "When the red light comes on, the world waits.", author: "OIANO" },
  { text: "Greatness is built one session at a time.", author: "Dreamz ML" },
  { text: "The studio doesn't lie. It only amplifies what you bring.", author: "Studio law" },
  { text: "Every session is a new chapter. Write it well.", author: "OIANO" },
  { text: "The booth is where excuses end and music begins.", author: "Dreamz ML" },
];

function getDayMantra() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const diff  = Date.now() - start.getTime();
  const dayOfYear = Math.floor(diff / 86_400_000);
  return MANTRAS[dayOfYear % MANTRAS.length];
}

// ── Utilization arc gauge ─────────────────────────────────────────────────────

function UtilArc({ pct }: { pct: number }) {
  const size = 72;
  const cx = size / 2;
  const cy = size / 2;
  const r  = 28;
  const angle = Math.min(359.99, (pct / 100) * 360);
  const rad   = (angle - 90) * (Math.PI / 180);
  const startRad = -Math.PI / 2;
  const sx = cx + r * Math.cos(startRad);
  const sy = cy + r * Math.sin(startRad);
  const ex = cx + r * Math.cos(rad);
  const ey = cy + r * Math.sin(rad);
  const large = angle > 180 ? 1 : 0;
  const color = pct >= 70 ? '#1D9E75' : pct >= 40 ? '#C9A84C' : '#3B8BFF';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e1e1e" strokeWidth={6} />
      {pct > 0 && (
        <path
          d={`M${sx.toFixed(2)},${sy.toFixed(2)} A${r},${r},0,${large},1,${ex.toFixed(2)},${ey.toFixed(2)}`}
          fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
        />
      )}
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fontFamily="'JetBrains Mono', monospace" fontSize={11} fill={color} fontWeight={700}>
        {pct}%
      </text>
    </svg>
  );
}

// ── Severity styles ───────────────────────────────────────────────────────────

const SEVERITY: Record<string, { dot: string; label: string; bg: string }> = {
  action:  { dot: '#C9A84C', label: '#C9A84C', bg: '#C9A84C0d' },
  warning: { dot: '#D94A4A', label: '#D94A4A', bg: '#D94A4A0d' },
  info:    { dot: '#3B8BFF', label: '#888',    bg: '#3B8BFF08' },
  good:    { dot: '#1D9E75', label: '#1D9E75', bg: '#1D9E7508' },
};

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  pulseData: PulseData | null;
  loading: boolean;
}

export default function StudioIntelligencePanel({ pulseData, loading }: Props) {
  const navigate = useNavigate();
  const mantra = useMemo(() => getDayMantra(), []);
  const [blessingVisible, setBlessingVisible] = useState(true);

  // Subtle breathing animation for mantra
  useEffect(() => {
    const id = setInterval(() => setBlessingVisible(v => !v), 8000);
    return () => clearInterval(id);
  }, []);

  const util   = pulseData?.utilization;
  const genre  = pulseData?.trending_genre;
  const wins   = pulseData?.wins ?? [];
  const moves  = pulseData?.next_moves ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>

      {/* ── Daily Signal / Mantra ── */}
      <div style={{
        background: '#0c0a06',
        border: '1px solid #5A9BCB22',
        borderRadius: 8,
        padding: '14px 16px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Ambient glow */}
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: 120, height: 120, borderRadius: '50%',
          background: 'radial-gradient(circle, #5A9BCB18 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ margin: '0 0 8px', fontSize: 9, color: '#5A9BCB88', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'monospace' }}>
            ✦ Today's signal
          </p>
          <p style={{
            margin: '0 0 6px',
            fontSize: 13,
            color: '#e4e4e7',
            fontFamily: "'Playfair Display', serif",
            fontStyle: 'italic',
            lineHeight: 1.5,
            opacity: blessingVisible ? 1 : 0.7,
            transition: 'opacity 2s ease',
          }}>
            "{mantra.text}"
          </p>
          <p style={{ margin: 0, fontSize: 10, color: '#5A9BCB', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
            — {mantra.author}
          </p>
        </div>
      </div>

      {/* ── Studio Productivity ── */}
      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 8, padding: '12px 14px' }}>
        <p style={{ margin: '0 0 10px', fontSize: 10, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Studio productivity
        </p>
        {loading || !util ? (
          <div style={{ height: 36, background: '#1a1a1a', borderRadius: 4, opacity: 0.5 }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <UtilArc pct={util.today_pct} />
            <div>
              <p style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>
                {util.today_booked_hours}h
              </p>
              <p style={{ margin: '0 0 2px', fontSize: 11, color: '#555' }}>
                of {util.today_available_hours}h available · today
              </p>
              <p style={{ margin: 0, fontSize: 11, color: '#5A9BCB88' }}>
                {util.week_sessions} sessions this week
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── What's Moving ── */}
      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 8, padding: '12px 14px' }}>
        <p style={{ margin: '0 0 10px', fontSize: 10, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          What's moving · 30 days
        </p>
        {loading || !genre ? (
          <p style={{ margin: 0, fontSize: 12, color: '#2a2a2a' }}>
            {loading ? 'Loading…' : 'Not enough data yet'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Top genre bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#e4e4e7', fontWeight: 600 }}>{genre.genre}</span>
                <span style={{ fontSize: 11, color: '#5A9BCB', fontFamily: 'monospace' }}>{genre.pct}%</span>
              </div>
              <div style={{ height: 4, background: '#1e1e1e', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${genre.pct}%`,
                  background: 'linear-gradient(90deg, #5A9BCB, #8BBEDD)',
                  borderRadius: 2, transition: 'width 1s ease',
                }} />
              </div>
            </div>
            {/* Runner-up */}
            {genre.runner_up && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#71717a' }}>{genre.runner_up.genre}</span>
                  <span style={{ fontSize: 11, color: '#444', fontFamily: 'monospace' }}>{genre.runner_up.pct}%</span>
                </div>
                <div style={{ height: 3, background: '#1e1e1e', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${genre.runner_up.pct}%`,
                    background: '#3B8BFF', borderRadius: 2, opacity: 0.6,
                    transition: 'width 1s ease',
                  }} />
                </div>
              </div>
            )}
            <p style={{ margin: '4px 0 0', fontSize: 10, color: '#333' }}>
              Based on {genre.count} booking{genre.count !== 1 ? 's' : ''} with genre data
            </p>
          </div>
        )}
      </div>

      {/* ── Wins Board ── */}
      {wins.length > 0 && (
        <div style={{ background: '#0b120e', border: '1px solid #1D9E7522', borderRadius: 8, padding: '12px 14px' }}>
          <p style={{ margin: '0 0 10px', fontSize: 10, color: '#1D9E7588', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Wins
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {wins.map((win, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#1D9E75', flexShrink: 0, marginTop: 1 }}>{win.icon}</span>
                <span style={{ fontSize: 12, color: '#a1a1aa', lineHeight: 1.4 }}>{win.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Next Moves ── */}
      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 8, padding: '12px 14px', flex: 1 }}>
        <p style={{ margin: '0 0 10px', fontSize: 10, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Next moves
        </p>
        {loading ? (
          <div style={{ height: 24, background: '#1a1a1a', borderRadius: 4, opacity: 0.5 }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {moves.map((move, i) => {
              const sev = SEVERITY[move.severity] ?? SEVERITY.info;
              const dest =
                move.type === 'unconfirmed' ? '/admin' :
                move.type === 'overdue'     ? '/admin' :
                move.type === 'inactive'    ? '/admin' : null;
              return (
                <button
                  key={i}
                  onClick={() => dest && navigate(dest)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    background: sev.bg, border: '1px solid transparent',
                    borderRadius: 6, padding: '8px 10px', cursor: dest ? 'pointer' : 'default',
                    textAlign: 'left', width: '100%', fontFamily: 'inherit',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => { if (dest) (e.currentTarget as HTMLElement).style.borderColor = sev.dot + '44'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: sev.dot, flexShrink: 0,
                    boxShadow: move.severity !== 'good' ? `0 0 5px ${sev.dot}` : 'none',
                  }} />
                  <span style={{ fontSize: 12, color: sev.label, flex: 1, lineHeight: 1.3 }}>{move.message}</span>
                  {dest && <span style={{ fontSize: 11, color: '#2a2a2a' }}>→</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
