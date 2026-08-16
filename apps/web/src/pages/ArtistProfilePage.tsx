import { useState, useRef, useCallback, Component, ReactNode } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { useToast } from '../components/Toast';
import { getPersonality } from '../lib/personality';
import OianoBrand from '../components/OianoBrand';

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Bone({ w = '100%', h = 16, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r, flexShrink: 0,
      background: 'linear-gradient(90deg,#141414 25%,#1e1e1e 50%,#141414 75%)',
      backgroundSize: '200% 100%', animation: 'ap-shimmer 1.4s ease infinite',
    }} />
  );
}

function ArtistProfileSkeleton() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff' }}>
      <style>{`@keyframes ap-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      <header style={{ borderBottom: '1px solid #141414', padding: '16px 24px', display: 'flex', gap: 16 }}>
        <Bone w={48} h={14} r={4} /><Bone w={60} h={18} r={4} />
      </header>
      <div style={{ maxWidth: 896, margin: '0 auto', padding: '40px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', gap: 24 }}>
          <Bone w={80} h={80} r={40} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Bone w="45%" h={28} r={6} /><Bone w="25%" h={14} r={4} />
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Bone w={70} h={24} r={20} /><Bone w={60} h={24} r={20} /><Bone w={80} h={24} r={20} />
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[0,1,2,3].map(i => <div key={i} style={{ background:'#0f0f0f', border:'1px solid #1a1a1a', borderRadius:10, padding:'16px', display:'flex', flexDirection:'column', gap:8 }}><Bone w="50%" h={10} r={4}/><Bone w="70%" h={22} r={4}/></div>)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>{[80,64,56,64].map((w,i) => <Bone key={i} w={w} h={32} r={8}/>)}</div>
        <div style={{ background:'#0f0f0f', border:'1px solid #1a1a1a', borderRadius:12, padding:'24px', display:'flex', flexDirection:'column', gap:12 }}>
          <Bone w="30%" h={12} r={4}/><Bone h={14}/><Bone w="85%" h={14}/><Bone w="70%" h={14}/>
        </div>
      </div>
    </div>
  );
}

// ── Error boundary ────────────────────────────────────────────────────────────

interface EBState { hasError: boolean; message: string }
class ArtistProfileErrorBoundary extends Component<{ children: ReactNode; onBack: () => void }, EBState> {
  state: EBState = { hasError: false, message: '' };
  static getDerivedStateFromError(err: Error): EBState { return { hasError: true, message: err.message }; }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight:'100vh', background:'#060606', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
        <p style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:'#C9A84C' }}>Something went wrong</p>
        <p style={{ fontSize:12, color:'#3a3a3a', fontFamily:'monospace', maxWidth:400, textAlign:'center' }}>{this.state.message}</p>
        <button onClick={this.props.onBack} style={{ fontSize:12, color:'#555', background:'none', border:'1px solid #1e1e1e', borderRadius:8, padding:'8px 20px', cursor:'pointer', fontFamily:'inherit' }}>Go back</button>
      </div>
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  PENDING:     'Awaiting confirmation',
  CONFIRMED:   'Confirmed',
  IN_PROGRESS: 'In progress',
  COMPLETED:   'Session complete',
  CANCELLED:   'Cancelled',
  NO_SHOW:     'Missed session',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING:     '#C9A84C',
  CONFIRMED:   '#1D9E75',
  IN_PROGRESS: '#3B8BFF',
  COMPLETED:   '#555',
  CANCELLED:   '#e07070',
  NO_SHOW:     '#e07070',
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function totalHours(bookings: any[]) {
  return bookings.reduce((s, b) => {
    if (!b.starts_at || !b.ends_at) return s;
    return s + (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 3_600_000;
  }, 0);
}

function dominantRoom(bookings: any[]) {
  const c: Record<string, number> = {};
  bookings.forEach(b => { if (b.room?.name) c[b.room.name] = (c[b.room.name] ?? 0) + 1; });
  return Object.entries(c).sort((a,b) => b[1]-a[1])[0]?.[0] ?? null;
}

// ── DNA chip ──────────────────────────────────────────────────────────────────

function DNAChip({ label, color = '#C9A84C' }: { label: string; color?: string }) {
  return (
    <span style={{
      fontSize: 11, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.05em',
      padding: '3px 10px', borderRadius: 20,
      border: `1px solid ${color}30`, color, background: `${color}0a`, whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

// ── Pre-session card ──────────────────────────────────────────────────────────

function PreSessionCard({ booking }: { booking: any }) {
  const start = new Date(booking.starts_at);
  const now = Date.now();
  const diffMs = start.getTime() - now;
  const hours = Math.floor(diffMs / 3_600_000);
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  const countdown = hours > 0 ? `${hours}h ${mins}m away` : `${mins}m away`;
  const isToday = start.toDateString() === new Date().toDateString();
  const isTomorrow = start.toDateString() === new Date(Date.now() + 86_400_000).toDateString();
  const dayLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : fmtDate(booking.starts_at);

  return (
    <div style={{ background:'#0f0d08', border:'1px solid #C9A84C33', borderRadius:12, padding:'16px 20px', marginBottom:20, position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:-40, right:-40, width:160, height:160, borderRadius:'50%', background:'radial-gradient(circle,#C9A84C09 0%,transparent 70%)', pointerEvents:'none' }} />
      <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div>
          <p style={{ fontSize:9, color:'#C9A84C', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:6 }}>
            {booking.status === 'IN_PROGRESS' ? 'In session now' : 'Coming up'}
          </p>
          <p style={{ fontSize:15, color:'#f0ede8', fontWeight:600, marginBottom:3 }}>
            {booking.service?.name ?? 'Studio session'} &middot; {booking.room?.name ?? 'Room TBA'}
          </p>
          <p style={{ fontSize:12, color:'#555', fontFamily:"'JetBrains Mono',monospace" }}>
            {dayLabel} &middot; {fmtTime(booking.starts_at)} &ndash; {fmtTime(booking.ends_at)}
            {booking.engineer && ` · ${booking.engineer.name}`}
          </p>
        </div>
        <div style={{ textAlign:'right' }}>
          {booking.status !== 'IN_PROGRESS' && (
            <p style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:'#C9A84C', fontWeight:700 }}>{countdown}</p>
          )}
          <span style={{ fontSize:10, padding:'3px 10px', borderRadius:20, background:'#1D9E7522', color:'#1D9E75', border:'1px solid #1D9E7540', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.06em' }}>
            {booking.status === 'IN_PROGRESS' ? 'Live' : 'Confirmed'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Stat cell ─────────────────────────────────────────────────────────────────

function StatCell({ value, label }: { value: number | string; label: string }) {
  return (
    <div style={{ background:'#0e0e0e', border:'1px solid #141414', borderRadius:10, padding:'14px 16px', flex:1 }}>
      <p style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:700, color:'#C9A84C', lineHeight:1 }}>{value}</p>
      <p style={{ fontSize:9, color:'#2a2a2a', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.12em', textTransform:'uppercase', marginTop:5 }}>{label}</p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Sessions', 'Files'] as const;
type Tab = typeof TABS[number];

export default function ArtistProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const toast = useToast();
  const backTo = user?.role === 'STUDIO_ADMIN' ? '/admin' : '/dashboard';
  const [tab, setTab] = useState<Tab>('Overview');
  const [aiSummary, setAiSummary] = useState<string>('');
  const [loadingAI, setLoadingAI] = useState(false);
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [briefEditOpen, setBriefEditOpen] = useState(false);
  const [briefDraft, setBriefDraft] = useState('');
  const [briefSaving, setBriefSaving] = useState(false);
  const isOwner = user?.role === 'ARTIST'; // refined below after artist loads

  const { data: artist, isLoading } = useQuery({
    queryKey: ['artist', id],
    queryFn: async () => (await api.get(`/artists/${id}`)).data,
    enabled: !!id,
  });
  // true only if ARTIST viewing their own profile; used for Connect button
  const isMyProfile = artist?.user_id === user?.id;
  const canConnect = user?.role === 'ARTIST' && !isMyProfile;

  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post(`/artists/${id}/files`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['artist', id] }); toast.success('File uploaded'); },
    onError: () => toast.error('Upload failed'),
  });

  const deleteFile = useMutation({
    mutationFn: (fileId: string) => api.delete(`/artists/${id}/files/${fileId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['artist', id] }); toast.success('File deleted'); },
    onError: () => toast.error('Delete failed'),
  });

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    Array.from(e.dataTransfer.files).forEach(f => uploadFile.mutate(f));
  }, [id]);

  async function fetchAISummary() {
    setLoadingAI(true);
    try {
      const { data } = await api.get(`/artists/${id}/summary`);
      setAiSummary(data.summary);
      setBriefExpanded(true);
    } finally { setLoadingAI(false); }
  }

  if (isLoading) return <ArtistProfileSkeleton />;
  if (!artist) return null;

  const passport = artist.passport;
  const dna = passport?.creative_dna ?? {};
  const genres: string[] = dna.genres ?? [];
  const themes: string[] = dna.key_themes ?? [];
  const allBookings: any[] = artist.bookings ?? [];
  const completed = allBookings.filter((b: any) => b.status === 'COMPLETED');
  const hrs = Math.round(totalHours(completed));
  const favRoom = dominantRoom(allBookings);
  const memberYear = artist.user?.created_at ? new Date(artist.user.created_at).getFullYear() : null;
  const passportCode = passport?.passport_code ?? null;

  // Upcoming session in next 48h
  const upcoming = allBookings
    .filter((b: any) => ['CONFIRMED','IN_PROGRESS'].includes(b.status) && b.starts_at)
    .filter((b: any) => new Date(b.starts_at).getTime() - Date.now() < 48 * 3_600_000)
    .sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const nextSession = upcoming[0] ?? null;

  const briefText = aiSummary || passport?.ai_summary || '';

  return (
    <ArtistProfileErrorBoundary onBack={() => navigate(backTo)}>
    <div style={{ minHeight:'100vh', background:'#0a0a0a', color:'#f5f5f5' }}>
      <style>{`
        .ap-tab-btn { background:none; border:none; cursor:pointer; font-family:inherit; transition:color 0.15s; }
        .ap-tab-btn:hover { color:#ccc !important; }
        .ap-chip-row { display:flex; flex-wrap:wrap; gap:6px; }
        .ap-panel { background:#0d0d0d; border:1px solid #1a1a1a; border-radius:12px; padding:20px 22px; }
        .ap-panel-label { font-size:9px; color:#2a2a2a; font-family:'JetBrains Mono',monospace; letter-spacing:0.2em; text-transform:uppercase; margin-bottom:14px; }
        .ap-session-row { background:#0d0d0d; border:1px solid #141414; border-radius:10px; padding:14px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; transition:border-color 0.15s; }
        .ap-session-row:hover { border-color:#1e1e1e; }
        .ap-file-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 0; border-bottom:1px solid #111; }
        .ap-file-row:last-child { border-bottom:none; }
        @media (max-width:700px) {
          .ap-stats { grid-template-columns:1fr 1fr !important; }
          .ap-hero { flex-direction:column !important; gap:16px !important; }
        }
      `}</style>

      {/* Header */}
      <header style={{ borderBottom:'1px solid #141414', padding:'14px 24px', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => navigate(backTo)} style={{ fontSize:11, color:'#3a3a3a', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>← Back</button>
        <OianoBrand variant="compact" size={19} />
        {passportCode && (
          <span style={{ fontSize:9, color:'#222', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.22em', textTransform:'uppercase', marginLeft:'auto' }}>
            {passportCode}
          </span>
        )}
        {canConnect && (
          <button
            onClick={() => navigate(`/connect/${id}`)}
            style={{ fontSize:11, color:'#C9A84C', background:'rgba(201,168,76,0.08)', border:'1px solid rgba(201,168,76,0.2)', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontFamily:'inherit', marginLeft: passportCode ? 12 : 'auto' }}
          >
            💬 Connect
          </button>
        )}
      </header>

      <main style={{ maxWidth:860, margin:'0 auto', padding:'32px 24px 80px' }}>

        {/* Pre-session card */}
        {nextSession && <PreSessionCard booking={nextSession} />}

        {/* Hero */}
        <div className="ap-hero" style={{ display:'flex', alignItems:'flex-start', gap:24, marginBottom:24 }}>
          <div style={{ width:72, height:72, borderRadius:'50%', background:'#141414', border:'2px solid #1e1e1e', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, fontFamily:"'Playfair Display',serif", color:'#C9A84C', flexShrink:0 }}>
            {artist.avatar_url
              ? <img src={artist.avatar_url} alt={artist.name} style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }} />
              : artist.name?.[0]}
          </div>
          <div style={{ flex:1 }}>
            <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:30, fontWeight:700, color:'#f0ede8', lineHeight:1.1, marginBottom:4 }}>{artist.name}</h1>
            {artist.alias && <p style={{ fontSize:12, color:'#C9A84C', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.12em', marginBottom:8 }}>{artist.alias}</p>}

            {/* DNA chips above the fold */}
            {(genres.length > 0 || themes.length > 0) && (
              <div className="ap-chip-row" style={{ marginBottom:10 }}>
                {genres.map(g => <DNAChip key={g} label={g} color="#C9A84C" />)}
                {themes.map(t => <DNAChip key={t} label={t} color="#3B8BFF" />)}
              </div>
            )}

            {artist.bio && (
              <p style={{ fontSize:13, color:'#555', lineHeight:1.6, maxWidth:480 }}>{artist.bio}</p>
            )}
          </div>

          {/* Actions */}
          <div style={{ display:'flex', flexDirection:'column', gap:8, flexShrink:0 }}>
            {isOwner && (
              <Link to="/artist/passport" style={{ fontSize:11, color:'#C9A84C', border:'1px solid #C9A84C30', borderRadius:8, padding:'7px 14px', textDecoration:'none', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.06em', textAlign:'center', background:'#C9A84C0a' }}>
                View passport
              </Link>
            )}
            {isOwner && (
              <Link to="/book" style={{ fontSize:11, color:'#fff', border:'none', borderRadius:8, padding:'7px 14px', textDecoration:'none', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.06em', textAlign:'center', background:'#C9A84C', fontWeight:700 }}>
                Book session
              </Link>
            )}
          </div>
        </div>

        {/* Journey strip */}
        <div className="ap-stats" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:28 }}>
          <StatCell value={allBookings.length} label="Sessions" />
          <StatCell value={hrs} label="Hours recorded" />
          <StatCell value={favRoom ?? '—'} label="Home room" />
          <StatCell value={memberYear ?? '—'} label="Member since" />
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:2, borderBottom:'1px solid #141414', marginBottom:20 }}>
          {TABS.map(t => (
            <button key={t} className="ap-tab-btn" onClick={() => setTab(t)} style={{ padding:'9px 18px', fontSize:12, color: tab===t ? '#C9A84C' : '#3a3a3a', borderBottom: tab===t ? '2px solid #C9A84C' : '2px solid transparent', marginBottom:-1, letterSpacing:'0.04em' }}>
              {t}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === 'Overview' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* Creative DNA panel */}
            <div className="ap-panel">
              <div className="ap-panel-label">Creative DNA</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {genres.length > 0 && (
                  <div>
                    <p style={{ fontSize:9, color:'#2a2a2a', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:6 }}>Genres</p>
                    <div className="ap-chip-row">{genres.map(g => <DNAChip key={g} label={g} color="#C9A84C" />)}</div>
                  </div>
                )}
                {themes.length > 0 && (
                  <div>
                    <p style={{ fontSize:9, color:'#2a2a2a', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:6 }}>Themes</p>
                    <div className="ap-chip-row">{themes.map(t => <DNAChip key={t} label={t} color="#3B8BFF" />)}</div>
                  </div>
                )}
                {(dna.vocal_type || dna.energy_profile) && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:4 }}>
                    {dna.vocal_type && (
                      <div style={{ background:'#0a0a0a', borderRadius:8, padding:'10px 12px' }}>
                        <p style={{ fontSize:9, color:'#2a2a2a', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:4 }}>Vocal type</p>
                        <p style={{ fontSize:12, color:'#888' }}>{dna.vocal_type}</p>
                      </div>
                    )}
                    {dna.energy_profile && (
                      <div style={{ background:'#0a0a0a', borderRadius:8, padding:'10px 12px' }}>
                        <p style={{ fontSize:9, color:'#2a2a2a', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:4 }}>Energy</p>
                        <p style={{ fontSize:12, color: getPersonality(dna.energy_profile).color }}>{getPersonality(dna.energy_profile).label}</p>
                      </div>
                    )}
                  </div>
                )}
                {!genres.length && !themes.length && !dna.vocal_type && !dna.energy_profile && (
                  <p style={{ fontSize:12, color:'#2a2a2a', fontStyle:'italic' }}>No creative DNA yet — {isOwner ? <Link to="/artist/passport" style={{ color:'#C9A84C' }}>edit your passport</Link> : 'artist has not filled this in yet.'}</p>
                )}
              </div>
            </div>

            {/* AI Brief — inline, collapsible */}
            <div className="ap-panel">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: briefExpanded && briefText ? 14 : 0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ color:'#C9A84C', fontSize:12 }}>✦</span>
                  <span className="ap-panel-label" style={{ margin:0 }}>AI Artist Brief</span>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  {briefText && isOwner && (
                    <button onClick={() => { setBriefDraft(briefText); setBriefEditOpen(true); }} style={{ fontSize:10, color:'#3a3a3a', background:'none', border:'none', cursor:'pointer', fontFamily:"'JetBrains Mono',monospace" }}>
                      Edit
                    </button>
                  )}
                  {briefText ? (
                    <button onClick={() => setBriefExpanded(v => !v)} style={{ fontSize:10, color:'#C9A84C', background:'none', border:'none', cursor:'pointer', fontFamily:"'JetBrains Mono',monospace" }}>
                      {briefExpanded ? 'Collapse ↑' : 'Read brief →'}
                    </button>
                  ) : (
                    <button onClick={fetchAISummary} disabled={loadingAI} style={{ fontSize:10, color:'#C9A84C', background:'none', border:'none', cursor:'pointer', fontFamily:"'JetBrains Mono',monospace", opacity: loadingAI ? 0.5 : 1 }}>
                      {loadingAI ? 'Generating…' : 'Generate brief →'}
                    </button>
                  )}
                </div>
              </div>
              {briefExpanded && briefText && (
                <p style={{ fontSize:13, color:'#888', lineHeight:1.7, whiteSpace:'pre-wrap' }}>{briefText}</p>
              )}
              {!briefText && !loadingAI && (
                <p style={{ fontSize:11, color:'#2a2a2a', marginTop:8 }}>Complete your passport to generate an AI brief.</p>
              )}
            </div>

            {/* Wallet — admin only */}
            {user?.role === 'STUDIO_ADMIN' && (
              <div className="ap-panel">
                <div className="ap-panel-label">Wallet</div>
                <p style={{ fontFamily:"'Playfair Display',serif", fontSize:28, fontWeight:700, color:'#C9A84C' }}>
                  ${Number(artist.wallet?.balance_usd ?? 0).toFixed(2)}
                </p>
                <p style={{ fontSize:11, color:'#3a3a3a', marginTop:4 }}>Available balance</p>
              </div>
            )}
          </div>
        )}

        {/* ── Sessions ── */}
        {tab === 'Sessions' && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {allBookings.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 24px' }}>
                <p style={{ fontFamily:"'Playfair Display',serif", fontSize:20, color:'#1e1e1e', marginBottom:12 }}>No sessions yet</p>
                <p style={{ fontSize:12, color:'#2a2a2a', marginBottom:20 }}>Your session history will appear here.</p>
                {isOwner && (
                  <Link to="/book" style={{ fontSize:12, color:'#C9A84C', border:'1px solid #C9A84C30', borderRadius:8, padding:'9px 20px', textDecoration:'none', background:'#C9A84C0a' }}>
                    Book your first session →
                  </Link>
                )}
              </div>
            ) : (
              allBookings
                .filter((b: any) => b.starts_at)
                .sort((a: any, b: any) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
                .map((b: any) => (
                  <div key={b.id} className="ap-session-row">
                    <div>
                      <p style={{ fontSize:13, color:'#d4d4d4', fontWeight:500, marginBottom:3 }}>
                        {b.service?.name ?? 'Studio session'}
                        {b.room?.name && <span style={{ color:'#3a3a3a', fontWeight:400 }}> &middot; {b.room.name}</span>}
                      </p>
                      <p style={{ fontSize:11, color:'#3a3a3a', fontFamily:"'JetBrains Mono',monospace" }}>
                        {fmtDate(b.starts_at)} &middot; {fmtTime(b.starts_at)}
                        {b.engineer?.name && ` · ${b.engineer.name}`}
                      </p>
                    </div>
                    <span style={{ fontSize:10, padding:'3px 10px', borderRadius:20, border:`1px solid ${STATUS_COLOR[b.status] ?? '#333'}33`, color: STATUS_COLOR[b.status] ?? '#555', background:`${STATUS_COLOR[b.status] ?? '#555'}0a`, fontFamily:"'JetBrains Mono',monospace", flexShrink:0 }}>
                      {STATUS_LABEL[b.status] ?? b.status}
                    </span>
                  </div>
                ))
            )}
          </div>
        )}

        {/* ── Files ── */}
        {tab === 'Files' && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {/* Drop zone — owner or admin only */}
            {(isOwner || user?.role === 'STUDIO_ADMIN') && (
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{ border:`2px dashed ${dragOver ? '#C9A84C' : '#1e1e1e'}`, borderRadius:10, padding:'28px 24px', textAlign:'center', cursor:'pointer', background: dragOver ? '#C9A84C08' : 'transparent', transition:'all 0.15s' }}
              >
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => Array.from(e.target.files ?? []).forEach(f => uploadFile.mutate(f))} />
                {uploadFile.isPending ? (
                  <p style={{ fontSize:12, color:'#555' }}>Uploading…</p>
                ) : (
                  <>
                    <p style={{ fontSize:13, color:'#555', marginBottom:4 }}>Drop files or click to upload</p>
                    <p style={{ fontSize:10, color:'#2a2a2a', fontFamily:"'JetBrains Mono',monospace" }}>.flp · .wav · .mp3 · .aiff · .zip · images — up to 200 MB</p>
                  </>
                )}
              </div>
            )}

            {/* Files grouped by session/booking */}
            {!artist.files?.length ? (
              <div style={{ textAlign:'center', padding:'48px 24px' }}>
                <p style={{ fontFamily:"'Playfair Display',serif", fontSize:20, color:'#1e1e1e', marginBottom:8 }}>No files yet</p>
                <p style={{ fontSize:12, color:'#2a2a2a' }}>Session files delivered by engineers will appear here.</p>
              </div>
            ) : (
              <div className="ap-panel">
                <div className="ap-panel-label">
                  {artist.files.length} file{artist.files.length !== 1 ? 's' : ''}
                </div>
                {artist.files
                  .sort((a: any, b: any) => new Date(b.uploaded_at ?? 0).getTime() - new Date(a.uploaded_at ?? 0).getTime())
                  .map((file: any) => (
                    <div key={file.id} className="ap-file-row">
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:13, color:'#d4d4d4', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{file.name ?? file.key?.split('/').pop() ?? 'File'}</p>
                        <p style={{ fontSize:10, color:'#3a3a3a', fontFamily:"'JetBrains Mono',monospace", marginTop:2 }}>
                          {file.size_bytes ? fmtSize(file.size_bytes) : ''}
                          {file.uploaded_at ? ` · ${fmtDate(file.uploaded_at)}` : ''}
                        </p>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
                        <a href={file.url} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'#C9A84C', textDecoration:'none', fontFamily:"'JetBrains Mono',monospace" }}>Download</a>
                        {(isOwner || user?.role === 'STUDIO_ADMIN') && (
                          <button onClick={() => deleteFile.mutate(file.id)} disabled={deleteFile.isPending} style={{ fontSize:11, color:'#2a2a2a', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

      </main>
    </div>

    {/* Brief edit modal */}
    {briefEditOpen && (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ background:'#0f0f0f', border:'1px solid #1e1e1e', borderRadius:16, padding:28, width:'100%', maxWidth:540, display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <p style={{ fontSize:11, color:'#C9A84C', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.14em', textTransform:'uppercase' }}>Edit AI Brief</p>
            <button onClick={() => setBriefEditOpen(false)} style={{ color:'#3a3a3a', background:'none', border:'none', cursor:'pointer', fontSize:16 }}>✕</button>
          </div>
          <textarea value={briefDraft} onChange={e => setBriefDraft(e.target.value)} rows={10}
            style={{ background:'#060606', border:'1px solid #1e1e1e', borderRadius:10, padding:'12px 14px', color:'#d4d4d4', fontSize:13, lineHeight:1.6, resize:'vertical', fontFamily:'inherit', outline:'none' }} />
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={() => setBriefEditOpen(false)} style={{ fontSize:12, color:'#555', background:'none', border:'1px solid #1e1e1e', borderRadius:8, padding:'8px 18px', cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
            <button disabled={briefSaving} onClick={async () => {
              setBriefSaving(true);
              try {
                await api.patch('/passport/summary', { ai_summary: briefDraft });
                setAiSummary(briefDraft);
                qc.invalidateQueries({ queryKey: ['artist', id] });
                setBriefEditOpen(false);
                toast.success('Brief updated');
              } finally { setBriefSaving(false); }
            }} style={{ fontSize:12, fontWeight:700, color:'#000', background:'#C9A84C', border:'none', borderRadius:8, padding:'8px 18px', cursor:'pointer', fontFamily:'inherit', opacity: briefSaving ? 0.6 : 1 }}>
              {briefSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    )}

    </ArtistProfileErrorBoundary>
  );
}
