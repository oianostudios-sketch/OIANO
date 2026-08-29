import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { fmtTime } from '../lib/fmt';
import OianoBrand from '../components/OianoBrand';
import SessionCompletionModal from '../components/SessionCompletionModal';
import { BookingStatus, STATUS_HEX } from '../lib/bookingStatus';

interface RunsheetBooking {
  id: string;
  starts_at: string;
  ends_at: string;
  call_time: string;
  artist_name: string;
  artist_id: string;
  room: string;
  room_type: string;
  room_id: string | null;
  engineer: string;
  engineer_id: string | null;
  service: string;
  status: string;
  payment_status: string;
  total_usd: number;
  notes: string;
  conflict: boolean;
}

interface RunsheetData {
  date: string;
  studio_name: string;
  generated_at: string;
  revenue: { expected: number; paid: number; outstanding: number };
  bookings: RunsheetBooking[];
}

// ── Room colour palette ────────────────────────────────────────────────────────
const ROOM_PALETTE = [
  '#C9A84C', '#6366f1', '#06b6d4', '#f59e0b',
  '#10b981', '#ec4899', '#8b5cf6', '#f97316',
];
let _roomColorMap: Record<string, string> = {};
function roomColor(roomName: string, allRooms: string[]): string {
  if (!_roomColorMap[roomName]) {
    const idx = allRooms.indexOf(roomName);
    _roomColorMap[roomName] = ROOM_PALETTE[idx % ROOM_PALETTE.length];
  }
  return _roomColorMap[roomName];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function dur(b: RunsheetBooking) {
  const mins = Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function gapMins(a: RunsheetBooking, b: RunsheetBooking) {
  return Math.round((new Date(b.starts_at).getTime() - new Date(a.ends_at).getTime()) / 60_000);
}

function usd(n: number) {
  return n === 0 ? '—' : `$${n.toFixed(2)}`;
}

// Utilisation % for a room over a workday (8am–10pm = 840min)
function utilPct(sessions: RunsheetBooking[]): number {
  const totalMins = sessions.reduce((s, b) => {
    return s + Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000);
  }, 0);
  return Math.min(100, Math.round((totalMins / 840) * 100));
}

const PAY_COLOR: Record<string, string> = {
  PAID:    '#22c55e',
  PARTIAL: '#f59e0b',
  UNPAID:  '#ef4444',
};

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
      background: color + '22', color, border: `1px solid ${color}44`,
      fontFamily: "'JetBrains Mono', monospace",
    }}>{label}</span>
  );
}

const TH_STYLE: React.CSSProperties = {
  fontSize: 9, color: '#888', fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: '0.12em', padding: '8px 10px',
  borderBottom: '2px solid #e5e5e5', textAlign: 'left', whiteSpace: 'nowrap',
};

type ViewMode = 'chrono' | 'byRoom';

export default function RunsheetPage() {
  const [params, setParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<ViewMode>('chrono');
  const [completingBooking, setCompletingBooking] = useState<RunsheetBooking | null>(null);
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'STUDIO_ADMIN';
  const isEngineer = user?.role === 'ENGINEER';

  const today = new Date().toISOString().split('T')[0];
  const date  = params.get('date') ?? today;

  // Engineers use their own endpoint (filtered to their sessions)
  const endpoint = isEngineer
    ? `/engineers/runsheet?date=${date}`
    : `/admin/runsheet?date=${date}`;

  const { data, isLoading, isError } = useQuery<RunsheetData>({
    queryKey: ['runsheet', date, user?.role],
    queryFn: async () => (await api.get(endpoint)).data,
    enabled: isAdmin || isEngineer,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/bookings/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['runsheet', date] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });

  function shift(days: number) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setParams({ date: d.toISOString().split('T')[0] });
  }

  const allRoomNames = useMemo(() => {
    _roomColorMap = {}; // reset per data load
    if (!data) return [];
    return [...new Set(data.bookings.map(b => b.room))].sort();
  }, [data]);

  const byRoom = useMemo(() => {
    if (!data) return {} as Record<string, RunsheetBooking[]>;
    const groups: Record<string, RunsheetBooking[]> = {};
    for (const b of data.bookings) {
      if (!groups[b.room]) groups[b.room] = [];
      groups[b.room].push(b);
    }
    return groups;
  }, [data]);

  const roomNames = Object.keys(byRoom).sort();

  function StatusActions({ b }: { b: RunsheetBooking }) {
    const pending = updateStatus.isPending;
    const btnBase: React.CSSProperties = {
      display: 'inline-block', marginTop: 3, marginRight: 3, fontSize: 9,
      background: 'none', border: '1px solid', borderRadius: 4,
      padding: '2px 6px', cursor: pending ? 'not-allowed' : 'pointer',
      fontFamily: "'JetBrains Mono', monospace", opacity: pending ? 0.5 : 1,
    };

    if (b.status === 'PENDING') return (
      <div style={{ marginTop: 2 }}>
        <button className="no-print" onClick={() => updateStatus.mutate({ id: b.id, status: 'CONFIRMED' })}
          style={{ ...btnBase, color: '#16a34a', borderColor: '#16a34a44' }}>✓ Confirm</button>
      </div>
    );

    if (b.status === 'CONFIRMED') return (
      <div style={{ marginTop: 2 }}>
        <button className="no-print" onClick={() => setCompletingBooking(b)}
          style={{ ...btnBase, color: '#6b7280', borderColor: '#6b728044' }}>✓ Done</button>
        <button className="no-print" onClick={() => updateStatus.mutate({ id: b.id, status: 'NO_SHOW' })}
          style={{ ...btnBase, color: '#ef4444', borderColor: '#ef444444' }}>✗ No-show</button>
      </div>
    );

    return null;
  }

  function BookingRow({ b, prevB }: { b: RunsheetBooking; prevB?: RunsheetBooking }) {
    const gap = prevB ? gapMins(prevB, b) : 0;
    const sameRoom = prevB && prevB.room === b.room;
    const showGap = viewMode === 'byRoom' ? (sameRoom && gap > 5) : gap > 5;
    const rc = roomColor(b.room, allRoomNames);

    return (
      <>
        {showGap && (
          <tr className="no-print">
            <td colSpan={11} style={{
              padding: '3px 10px',
              fontSize: 10, color: gap >= 60 ? '#ef4444' : '#999',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em',
              background: gap >= 60 ? '#ef444406' : 'transparent',
              borderBottom: '1px dashed #e5e5e5',
            }}>
              {gap >= 60 ? `⚠ ${gap}m gap — room idle` : `· ${gap}m gap`}
            </td>
          </tr>
        )}
        <tr style={{
          borderBottom: '1px solid #f0f0f0',
          background: b.conflict ? '#fef2f2' : b.status === 'PENDING' ? '#fffbeb' : 'transparent',
          outline: b.conflict ? '2px solid #ef444433' : 'none',
        }}>
          {/* Call Time */}
          <td style={{ padding: '10px 10px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, whiteSpace: 'nowrap', color: '#aaa' }}>
            <div style={{ color: '#5A9BCB', fontWeight: 600 }}>{fmtTime(b.call_time ?? b.starts_at)}</div>
            <div style={{ fontSize: 9, color: '#bbb', letterSpacing: '0.05em' }}>CALL</div>
          </td>
          {/* Time */}
          <td style={{ padding: '10px 6px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, whiteSpace: 'nowrap' }}>
            <div style={{ fontWeight: 700 }}>{fmtTime(b.starts_at)}</div>
            <div style={{ color: '#aaa', fontSize: 10 }}>–{fmtTime(b.ends_at)}</div>
          </td>
          <td style={{ padding: '10px 8px', fontSize: 11, color: '#aaa', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>{dur(b)}</td>
          <td style={{ padding: '10px 10px', fontWeight: 600, fontSize: 13, color: '#111' }}>
            {b.conflict && <span style={{ color: '#ef4444', marginRight: 4, fontSize: 10 }}>⚠</span>}
            {b.artist_name}
          </td>
          <td style={{ padding: '10px 8px' }}>
            <div style={{ fontSize: 12, color: rc, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: rc, marginRight: 4, verticalAlign: 'middle' }} />
              {b.room}
            </div>
            <div style={{ fontSize: 10, color: '#aaa' }}>{b.room_type.replace(/_/g, ' ')}</div>
          </td>
          <td style={{ padding: '10px 8px', fontSize: 12, color: '#555' }}>{b.engineer}</td>
          <td style={{ padding: '10px 8px', fontSize: 11, color: '#777' }}>{b.service}</td>
          <td style={{ padding: '10px 8px' }}>
            <Pill label={b.status} color={STATUS_HEX[b.status as BookingStatus] ?? '#6b7280'} />
            {isAdmin && <StatusActions b={b} />}
          </td>
          <td style={{ padding: '10px 8px' }}>
            <Pill label={b.payment_status} color={PAY_COLOR[b.payment_status] ?? '#6b7280'} />
          </td>
          <td style={{ padding: '10px 8px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: b.total_usd > 0 ? '#5A9BCB' : '#ccc', whiteSpace: 'nowrap' }}>
            {usd(b.total_usd)}
          </td>
          <td style={{ padding: '10px 10px', fontSize: 11, color: '#888', maxWidth: 140 }}>{b.notes || '—'}</td>
        </tr>
      </>
    );
  }

  const COLS = ['CALL','TIME','DUR','ARTIST','ROOM','ENGINEER','SERVICE','STATUS','PAYMENT','AMOUNT','NOTES'];

  if (!isAdmin && !isEngineer) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontFamily: 'DM Sans, sans-serif' }}>
        Access restricted to studio staff.
      </div>
    );
  }

  return (
    <div className="rs-page">
      {/* ── Screen-only header ── */}
      <div className="rs-screen-header no-print">
        <Link to={isAdmin ? '/admin' : '/dashboard'} className="rs-back">← {isAdmin ? 'Studio Operator' : 'Studio Team'}</Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* View toggle */}
          <div style={{ display: 'flex', background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: 6, overflow: 'hidden' }}>
            {(['chrono', 'byRoom'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setViewMode(m)} style={{
                padding: '5px 14px', fontSize: 10, border: 'none', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em',
                background: viewMode === m ? '#5A9BCB' : 'transparent',
                color: viewMode === m ? '#000' : '#555',
                transition: 'all 0.15s',
              }}>
                {m === 'chrono' ? '◷ TIME' : '▥ ROOM'}
              </button>
            ))}
          </div>

          <div className="rs-nav">
            <button className="rs-nav-btn" onClick={() => shift(-1)}>‹ Prev</button>
            <input type="date" className="rs-date-input" value={date} aria-label="Runsheet date"
              onChange={e => setParams({ date: e.target.value })} />
            <button className="rs-nav-btn" onClick={() => shift(1)}>Next ›</button>
          </div>
        </div>

        {/* Conflict legend */}
        {data && data.bookings.some(b => b.conflict) && (
          <div className="no-print" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 6, padding: '5px 12px', fontSize: 11, color: '#dc2626',
          }}>
            ⚠ {data.bookings.filter(b => b.conflict).length} scheduling conflict{data.bookings.filter(b => b.conflict).length > 1 ? 's' : ''} detected
          </div>
        )}

        <button className="rs-print-btn" onClick={() => window.print()}>Print / PDF</button>
      </div>

      {/* ── Printable sheet ── */}
      <div className="rs-sheet">
        {/* Header */}
        <div className="rs-header">
          <div>
            <div className="rs-studio-name">DREAMZ MUSIC LAB</div>
            <div className="rs-sheet-title">DAILY RUNSHEET{isEngineer ? ' — STUDIO TEAM VIEW' : ''}</div>
          </div>
          <div className="rs-header-right" style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, color: '#111' }}>
              {new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              })}
            </div>
            {data && (
              <div style={{ fontSize: 10, color: '#aaa', marginTop: 2, fontFamily: 'monospace' }}>
                Generated {new Date(data.generated_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        </div>

        <div className="rs-divider" />

        {/* Revenue summary — admin only */}
        {data && isAdmin && (
          <div style={{ display: 'flex', border: '1px solid #e5e5e5', borderRadius: 6, overflow: 'hidden', marginBottom: 20 }}>
            {[
              { label: 'SESSIONS',    value: String(data.bookings.length),     hi: false },
              { label: 'EXPECTED',    value: usd(data.revenue.expected),        hi: false },
              { label: 'PAID',        value: usd(data.revenue.paid),            hi: false, green: true },
              { label: 'OUTSTANDING', value: usd(data.revenue.outstanding),     hi: data.revenue.outstanding > 0, red: true },
            ].map((item, i) => (
              <div key={item.label} style={{
                flex: 1, padding: '10px 16px',
                borderRight: i < 3 ? '1px solid #e5e5e5' : 'none',
                background: '#fafafa',
              }}>
                <div style={{ fontSize: 9, color: '#bbb', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 3 }}>{item.label}</div>
                <div style={{
                  fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                  color: item.red && data.revenue.outstanding > 0 ? '#dc2626' : item.green ? '#16a34a' : '#111',
                }}>{item.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Engineer summary */}
        {data && isEngineer && (
          <div style={{ display: 'flex', border: '1px solid #e5e5e5', borderRadius: 6, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ flex: 1, padding: '10px 16px', borderRight: '1px solid #e5e5e5', background: '#fafafa' }}>
              <div style={{ fontSize: 9, color: '#bbb', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 3 }}>SESSIONS TODAY</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: '#111' }}>{data.bookings.length}</div>
            </div>
            <div style={{ flex: 1, padding: '10px 16px', borderRight: '1px solid #e5e5e5', background: '#fafafa' }}>
              <div style={{ fontSize: 9, color: '#bbb', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 3 }}>FIRST CALL</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: '#5A9BCB' }}>
                {data.bookings.length > 0 ? fmtTime(data.bookings[0].call_time ?? data.bookings[0].starts_at) : '—'}
              </div>
            </div>
            <div style={{ flex: 1, padding: '10px 16px', background: '#fafafa' }}>
              <div style={{ fontSize: 9, color: '#bbb', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 3 }}>WRAP</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: '#111' }}>
                {data.bookings.length > 0 ? fmtTime(data.bookings[data.bookings.length - 1].ends_at) : '—'}
              </div>
            </div>
          </div>
        )}

        {/* States */}
        {isLoading && <div className="rs-empty">Loading…</div>}
        {isError   && <div className="rs-empty rs-error">Failed to load runsheet.</div>}
        {data && data.bookings.length === 0 && <div className="rs-empty">No sessions scheduled.</div>}

        {/* ── Chrono view ── */}
        {data && data.bookings.length > 0 && viewMode === 'chrono' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                {COLS.map(c => <th key={c} style={TH_STYLE}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.bookings.map((b, i) => (
                <BookingRow key={b.id} b={b} prevB={i > 0 ? data.bookings[i - 1] : undefined} />
              ))}
            </tbody>
          </table>
        )}

        {/* ── Room view ── */}
        {data && data.bookings.length > 0 && viewMode === 'byRoom' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {roomNames.map(room => {
              const sessions = byRoom[room];
              const roomTotal = sessions.reduce((s, b) => s + b.total_usd, 0);
              const rc = roomColor(room, allRoomNames);
              const pct = utilPct(sessions);
              const hasConflict = sessions.some(b => b.conflict);
              return (
                <div key={room}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2px solid ${rc}44`, paddingBottom: 8, marginBottom: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: rc }} />
                        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700, color: '#111' }}>{room}</span>
                        {hasConflict && (
                          <span style={{ fontSize: 9, color: '#dc2626', fontFamily: 'monospace', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '1px 5px' }}>CONFLICT</span>
                        )}
                      </div>
                      {/* Utilisation bar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                        <div style={{ width: 100, height: 3, background: '#e5e5e5', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: rc, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 9, color: '#aaa', fontFamily: 'monospace' }}>{pct}% utilised</span>
                      </div>
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#888' }}>
                      {sessions.length} session{sessions.length !== 1 ? 's' : ''} · {usd(roomTotal)}
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#fafafa' }}>
                        {COLS.map(c => <th key={c} style={TH_STYLE}>{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((b, i) => (
                        <BookingRow key={b.id} b={b} prevB={i > 0 ? sessions[i - 1] : undefined} />
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="rs-footer" style={{ marginTop: 32 }}>
          <OianoBrand variant="mono" size={11} subtitle="StudioOS" />
          <span className="rs-footer-sep">·</span>
          <span>{data?.studio_name ?? 'OIANO Studio Network'}</span>
          <span className="rs-footer-sep">·</span>
          <span>Confidential</span>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .rs-page { padding: 0; background: #fff; }
          .rs-sheet { box-shadow: none; border-radius: 0; }
        }
      `}</style>

      {completingBooking && (
        <SessionCompletionModal
          booking={{
            id: completingBooking.id,
            status: completingBooking.status,
            starts_at: completingBooking.starts_at,
            ends_at: completingBooking.ends_at,
            project_id: null,
            artist: { name: completingBooking.artist_name },
            room: { name: completingBooking.room },
            engineer: { name: completingBooking.engineer },
            service: { name: completingBooking.service },
          }}
          onClose={() => {
            setCompletingBooking(null);
            qc.invalidateQueries({ queryKey: ['runsheet', date] });
            qc.invalidateQueries({ queryKey: ['bookings'] });
          }}
        />
      )}
    </div>
  );
}
