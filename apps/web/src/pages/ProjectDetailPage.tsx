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
import MessageThread from '../components/MessageThread';
import ProjectActionPanel from '../components/ProjectActionPanel';
import { fmtDate, fmtDuration, fmtCurrency } from '../lib/fmt';
import { BookingStatus, STATUS_HEX } from '../lib/bookingStatus';

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
  artist_id: string | null;
  title: string;
  phase: Phase;
  notes: string | null;
  is_active: boolean;
  last_session_at: string | null;
  updated_at: string;
  created_at: string;
  artist: { id: string; name: string; alias: string | null; avatar_url: string | null } | null;
  bookings: Booking[];
  participants: Array<{ id: string; display_name: string; email: string | null; role: string; status: string }>;
  credits: Array<{ id: string; credited_name: string; role: string; scope: string | null; status: string }>;
  promotional_consents: Array<{ id: string; subject: string; purpose: string; channels: string[]; assets: string[]; status: string; expires_at: string | null }>;
  rights_agreements: Array<{ id: string; agreement_type: string; title: string; status: string; response_note: string | null; shares: Array<{ id: string; holder_name: string; percentage: number | string }> }>;
}

const PARTICIPANT_ROLES = [
  'FEATURED_ARTIST', 'PRODUCER', 'ENGINEER', 'SONGWRITER', 'COMPOSER',
  'MIX_ENGINEER', 'MASTERING_ENGINEER', 'MANAGER', 'OTHER',
] as const;
const roleLabel = (role: string) => role.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
const CREDIT_ROLES = ['PRIMARY_ARTIST','FEATURED_ARTIST','PRODUCER','CO_PRODUCER','SONGWRITER','COMPOSER','ENGINEER','RECORDING_ENGINEER','MIX_ENGINEER','MASTERING_ENGINEER','MUSICIAN','VOCALS','OTHER'] as const;

const PHASES: { key: Phase; label: string; color: string }[] = [
  { key: 'PRE_PRODUCTION', label: 'Pre-Production', color: '#3B8BFF' },
  { key: 'TRACKING',       label: 'Tracking',       color: '#1D9E75' },
  { key: 'EDITING',        label: 'Editing',        color: '#8B5CF6' },
  { key: 'MIXING',         label: 'Mixing',         color: '#E8823A' },
  { key: 'MASTERING',      label: 'Mastering',      color: '#C9A84C' },
  { key: 'DELIVERED',      label: 'Delivered',      color: '#666' },
];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [teamOpen, setTeamOpen] = useState(false);
  const [participantName, setParticipantName] = useState('');
  const [participantEmail, setParticipantEmail] = useState('');
  const [participantRole, setParticipantRole] = useState<(typeof PARTICIPANT_ROLES)[number]>('FEATURED_ARTIST');
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [creditName, setCreditName] = useState('');
  const [creditRole, setCreditRole] = useState<(typeof CREDIT_ROLES)[number]>('PRODUCER');
  const [creditScope, setCreditScope] = useState('');
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoPurpose, setPromoPurpose] = useState('');
  const [promoChannel, setPromoChannel] = useState('INSTAGRAM');
  const [rightsOpen, setRightsOpen] = useState(false);
  const [rightsType, setRightsType] = useState<'MASTER' | 'PUBLISHING'>('MASTER');
  const [artistShare, setArtistShare] = useState(50);

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

  const addParticipant = useMutation({
    mutationFn: () => api.post(`/producer/projects/${id}/participants`, {
      display_name: participantName,
      email: participantEmail,
      role: participantRole,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['producer-projects'] });
      setParticipantName('');
      setParticipantEmail('');
      setTeamOpen(false);
      toast.success(participantEmail ? 'Contribution invitation sent' : 'External participant recorded');
    },
    onError: (error: any) => toast.error(error?.response?.data?.error ?? 'Failed to add participant'),
  });
  const removeParticipant = useMutation({
    mutationFn: (participantId: string) => api.delete(`/producer/projects/${id}/participants/${participantId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['producer-projects'] });
      toast.success('Participant removed');
    },
    onError: () => toast.error('Failed to remove participant'),
  });
  const addCredit = useMutation({
    mutationFn: () => api.post(`/producer/projects/${id}/credits`, { credited_name: creditName, role: creditRole, scope: creditScope || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['producer-projects'] }); setCreditName(''); setCreditScope(''); setCreditsOpen(false); toast.success('Credit added'); },
    onError: (error: any) => toast.error(error?.response?.data?.error ?? 'Failed to add credit'),
  });
  const removeCredit = useMutation({
    mutationFn: (creditId: string) => api.delete(`/producer/projects/${id}/credits/${creditId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['producer-projects'] }); toast.success('Credit removed'); },
  });
  const requestPromotion = useMutation({
    mutationFn: () => api.post(`/producer/projects/${id}/promotional-consents`, { subject: project?.title ?? 'Project promotion', purpose: promoPurpose, channels: [promoChannel], assets: ['NAME', 'IMAGE', 'PROJECT_TITLE'] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['producer-projects'] }); setPromoPurpose(''); setPromoOpen(false); toast.success('Permission request sent to artist'); },
    onError: (error: any) => toast.error(error?.response?.data?.error ?? 'Permission request failed'),
  });
  const proposeRights = useMutation({
    mutationFn: () => api.post(`/producer/projects/${id}/rights-agreements`, { agreement_type: rightsType, title: `${project?.title ?? 'Project'} ${rightsType === 'MASTER' ? 'master ownership' : 'publishing split'}`, terms_note: 'Recorded through OIANO; independent legal advice may still be appropriate.', shares: [{ holder_name: project?.artist?.alias ?? project?.artist?.name ?? 'Primary Artist', holder_type: 'ARTIST', holder_ref_id: project?.artist?.id, role: rightsType === 'MASTER' ? 'Master owner' : 'Writer / publisher', percentage: artistShare }, { holder_name: producerMe?.alias ?? producerMe?.name ?? 'Producer', holder_type: 'PRODUCER', holder_ref_id: producerMe?.id, role: rightsType === 'MASTER' ? 'Producer master share' : 'Composer / publisher', percentage: 100 - artistShare }] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['producer-projects'] }); setRightsOpen(false); toast.success('Rights proposal sent to artist'); },
    onError: (error: any) => toast.error(error?.response?.data?.error ?? 'Rights proposal failed'),
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

        {/* Project team: core artist/producer roles plus explicit collaborators. */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Project team ({(project.participants?.length ?? 0) + (project.artist ? 1 : 0) + 1})
            </p>
            <button onClick={() => setTeamOpen(open => !open)} style={{ fontSize: '0.75rem', color: '#C9A84C', background: 'none', border: 'none', cursor: 'pointer' }}>
              {teamOpen ? 'Cancel' : '+ Invite contributor'}
            </button>
          </div>

          {teamOpen && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 1fr auto', gap: 8, padding: 12, marginBottom: 10, border: '1px solid rgba(201,168,76,.2)', borderRadius: 10, background: 'rgba(201,168,76,.035)' }}>
              <input value={participantName} onChange={event => setParticipantName(event.target.value)} placeholder="Name" maxLength={120} style={{ background: '#101010', border: '1px solid #242424', borderRadius: 7, padding: '9px 10px', color: '#eee', fontSize: 12 }} />
              <input value={participantEmail} onChange={event => setParticipantEmail(event.target.value)} placeholder="OIANO account email" type="email" required style={{ background: '#101010', border: '1px solid #242424', borderRadius: 7, padding: '9px 10px', color: '#eee', fontSize: 12 }} />
              <select value={participantRole} onChange={event => setParticipantRole(event.target.value as any)} style={{ background: '#101010', border: '1px solid #242424', borderRadius: 7, padding: '9px 10px', color: '#eee', fontSize: 12 }}>
                {PARTICIPANT_ROLES.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
              </select>
              <button onClick={() => addParticipant.mutate()} disabled={!participantName.trim() || !participantEmail.trim() || addParticipant.isPending} style={{ border: 0, borderRadius: 7, padding: '0 14px', background: '#C9A84C', color: '#090909', fontWeight: 700, cursor: 'pointer', opacity: participantName.trim() && participantEmail.trim() ? 1 : .45 }}>Invite</button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 9, border: '1px solid #1e1e1e', background: '#121212' }}>
              <span style={{ color: '#ddd', fontSize: 13 }}>{producerMe?.alias ?? producerMe?.name ?? 'Producer'}</span><span style={{ color: '#777', fontSize: 11 }}>Project Producer · Owner</span>
            </div>
            {project.artist && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 9, border: '1px solid #1e1e1e', background: '#121212' }}><span style={{ color: '#ddd', fontSize: 13 }}>{project.artist.alias ?? project.artist.name}</span><span style={{ color: '#777', fontSize: 11 }}>Primary Artist</span></div>}
            {(project.participants ?? []).map(participant => (
              <div key={participant.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 9, border: '1px solid #1e1e1e', background: '#121212' }}>
                <div><span style={{ color: '#ddd', fontSize: 13 }}>{participant.display_name}</span>{participant.email && <span style={{ color: '#555', fontSize: 10, marginLeft: 8 }}>{participant.email}</span>}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ color: participant.status === 'ACTIVE' ? '#72B794' : participant.status === 'DECLINED' ? '#D94A4A' : '#C9A84C', fontSize: 9, textTransform: 'uppercase' }}>{participant.status.replaceAll('_',' ')}</span><span style={{ color: '#C9A84C', fontSize: 11 }}>{roleLabel(participant.role)}</span><button onClick={() => removeParticipant.mutate(participant.id)} aria-label={`Remove ${participant.display_name}`} style={{ color: '#666', background: 'none', border: 0, cursor: 'pointer', fontSize: 16 }}>×</button></div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}><div><p style={{ margin: 0, fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '.08em' }}>Credit sheet ({project.credits?.length ?? 0})</p><p style={{ margin: '4px 0 0', fontSize: 10, color: '#444' }}>Contribution records only · ownership is handled separately</p></div><button onClick={() => setCreditsOpen(open => !open)} style={{ fontSize: 12, color: '#C9A84C', background: 'none', border: 0, cursor: 'pointer' }}>{creditsOpen ? 'Cancel' : '+ Add credit'}</button></div>
          {creditsOpen && <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.5fr auto', gap: 8, marginBottom: 10, padding: 12, border: '1px solid rgba(201,168,76,.2)', borderRadius: 10 }}><input value={creditName} onChange={event => setCreditName(event.target.value)} placeholder="Credited name" style={{ background: '#101010', border: '1px solid #242424', borderRadius: 7, padding: 9, color: '#eee', fontSize: 12 }}/><select value={creditRole} onChange={event => setCreditRole(event.target.value as any)} style={{ background: '#101010', border: '1px solid #242424', borderRadius: 7, padding: 9, color: '#eee', fontSize: 12 }}>{CREDIT_ROLES.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}</select><input value={creditScope} onChange={event => setCreditScope(event.target.value)} placeholder="Scope, track or contribution" style={{ background: '#101010', border: '1px solid #242424', borderRadius: 7, padding: 9, color: '#eee', fontSize: 12 }}/><button onClick={() => addCredit.mutate()} disabled={!creditName.trim() || addCredit.isPending} style={{ border: 0, borderRadius: 7, background: '#C9A84C', color: '#090909', padding: '0 14px', fontWeight: 700, opacity: creditName.trim() ? 1 : .4 }}>Add</button></div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{(project.credits ?? []).map(credit => <div key={credit.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr auto auto', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid #1e1e1e', borderRadius: 9, background: '#121212' }}><strong style={{ fontSize: 12, color: '#ddd' }}>{credit.credited_name}</strong><span style={{ fontSize: 10, color: '#C9A84C' }}>{roleLabel(credit.role)}</span><span style={{ fontSize: 10, color: '#666' }}>{credit.scope || 'Whole project'}</span><span title={credit.status === 'DRAFT' ? 'Awaiting the credited contributor’s response' : undefined} style={{ color: credit.status === 'CONFIRMED' ? '#72B794' : credit.status === 'DISPUTED' ? '#D94A4A' : '#888', fontSize: 9, textTransform: 'uppercase' }}>{credit.status === 'DRAFT' ? 'Awaiting contributor' : credit.status}</span><button onClick={() => removeCredit.mutate(credit.id)} aria-label={`Remove ${credit.credited_name} credit`} style={{ background: 'none', border: 0, color: '#555', cursor: 'pointer', fontSize: 16 }}>×</button></div>)}{!project.credits?.length && <div style={{ padding: 18, border: '1px dashed #222', borderRadius: 9, color: '#444', fontSize: 12, textAlign: 'center' }}>No structured credits recorded yet.</div>}</div>
        </div>

        <div style={{ marginBottom: '2rem' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><div><p style={{ margin: 0, color: '#666', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em' }}>Promotional permissions</p><p style={{ margin: '4px 0 0', color: '#444', fontSize: 10 }}>Artist consent is required before promotional use.</p></div>{project.artist && <button onClick={() => setPromoOpen(open => !open)} style={{ background: 'none', border: 0, color: '#C9A84C', cursor: 'pointer', fontSize: 12 }}>{promoOpen ? 'Cancel' : '+ Request permission'}</button>}</div>{promoOpen && <div style={{ display: 'grid', gridTemplateColumns: '1.5fr .8fr auto', gap: 8, padding: 12, border: '1px solid rgba(201,168,76,.2)', borderRadius: 10, marginBottom: 10 }}><input value={promoPurpose} onChange={event => setPromoPurpose(event.target.value)} placeholder="Purpose — e.g. announce release week" style={{ background: '#101010', border: '1px solid #242424', borderRadius: 7, padding: 9, color: '#eee', fontSize: 12 }}/><select value={promoChannel} onChange={event => setPromoChannel(event.target.value)} style={{ background: '#101010', border: '1px solid #242424', borderRadius: 7, color: '#eee', padding: 9, fontSize: 12 }}>{['INSTAGRAM','TIKTOK','YOUTUBE','WEBSITE','PRESS','PAID_ADS','EMAIL'].map(channel => <option key={channel}>{roleLabel(channel)}</option>)}</select><button onClick={() => requestPromotion.mutate()} disabled={!promoPurpose.trim()} style={{ border: 0, borderRadius: 7, background: '#C9A84C', color: '#090909', padding: '0 14px', fontWeight: 700, opacity: promoPurpose.trim() ? 1 : .4 }}>Send</button></div>}<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{project.promotional_consents?.map(consent => <div key={consent.id} style={{ padding: '10px 12px', border: '1px solid #1e1e1e', borderRadius: 9, background: '#121212', display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><strong style={{ color: '#ddd', fontSize: 12 }}>{consent.subject}</strong><p style={{ margin: '3px 0 0', color: '#666', fontSize: 10 }}>{consent.purpose} · {consent.channels.map(roleLabel).join(', ')}</p></div><span style={{ color: consent.status === 'APPROVED' ? '#1D9E75' : consent.status === 'DECLINED' || consent.status === 'WITHDRAWN' ? '#D94A4A' : '#C9A84C', fontSize: 10 }}>{consent.status}</span></div>)}{!project.promotional_consents?.length && <div style={{ border: '1px dashed #222', borderRadius: 9, padding: 16, color: '#444', textAlign: 'center', fontSize: 11 }}>No promotional permission requested.</div>}</div></div>

        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><div><p style={{ margin: 0, color: '#666', fontSize: 11, textTransform: 'uppercase' }}>Rights & ownership</p><p style={{ margin: '4px 0 0', color: '#444', fontSize: 10 }}>Master and publishing splits remain separate.</p></div>{project.artist && <button onClick={() => setRightsOpen(open => !open)} style={{ background: 'none', border: 0, color: '#C9A84C', cursor: 'pointer' }}>{rightsOpen ? 'Cancel' : '+ Propose split'}</button>}</div>
          {rightsOpen && <div style={{ padding: 12, border: '1px solid rgba(201,168,76,.2)', borderRadius: 10, marginBottom: 10 }}><div style={{ display: 'flex', gap: 8 }}><select value={rightsType} onChange={event => setRightsType(event.target.value as any)} style={{ flex: 1, background: '#101010', color: '#eee', border: '1px solid #242424', borderRadius: 7, padding: 9 }}><option value="MASTER">Master ownership</option><option value="PUBLISHING">Publishing split</option></select><label style={{ color: '#888', fontSize: 11 }}>Artist <input type="number" min={1} max={99} value={artistShare} onChange={event => setArtistShare(Math.max(1, Math.min(99, Number(event.target.value))))} style={{ width: 55, margin: '0 5px', background: '#101010', color: '#eee', border: '1px solid #242424', borderRadius: 7, padding: 8 }}/>% · Producer {100 - artistShare}%</label><button onClick={() => proposeRights.mutate()} style={{ border: 0, borderRadius: 7, background: '#C9A84C', color: '#090909', padding: '0 13px', fontWeight: 700 }}>Send</button></div><p style={{ color: '#555', fontSize: 9 }}>Must equal 100%. OIANO records acceptance; independent legal advice may still be appropriate.</p></div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>{project.rights_agreements?.map(agreement => <div key={agreement.id} style={{ padding: 12, border: '1px solid #1e1e1e', borderRadius: 9, background: '#121212' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><strong style={{ color: '#ddd', fontSize: 12 }}>{agreement.title}</strong><span style={{ color: agreement.status === 'APPROVED' ? '#1D9E75' : agreement.status === 'DISPUTED' ? '#D94A4A' : '#C9A84C', fontSize: 10 }}>{agreement.status}</span></div><div style={{ display: 'flex', gap: 7, marginTop: 8 }}>{agreement.shares.map(share => <span key={share.id} style={{ border: '1px solid #252525', borderRadius: 99, padding: '4px 8px', color: '#777', fontSize: 10 }}>{share.holder_name} · {Number(share.percentage)}%</span>)}</div>{agreement.response_note && <p style={{ margin: '8px 0 0', color: '#777', fontSize: 10 }}>{agreement.response_note}</p>}</div>)}{!project.rights_agreements?.length && <div style={{ padding: 16, border: '1px dashed #222', borderRadius: 9, color: '#444', textAlign: 'center', fontSize: 11 }}>No ownership split proposed.</div>}</div>
        </div>

        <div style={{ marginBottom: '2rem' }}><ProjectActionPanel project={project}/><MessageThread
          variant="project"
          endpoint={`/projects/${project.id}/messages`}
          queryKey={['project-messages', project.id]}
          sseMatch={(e) => e?.type === 'new_project_message' && e?.projectId === project.id}
          title="Project conversation"
          subtitle="Shared context for the whole working team"
          emptyTitle="Start with the creative direction."
          emptySubtitle="Reference tracks, goals and decisions will stay with this project."
          placeholder="Share an update, reference or decision…"
        /></div>

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
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_HEX[b.status as BookingStatus] ?? '#555', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', color: '#eee', fontWeight: 500 }}>{fmtDate(b.starts_at)}</div>
                    <div style={{ fontSize: '0.72rem', color: '#666' }}>
                      {b.service?.name ?? 'Session'} · {b.room?.name ?? 'Room TBA'} · {fmtDuration(b.starts_at, b.ends_at)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.72rem', color: STATUS_HEX[b.status as BookingStatus] ?? '#555', fontFamily: 'var(--font-mono)' }}>{b.status}</span>
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
