// apps/web/src/pages/ProjectDetailPage.tsx
// Single-project view — the missing half of the production board. The board
// (ProducerDashboardPage) already lists every project; clicking one used to
// do nothing. This is where "Booking -> Project -> Producer" becomes visible
// from the Project side: every session booked against this project, in one
// place, each linking back to its own BookingDetailPage (which now links
// back here too — see the project chip added there).
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ProducerNav } from '../components/ProducerNav';
import { useToast } from '../components/Toast';
import { fmtDate, fmtDuration, fmtCurrency } from '../lib/fmt';

type Phase = 'PRE_PRODUCTION' | 'TRACKING' | 'EDITING' | 'MIXING' | 'MASTERING' | 'DELIVERED';

interface Booking {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  total_usd: number | string;
  room: { name: string } | null;
  service: { name: string } | null;
}

interface Project {
  id: string;
  title: string;
  phase: Phase;
  notes: string | null;
  is_active: boolean;
  last_session_at: string | null;
  updated_at: string;
  created_at: string;
  artist: { id: string; name: string; alias: string | null; avatar_url: string | null } | null;
  bookings: Booking[];
}

const PHASES: { key: Phase; label: string; color: string }[] = [
  { key: 'PRE_PRODUCTION', label: 'Pre-Production', color: '#3B8BFF' },
  { key: 'TRACKING',       label: 'Tracking',       color: '#1D9E75' },
  { key: 'EDITING',        label: 'Editing',        color: '#8B5CF6' },
  { key: 'MIXING',         label: 'Mixing',         color: '#E8823A' },
  { key: 'MASTERING',      label: 'Mastering',      color: '#C9A84C' },
  { key: 'DELIVERED',      label: 'Delivered',      color: '#666' },
];

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#C9A84C', CONFIRMED: '#1D9E75', IN_PROGRESS: '#3B8BFF',
  COMPLETED: '#666', CANCELLED: '#D94A4A', NO_SHOW: '#D94A4A',
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ['producer-projects'],
    queryFn: async () => (await api.get('/producer/projects')).data,
  });
  const { data: producerMe } = useQuery({
    queryKey: ['producer', 'me'],
    queryFn: async () => (await api.get('/producer/me')).data,
  });

  const project = projects?.find(p => p.id === id) ?? null;

  const advance = useMutation({
    mutationFn: (phase: Phase) => api.patch(`/producer/projects/${id}`, { phase }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['producer-projects'] });
      qc.invalidateQueries({ queryKey: ['producer', 'me'] });
      toast.success('Phase updated');
    },
    onError: () => toast.error('Failed to update phase'),
  });

  // Link an existing session to this project — booking creation has no
  // project picker yet, so this is currently the only way a booking gets
  // attached to a project after the fact.
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: availableSessions } = useQuery<Booking[]>({
    queryKey: ['project-available-sessions', id],
    queryFn: async () => (await api.get(`/producer/projects/${id}/available-sessions`)).data,
    enabled: !!id && !!project?.artist_id && pickerOpen,
  });
  const linkSession = useMutation({
    mutationFn: (bookingId: string) => api.post(`/producer/projects/${id}/link-booking`, { booking_id: bookingId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['producer-projects'] });
      qc.invalidateQueries({ queryKey: ['project-available-sessions', id] });
      toast.success('Session linked to project');
      setPickerOpen(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Failed to link session'),
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#555', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>Loading project…</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0a)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: '#666', fontSize: '0.9rem' }}>Project not found.</p>
        <button onClick={() => navigate('/producer')} style={{ color: '#3B8BFF', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>← Back to board</button>
      </div>
    );
  }

  const phaseConf = PHASES.find(p => p.key === project.phase) ?? PHASES[0];
  const totalRevenue = project.bookings.reduce((sum, b) => sum + Number(b.total_usd ?? 0), 0);
  const sortedBookings = [...project.bookings].sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0a)', fontFamily: 'var(--font-body, DM Sans), sans-serif' }}>
      <ProducerNav passportCode={producerMe?.passport?.passport_code} />
      <div style={{ padding: '2rem', maxWidth: 860, margin: '0 auto' }}>

        <button onClick={() => navigate('/producer')} style={{ color: '#666', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', marginBottom: '1.5rem', padding: 0 }}>
          ← Back to board
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: phaseConf.color, flexShrink: 0 }} />
              <span style={{ fontSize: '0.72rem', color: phaseConf.color, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
                {phaseConf.label}
              </span>
              {!project.is_active && (
                <span style={{ fontSize: '0.68rem', color: '#555', border: '1px solid #2a2a2a', borderRadius: 99, padding: '1px 8px' }}>Archived</span>
              )}
            </div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontFamily: 'var(--font-display, Playfair Display)', color: '#fff', fontWeight: 700 }}>
              {project.title}
            </h1>
          </div>

          {/* Phase selector */}
          <select
            value={project.phase}
            onChange={e => advance.mutate(e.target.value as Phase)}
            disabled={advance.isPending}
            style={{
              padding: '0.6rem 1rem', background: 'var(--surface, #141414)', border: '1px solid var(--border, #1e1e1e)',
              borderRadius: 8, color: '#fff', fontSize: '0.85rem', cursor: 'pointer',
            }}
          >
            {PHASES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>

        {/* Artist */}
        {project.artist && (
          <Link
            to={`/artists/${project.artist.id}`}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem',
              padding: '0.75rem 1rem', background: 'var(--surface, #141414)', border: '1px solid var(--border, #1e1e1e)',
              borderRadius: 10, width: 'fit-content', textDecoration: 'none',
            }}
          >
            {project.artist.avatar_url ? (
              <img src={project.artist.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(201,168,76,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#C9A84C', fontWeight: 700 }}>
                {project.artist.name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('')}
              </div>
            )}
            <div>
              <div style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 600 }}>{project.artist.alias ?? project.artist.name}</div>
              <div style={{ fontSize: '0.7rem', color: '#555' }}>View artist profile →</div>
            </div>
          </Link>
        )}

        {/* Notes */}
        {project.notes && (
          <div style={{ background: 'var(--surface, #141414)', border: '1px solid var(--border, #1e1e1e)', borderRadius: 10, padding: '1rem 1.2rem', marginBottom: '1.5rem' }}>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notes</p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#ccc', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{project.notes}</p>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '2rem' }}>
          {[
            { label: 'Sessions', value: String(project.bookings.length) },
            { label: 'Revenue',  value: fmtCurrency(totalRevenue) },
            { label: 'Last session', value: project.last_session_at ? fmtDate(project.last_session_at) : '—' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface, #141414)', border: '1px solid var(--border, #1e1e1e)', borderRadius: 10, padding: '0.9rem 1rem' }}>
              <div style={{ fontSize: '1.1rem', color: '#fff', fontWeight: 700, fontFamily: 'var(--font-mono, JetBrains Mono)' }}>{s.value}</div>
              <div style={{ fontSize: '0.7rem', color: '#555', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Linked sessions — the whole point: this project's booking history in one place */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Sessions ({project.bookings.length})
          </p>
          {project.artist_id && (
            <button
              onClick={() => setPickerOpen(o => !o)}
              style={{ fontSize: '0.75rem', color: '#3B8BFF', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {pickerOpen ? 'Cancel' : '+ Link a session'}
            </button>
          )}
        </div>

        {/* Picker — this project's artist's bookings that aren't attached to
            any project yet. Booking creation has no project field, so this
            is the only way that link gets made after the fact. */}
        {pickerOpen && (
          <div style={{ border: '1px solid var(--border, #1e1e1e)', borderRadius: 10, padding: '0.75rem', marginBottom: '0.75rem', background: 'rgba(59,139,255,0.03)' }}>
            {availableSessions === undefined ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#555' }}>Loading sessions…</p>
            ) : availableSessions.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#555' }}>
                No unlinked sessions found for {project.artist?.alias ?? project.artist?.name ?? 'this artist'}.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {availableSessions.map(b => (
                  <div key={b.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
                    padding: '0.6rem 0.75rem', background: 'var(--surface, #141414)', borderRadius: 8,
                  }}>
                    <div style={{ fontSize: '0.8rem', color: '#ccc' }}>
                      {fmtDate(b.starts_at)} · {b.service?.name ?? 'Session'} · {b.room?.name ?? 'Room TBA'}
                    </div>
                    <button
                      onClick={() => linkSession.mutate(b.id)}
                      disabled={linkSession.isPending}
                      style={{
                        fontSize: '0.72rem', color: '#3B8BFF', background: 'rgba(59,139,255,0.1)',
                        border: '1px solid rgba(59,139,255,0.25)', borderRadius: 6, padding: '0.3rem 0.7rem',
                        cursor: linkSession.isPending ? 'wait' : 'pointer', flexShrink: 0,
                      }}
                    >
                      Link
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {sortedBookings.length === 0 ? (
          <div style={{ border: '1px dashed var(--border, #1e1e1e)', borderRadius: 10, padding: '2rem 1rem', textAlign: 'center', color: '#444', fontSize: '0.85rem' }}>
            No sessions booked against this project yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {sortedBookings.map(b => (
              <Link
                key={b.id}
                to={`/bookings/${b.id}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                  background: 'var(--surface, #141414)', border: '1px solid var(--border, #1e1e1e)',
                  borderRadius: 10, padding: '0.85rem 1.1rem', textDecoration: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[b.status] ?? '#555', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', color: '#eee', fontWeight: 500 }}>{fmtDate(b.starts_at)}</div>
                    <div style={{ fontSize: '0.72rem', color: '#666' }}>
                      {b.service?.name ?? 'Session'} · {b.room?.name ?? 'Room TBA'} · {fmtDuration(b.starts_at, b.ends_at)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.72rem', color: STATUS_COLOR[b.status] ?? '#555', fontFamily: 'var(--font-mono)' }}>{b.status}</span>
                  <span style={{ fontSize: '0.85rem', color: '#888', fontFamily: 'var(--font-mono)' }}>{fmtCurrency(b.total_usd)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
