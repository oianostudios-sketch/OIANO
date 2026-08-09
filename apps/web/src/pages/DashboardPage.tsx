import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { api } from '../lib/api';
import ProfileEditDrawer from '../components/ProfileEditDrawer';
import NotificationBell from '../components/NotificationBell';
import ArtistPassportCard from '../components/ArtistPassportCard';
import { useToast } from '../components/Toast';
import { useStudioState } from '../context/StudioState';
import SessionStats from '../components/SessionStats';
import SunMark from '../components/SunMark';
import { fmtTime as _fmtTime, fmtDateShort as _fmtDateShort } from '../lib/fmt';

// ── Helpers ───────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function fmtDate() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

const fmtTime = (iso: string) => _fmtTime(iso);
const fmtDateShort = (iso: string) => _fmtDateShort(iso);

function minsUntil(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function totalHours(bookings: any[]) {
  return bookings.reduce((sum, b) => {
    if (!b.starts_at || !b.ends_at) return sum;
    return sum + (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 3_600_000;
  }, 0);
}

function dominantRoom(bookings: any[]) {
  const counts: Record<string, number> = {};
  bookings.forEach(b => { if (b.room?.name) counts[b.room.name] = (counts[b.room.name] ?? 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// ── Animated counter ──────────────────────────────────────────────────────────

function useCounter(target: number, duration = 1000) {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (target === prev.current) return;
    const start = prev.current; const diff = target - start;
    const t0 = performance.now();
    function step(now: number) {
      const t = Math.min((now - t0) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(start + diff * ease);
      if (t < 1) requestAnimationFrame(step);
      else { prev.current = target; setVal(target); }
    }
    requestAnimationFrame(step);
  }, [target, duration]);
  return val;
}

// ── Countdown to next session ─────────────────────────────────────────────────

function SessionCountdown({ session }: { session: any }) {
  const [label, setLabel] = useState('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function calc() {
      const now = Date.now();
      const start = new Date(session.starts_at).getTime();
      if (start > now) {
        const diff = start - now;
        const m = Math.floor(diff / 60_000);
        const h = Math.floor(m / 60);
        const rem = m % 60;
        setLabel(h > 0 ? `${h}h ${rem}m` : `${m}m`);
        // progress toward session start from midnight
        const midnight = new Date(); midnight.setHours(0,0,0,0);
        const span = start - midnight.getTime();
        setProgress(Math.min(1, (now - midnight.getTime()) / span));
      } else {
        const end = new Date(session.ends_at).getTime();
        const elapsed = now - start;
        const total   = end - start;
        setLabel('In progress');
        setProgress(Math.min(1, elapsed / total));
      }
    }
    calc();
    const id = setInterval(calc, 10_000);
    return () => clearInterval(id);
  }, [session]);

  const isPast = new Date(session.starts_at).getTime() <= Date.now();

  return (
    <div style={{
      background: '#0f0d08', border: '1px solid #5A9BCB33',
      borderRadius: 12, padding: '16px 20px', position: 'relative', overflow: 'hidden',
    }}>
      {/* Glow */}
      <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, #5A9BCB0d 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative' }}>
        <p style={{ fontSize: 9, color: '#555', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'monospace', marginBottom: 8 }}>
          {isPast ? 'Session in progress' : 'Next session'}
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 22, color: '#5A9BCB', fontWeight: 700 }}>{label}</span>
          {!isPast && <span style={{ fontSize: 11, color: '#555' }}>until your session</span>}
        </div>
        <p style={{ fontSize: 12, color: '#e4e4e7', fontWeight: 500, marginBottom: 2 }}>
          {session.service?.name ?? 'Studio session'}
        </p>
        <p style={{ fontSize: 11, color: '#555', fontFamily: 'monospace' }}>
          {fmtTime(session.starts_at)} – {fmtTime(session.ends_at)} · {session.room?.name ?? 'Room TBA'}
        </p>
        {/* Progress bar */}
        <div style={{ marginTop: 12, height: 2, background: '#1e1e1e', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, background: 'linear-gradient(90deg, #5A9BCB, #8BBEDD)', borderRadius: 2, transition: 'width 10s linear' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: '#3a3a3a', fontFamily: 'monospace' }}>
          <span>Now</span>
          <span>{fmtTime(session.starts_at)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Genre / DNA tags ──────────────────────────────────────────────────────────

function DNATags({ tags, color = '#C9A84C' }: { tags: string[]; color?: string }) {
  if (!tags.length) return <span style={{ fontSize: 11, color: '#2a2a2a' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {tags.map(t => (
        <span key={t} style={{
          fontSize: 10, fontFamily: 'monospace', letterSpacing: '0.06em',
          padding: '3px 10px', borderRadius: 20,
          border: `1px solid ${color}30`, color, background: `${color}08`,
        }}>{t}</span>
      ))}
    </div>
  );
}

// ── Studio state bar (inline, not the floating widget) ────────────────────────

function StudioBar() {
  const { isLive, activeSession, todaySessions } = useStudioState();
  const next = !isLive
    ? todaySessions.filter(s => s.starts_at && new Date(s.starts_at).getTime() > Date.now())
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0]
    : null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 14px', borderRadius: 8,
      background: isLive ? '#120d08' : '#0f0f0f',
      border: `1px solid ${isLive ? '#5A9BCB22' : '#1a1a1a'}`,
      fontSize: 11, fontFamily: 'monospace',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: isLive ? '#E8823A' : '#22c55e',
        boxShadow: `0 0 5px ${isLive ? '#E8823A' : '#22c55e'}`,
        animation: isLive ? 'db-pulse 1s ease-in-out infinite' : 'none',
      }} />
      {isLive ? (
        <span style={{ color: '#5A9BCB' }}>
          Studio live · {(activeSession as any)?.artist?.name ?? 'Session in progress'}
        </span>
      ) : next ? (
        <span style={{ color: '#555' }}>
          Next session {minsUntil(next.starts_at)} · {fmtTime(next.starts_at)}
        </span>
      ) : (
        <span style={{ color: '#3a3a3a' }}>Studio ready</span>
      )}
    </div>
  );
}

// ── Main DashboardPage ────────────────────────────────────────────────────────

const TOP_UP_PRESETS = [25, 50, 100, 200];
const TOP_UP_MIN = 10;
const TOP_UP_MAX = 5000;

export default function DashboardPage() {
  const { user, logout } = useAuthStore();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Auto-redirect new artists who haven't completed onboarding
  // Trigger: ARTIST role + no bio + profile_strength is 0 or undefined
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [editOpen, setEditOpen] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState<number | ''>(100);
  const [topUpCustom, setTopUpCustom] = useState(false);
  const [topUpLoading, setTopUpLoading] = useState(false);

  // Show toast if returning from Stripe top-up
  useEffect(() => {
    const status = searchParams.get('topup');
    const amount = searchParams.get('amount');
    if (status === 'success' && amount) {
      toast.success(`$${amount} added to your wallet!`);
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
    }
    if (status === 'cancelled') toast.error('Top-up cancelled');
  }, []);

  // Latest studio announcement — dismissed per-session via state
  const [announcementDismissed, setAnnouncementDismissed] = useState<string | null>(null);
  const { data: latestAnnouncement } = useQuery({
    queryKey: ['studio-announcement'],
    queryFn: async () => {
      const res = await api.get('/admin/announcements');
      return Array.isArray(res.data) ? res.data[0] ?? null : null;
    },
    staleTime: 60_000,
  });

  const { data: bookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ['bookings'],
    queryFn: async () => (await api.get('/bookings')).data,
  });

  const { data: studio } = useQuery({
    queryKey: ['studio'],
    queryFn: async () => (await api.get('/studio')).data,
  });

  const requestCredit = useMutation({
    mutationFn: () => api.post('/admin/credit-request', {}),
    onSuccess: () => toast.success('Credit request sent — the studio will top you up'),
    onError: () => toast.error('Failed to send request'),
  });

  async function handleTopUp() {
    setTopUpLoading(true);
    try {
      const { data } = await api.post('/payments/wallet/top-up', { amount_usd: topUpAmount });
      window.location.href = data.checkout_url;
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Top-up failed');
      setTopUpLoading(false);
    }
  }

  const artist   = user?.artist;
  const passport = artist?.passport;
  const balance  = Number(artist?.wallet?.balance_usd ?? 0);

  // Profile completion score
  const profileFields = [
    { label: 'Avatar', done: !!(artist as any)?.avatar_url },
    { label: 'Bio', done: !!(artist as any)?.bio },
    { label: 'Alias', done: !!artist?.alias },
    { label: 'Genres', done: ((passport as any)?.creative_dna?.genres?.length ?? 0) > 0 },
    { label: 'Vocal type', done: !!(passport as any)?.creative_dna?.vocal_type },
    { label: 'Energy', done: !!(passport as any)?.creative_dna?.energy_profile },
  ];
  const profileScore = Math.round((profileFields.filter(f => f.done).length / profileFields.length) * 100);
  const missingFields = profileFields.filter(f => !f.done);

  const allBookings = Array.isArray(bookings) ? bookings : (bookings as any)?.data ?? [];

  const upcoming = useMemo(() =>
    allBookings.filter((b: any) => ['PENDING','CONFIRMED'].includes(b.status) && b.starts_at)
      .sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
  [allBookings]);

  const completed = allBookings.filter((b: any) => b.status === 'COMPLETED');
  const recent    = allBookings
    .filter((b: any) => b.starts_at)
    .sort((a: any, b: any) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
    .slice(0, 5);

  const nextSession = upcoming[0] ?? null;

  // Animated stats
  const cSessions  = useCounter(allBookings.length);
  const cHours     = useCounter(Math.round(totalHours(completed)));
  const cCompleted = useCounter(completed.length);

  const favRoom = dominantRoom(allBookings);
  const creativeDNA  = (passport as any)?.creative_dna ?? {};
  const genres       = creativeDNA.genres ?? [];
  const vocalType    = creativeDNA.vocal_type ?? null;
  const energyProfile = creativeDNA.energy_profile ?? null;
  const themes       = creativeDNA.key_themes ?? [];

  function handleLogout() { logout(); navigate('/enter'); }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#f5f5f5' }}>
      <style>{`
        @keyframes db-pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
        @keyframes db-fade-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .db-fade { animation: db-fade-in 0.4s ease both; }
        .db-fade-1 { animation-delay: 0.05s; }
        .db-fade-2 { animation-delay: 0.12s; }
        .db-fade-3 { animation-delay: 0.2s; }
        .db-fade-4 { animation-delay: 0.28s; }
        .db-session-row:hover { background: #141414 !important; }
        @media (max-width: 768px) {
          .db-header { display: none; }
          .db-main { padding: 20px 16px 100px !important; }
          .db-hero { flex-direction: column !important; align-items: flex-start !important; gap: 16px !important; }
          .db-hero-stats { flex-direction: row !important; gap: 20px !important; }
          .db-hero-stats > div { text-align: left !important; }
          .db-two-col { grid-template-columns: 1fr !important; }
          .db-col-left { order: 2; }
          .db-col-right { order: 1; }
          .db-inner-grid { grid-template-columns: 1fr 1fr !important; }
          .db-topup-grid { grid-template-columns: 1fr 1fr !important; }
          .db-welcome h1 { font-size: 24px !important; }
        }
      `}</style>

      {/* Nav */}
      <header className="db-header" style={{ borderBottom: '1px solid #141414', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SunMark size={24} />
          <span style={{ color: '#2a2a2a', fontSize: 11, fontFamily: 'monospace' }}>StudioOS</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <StudioBar />
          <NotificationBell />
          <button onClick={handleLogout} style={{ fontSize: 11, color: '#3a3a3a', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            sign out
          </button>
        </div>
      </header>

      {/* Studio announcement bar */}
      {latestAnnouncement && announcementDismissed !== latestAnnouncement.id && (
        <div style={{ background: 'rgba(90,155,203,0.08)', borderBottom: '1px solid rgba(90,155,203,0.15)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14 }}>📢</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#5A9BCB' }}>{latestAnnouncement.title}</span>
            <span style={{ fontSize: 12, color: '#888', marginLeft: 10 }}>{latestAnnouncement.body}</span>
          </div>
          <button onClick={() => setAnnouncementDismissed(latestAnnouncement.id)}
            style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>
            ×
          </button>
        </div>
      )}

      <main className="db-main" style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 28, paddingBottom: 'calc(32px + 68px)' }}>

        {/* ── Welcome hero ── */}
        <div className="db-fade db-hero" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, color: '#3a3a3a', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 4 }}>
              {fmtDate()}
            </p>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, color: '#e4e4e7', fontWeight: 600, lineHeight: 1.2 }}>
              {greeting()},<br />
              <span style={{ color: '#5A9BCB' }}>{artist?.alias ?? artist?.name ?? user?.email?.split('@')[0]}</span>
            </h1>
            {(passport as any)?.bio && (
              <p style={{ marginTop: 10, fontSize: 13, color: '#555', maxWidth: 480, lineHeight: 1.6 }}>
                {(passport as any).bio.slice(0, 120)}{(passport as any).bio.length > 120 ? '…' : ''}
              </p>
            )}
          </div>

          {/* Micro stats */}
          <div className="db-hero-stats" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Sessions', value: Math.round(cSessions) },
              { label: 'Hours at OIANO', value: Math.round(cHours) },
              { label: 'Completed', value: Math.round(cCompleted) },
            ].map((s, i) => (
              <div key={s.label} className="metric-enter" style={{ textAlign: 'right', animationDelay: `${i * 80}ms` }}>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: '#5A9BCB', fontWeight: 700, lineHeight: 1 }}>
                  {loadingBookings ? '—' : s.value}
                </p>
                <p style={{ fontSize: 10, color: '#3a3a3a', fontFamily: 'monospace', marginTop: 3 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Two-column grid ── */}
        <div className="db-fade db-fade-1 db-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* LEFT: Passport card + actions */}
          <div className="db-col-left" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {passport && artist ? (
              <>
                <ArtistPassportCard
                  artist={{
                    id: artist.id,
                    name: artist.name,
                    alias: artist.alias,
                    avatar_url: (artist as any).avatar_url,
                    bio: (artist as any).bio,
                    passport: {
                      passport_code: (passport as any).passport_code,
                      profile_strength: (passport as any).profile_strength,
                      creative_dna: (passport as any).creative_dna,
                    },
                  }}
                  editable
                  size="md"
                />
                <p style={{ fontSize: 10, color: '#2a2a2a', fontFamily: 'monospace', textAlign: 'center' }}>Click card to flip</p>
              </>
            ) : (
              <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: 24, textAlign: 'center' }}>
                <p style={{ color: '#444', fontSize: 12 }}>Complete your profile to unlock your passport</p>
                <button onClick={() => setEditOpen(true)} style={{ marginTop: 12, fontSize: 11, color: '#5A9BCB', background: 'none', border: '1px solid #5A9BCB30', padding: '6px 14px', borderRadius: 6, cursor: 'pointer' }}>
                  Set up profile →
                </button>
              </div>
            )}

            {/* Quick actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Link to="/book" style={{ display: 'block', textAlign: 'center', background: '#5A9BCB', color: '#000', fontSize: 13, fontWeight: 700, padding: '11px 0', borderRadius: 8, textDecoration: 'none' }}>
                Book a session →
              </Link>
              <div className="db-inner-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Link to="/passport" style={{ display: 'block', textAlign: 'center', fontSize: 11, color: '#888', border: '1px solid #1e1e1e', padding: '9px 0', borderRadius: 7, textDecoration: 'none' }}>
                  Share passport
                </Link>
                <button onClick={() => setEditOpen(true)} style={{ fontSize: 11, color: '#888', border: '1px solid #1e1e1e', padding: '9px 0', borderRadius: 7, background: 'none', cursor: 'pointer' }}>
                  Edit profile
                </button>
              </div>
              {artist?.id && (
                <Link to={`/artists/${artist.id}`} style={{ display: 'block', textAlign: 'center', fontSize: 11, color: '#555', border: '1px solid #141414', padding: '8px 0', borderRadius: 7, textDecoration: 'none' }}>
                  Full artist profile
                </Link>
              )}
            </div>

            {/* Profile completion nudge */}
            <div style={{ background: '#0f0f0f', border: '1px solid #1a1200', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <p style={{ fontSize: 10, color: '#5A9BCB', fontFamily: 'monospace', letterSpacing: '0.1em', margin: 0 }}>PASSPORT STRENGTH</p>
                <span style={{ fontSize: 12, fontWeight: 700, color: profileScore >= 80 ? '#4ade80' : '#C9A84C' }}>{profileScore}%</span>
              </div>
              <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ height: '100%', width: `${profileScore}%`, background: profileScore >= 80 ? '#4ade80' : '#C9A84C', borderRadius: 2, transition: 'width 0.6s ease' }} />
              </div>
              {profileScore < 100 && missingFields.length > 0 && (
                <p style={{ fontSize: 11, color: '#555', margin: '0 0 8px' }}>
                  Missing: {missingFields.map(f => f.label).join(', ')}
                </p>
              )}
              {/* Profile view count — shows when someone has looked */}
              {(passport as any)?.profile_views > 0 && (
                <p style={{ fontSize: 11, color: '#3a6a3a', margin: '0 0 8px', fontFamily: 'monospace' }}>
                  👁 Viewed {(passport as any).profile_views} time{(passport as any).profile_views !== 1 ? 's' : ''} by engineers
                </p>
              )}
              <button onClick={() => setEditOpen(true)} style={{ fontSize: 11, color: '#5A9BCB', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {profileScore < 100 ? 'Complete profile →' : 'Edit profile →'}
              </button>
            </div>

            {/* Wallet — framed as studio investment, not a gate */}
            <div style={{ background: '#111', border: `1px solid ${balance > 0 ? '#1e1e0a' : '#1a1a1a'}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <p style={{ fontSize: 10, color: '#3a3a3a', fontFamily: 'monospace', letterSpacing: '0.1em', margin: 0 }}>STUDIO WALLET</p>
                {balance > 0 && (
                  <span style={{ fontSize: 9, color: '#2a4a2a', fontFamily: 'monospace', background: '#1a2a1a', padding: '2px 7px', borderRadius: 99 }}>
                    ~{Math.floor(balance / 50)} session{Math.floor(balance / 50) !== 1 ? 's' : ''} available
                  </span>
                )}
              </div>
              {balance > 0 ? (
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: '#5A9BCB', fontWeight: 600, margin: 0 }}>
                  ${balance.toFixed(2)}
                </p>
              ) : (
                <div>
                  <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: '#443', fontWeight: 600, margin: '0 0 2px' }}>
                    {completed.length > 0
                      ? `${completed.length} session${completed.length !== 1 ? 's' : ''} recorded here`
                      : 'Ready when you are'}
                  </p>
                  <p style={{ fontSize: 11, color: '#333', margin: 0 }}>
                    {completed.length > 0
                      ? 'Add credits to book your next session →'
                      : 'Add credits to book your first session'}
                  </p>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => setTopUpOpen(true)}
                  style={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#000', background: '#5A9BCB', border: 'none', padding: '8px 0', borderRadius: 6, cursor: 'pointer' }}>
                  + Add credits
                </button>
                <button onClick={() => requestCredit.mutate()}
                  disabled={requestCredit.isPending || requestCredit.isSuccess}
                  style={{ flex: 1, fontSize: 11, color: '#666', background: 'none', border: '1px solid #222', padding: '8px 0', borderRadius: 6, cursor: 'pointer' }}>
                  {requestCredit.isSuccess ? '✓ Requested' : 'Request free'}
                </button>
              </div>
            </div>

            {/* Top-up modal */}
            {topUpOpen && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                onClick={() => setTopUpOpen(false)}>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380 }}
                  onClick={e => e.stopPropagation()}>
                  <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: '#fff', margin: '0 0 4px' }}>Add Studio Credits</p>
                  <p style={{ fontSize: 12, color: '#555', margin: '0 0 20px' }}>Credits are used to book sessions instantly. Minimum $10.</p>
                  {/* Preset quick-picks */}
                  <div className="db-topup-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    {TOP_UP_PRESETS.map(amt => (
                      <button key={amt} onClick={() => { setTopUpAmount(amt); setTopUpCustom(false); }}
                        style={{ padding: '14px 0', borderRadius: 10, border: `2px solid ${!topUpCustom && topUpAmount === amt ? '#5A9BCB' : '#222'}`, background: !topUpCustom && topUpAmount === amt ? '#5A9BCB15' : '#0a0a0a', color: !topUpCustom && topUpAmount === amt ? '#5A9BCB' : '#555', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}>
                        ${amt}
                      </button>
                    ))}
                  </div>
                  {/* Custom amount */}
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ fontSize: 11, color: '#444', margin: '0 0 6px' }}>Or enter a custom amount</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0a0a0a', border: `1px solid ${topUpCustom ? '#5A9BCB' : '#222'}`, borderRadius: 10, padding: '0 14px' }}>
                      <span style={{ color: '#555', fontSize: 16 }}>$</span>
                      <input
                        type="number"
                        min={TOP_UP_MIN}
                        max={TOP_UP_MAX}
                        placeholder="Amount"
                        onFocus={() => setTopUpCustom(true)}
                        onChange={e => { setTopUpCustom(true); setTopUpAmount(e.target.value === '' ? '' : Number(e.target.value)); }}
                        value={topUpCustom ? (topUpAmount === '' ? '' : topUpAmount) : ''}
                        style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: 16, padding: '12px 0' }}
                      />
                    </div>
                    {topUpCustom && topUpAmount !== '' && (Number(topUpAmount) < TOP_UP_MIN || Number(topUpAmount) > TOP_UP_MAX) && (
                      <p style={{ color: '#e05', fontSize: 11, margin: '4px 0 0' }}>Must be between ${TOP_UP_MIN} and ${TOP_UP_MAX}</p>
                    )}
                  </div>
                  <button
                    onClick={handleTopUp}
                    disabled={topUpLoading || topUpAmount === '' || Number(topUpAmount) < TOP_UP_MIN || Number(topUpAmount) > TOP_UP_MAX}
                    style={{ width: '100%', padding: '14px 0', background: '#5A9BCB', color: '#000', fontWeight: 700, fontSize: 14, borderRadius: 10, border: 'none', cursor: 'pointer', opacity: (topUpLoading || topUpAmount === '' || Number(topUpAmount) < TOP_UP_MIN) ? 0.5 : 1 }}>
                    {topUpLoading ? 'Redirecting to Stripe…' : `Pay $${topUpAmount || '—'} via Stripe →`}
                  </button>
                  <button onClick={() => { setTopUpOpen(false); setTopUpCustom(false); setTopUpAmount(100); }}
                    style={{ width: '100%', marginTop: 10, padding: '10px 0', background: 'none', color: '#444', fontSize: 12, border: 'none', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Next session + creative identity */}
          <div className="db-col-right" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Next session countdown */}
            {nextSession ? (
              <SessionCountdown session={nextSession} />
            ) : (
              <div style={{ background: '#0f0f0f', border: '1px solid #141414', borderRadius: 12, padding: '16px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 10, color: '#2a2a2a', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 8 }}>NEXT SESSION</p>
                <p style={{ fontSize: 12, color: '#3a3a3a' }}>No upcoming sessions</p>
                <p style={{ fontSize: 11, color: '#2a2a2a', marginTop: 4 }}>The studio is ready when you are</p>
                <Link to="/book" style={{ display: 'inline-block', marginTop: 10, fontSize: 11, color: '#5A9BCB', border: '1px solid #5A9BCB30', padding: '6px 14px', borderRadius: 6, textDecoration: 'none' }}>
                  Book now →
                </Link>
              </div>
            )}

            {/* Creative identity */}
            <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: '16px 20px' }}>
              <p style={{ fontSize: 10, color: '#3a3a3a', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 14 }}>CREATIVE IDENTITY</p>

              {genres.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>Genres</p>
                  <DNATags tags={genres} color="#C9A84C" />
                </div>
              )}

              {themes.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>Themes</p>
                  <DNATags tags={themes} color="#3B8BFF" />
                </div>
              )}

              <div className="db-inner-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
                {vocalType && (
                  <div style={{ background: '#0a0a0a', borderRadius: 8, padding: '10px 12px' }}>
                    <p style={{ fontSize: 9, color: '#3a3a3a', fontFamily: 'monospace', marginBottom: 4 }}>VOCAL TYPE</p>
                    <p style={{ fontSize: 12, color: '#888' }}>{vocalType}</p>
                  </div>
                )}
                {energyProfile && (
                  <div style={{ background: '#0a0a0a', borderRadius: 8, padding: '10px 12px' }}>
                    <p style={{ fontSize: 9, color: '#3a3a3a', fontFamily: 'monospace', marginBottom: 4 }}>ENERGY</p>
                    <p style={{ fontSize: 12, color: '#888' }}>{energyProfile}</p>
                  </div>
                )}
              </div>

              {!genres.length && !vocalType && !energyProfile && (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <p style={{ fontSize: 11, color: '#2a2a2a' }}>No creative profile yet</p>
                  <button onClick={() => setEditOpen(true)} style={{ marginTop: 8, fontSize: 11, color: '#5A9BCB', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Build your creative DNA →
                  </button>
                </div>
              )}
            </div>

            {/* Studio presence */}
            <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ fontSize: 10, color: '#3a3a3a', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 12 }}>YOUR OIANO PRESENCE</p>
              <div className="db-inner-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Fav room', value: favRoom ?? '—' },
                  { label: 'Studio', value: studio?.name ?? 'Dreamz Music Lab' },
                  { label: 'Profile', value: passport ? `${(passport as any).profile_strength ?? 0}%` : '—' },
                  { label: 'Code', value: (passport as any)?.passport_code ?? '—' },
                ].map(item => (
                  <div key={item.label}>
                    <p style={{ fontSize: 9, color: '#3a3a3a', fontFamily: 'monospace' }}>{item.label.toUpperCase()}</p>
                    <p style={{ fontSize: 12, color: '#888', marginTop: 2, fontFamily: 'monospace' }}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── E: Session stats ── */}
        <div className="db-fade db-fade-2" style={{ marginTop: 20 }}>
          <SessionStats />
        </div>

        {/* ── D: Discover CTA ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#111', border: '1px solid #1a1a1a', borderRadius: 10, padding: '14px 18px', marginTop: 8 }}>
          <div>
            <p style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>Find artists to collaborate with</p>
            <p style={{ fontSize: 10, color: '#3a3a3a', marginTop: 2 }}>Browse the Dreamz Music Lab roster by creative DNA match</p>
          </div>
          <Link to="/discover" style={{ fontSize: 11, color: '#5A9BCB', border: '1px solid #5A9BCB30', padding: '7px 14px', borderRadius: 7, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 12 }}>
            Discover →
          </Link>
        </div>

        {/* ── D2: Browse producers CTA ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#111', border: '1px solid #1a1a1a', borderRadius: 10, padding: '14px 18px', marginTop: 8 }}>
          <div>
            <p style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>Find a producer for your next session</p>
            <p style={{ fontSize: 10, color: '#3a3a3a', marginTop: 2 }}>Browse profiles and preview their beat catalogue</p>
          </div>
          <Link to="/producers" style={{ fontSize: 11, color: '#5A9BCB', border: '1px solid rgba(90,155,203,0.3)', padding: '7px 14px', borderRadius: 7, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 12 }}>
            Producers →
          </Link>
        </div>

        {/* ── Session history timeline ── */}
        <div className="db-fade db-fade-2">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontSize: 11, color: '#3a3a3a', fontFamily: 'monospace', letterSpacing: '0.1em' }}>SESSION HISTORY</p>
            <Link to="/book" style={{ fontSize: 11, color: '#5A9BCB', textDecoration: 'none' }}>+ Book</Link>
          </div>

          {loadingBookings ? (
            <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 10, padding: 24, textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: '#2a2a2a' }}>Loading…</p>
            </div>
          ) : recent.length === 0 ? (
            <div style={{ background: '#0f0f0f', border: '1px solid #141414', borderRadius: 10, padding: '28px', textAlign: 'center' }}>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: '#3a3a3a', marginBottom: 6 }}>The studio is listening.</p>
              <p style={{ fontSize: 12, color: '#2a2a2a' }}>Book your first session and start building your story here.</p>
              <Link to="/book" style={{ display: 'inline-block', marginTop: 14, background: '#5A9BCB', color: '#000', fontSize: 12, fontWeight: 700, padding: '9px 20px', borderRadius: 7, textDecoration: 'none' }}>
                Book a session →
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {recent.map((b: any, i: number) => {
                const statusColors: Record<string, string> = {
                  CONFIRMED: '#4ade80', PENDING: '#C9A84C',
                  COMPLETED: '#1D9E75', CANCELLED: '#3f3f46', NO_SHOW: '#3f3f46',
                };
                const isActive = ['CONFIRMED','PENDING'].includes(b.status) && b.starts_at && new Date(b.starts_at).getTime() > Date.now();
                return (
                  <Link key={b.id} to={`/bookings/${b.id}`} style={{ textDecoration: 'none' }}
                    className="db-session-row"
                  >
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 16px', borderBottom: '1px solid #0f0f0f',
                      background: i === 0 && isActive ? '#0f0d08' : 'transparent',
                      borderLeft: i === 0 && isActive ? '2px solid #5A9BCB' : '2px solid transparent',
                      borderRadius: i === 0 ? '8px 8px 0 0' : undefined,
                      transition: 'background 0.12s',
                    }}>
                      {/* Date column */}
                      <div style={{ width: 44, flexShrink: 0, textAlign: 'right' }}>
                        <p style={{ fontSize: 11, color: '#5A9BCB', fontFamily: 'monospace' }}>{fmtDateShort(b.starts_at)}</p>
                        <p style={{ fontSize: 10, color: '#3a3a3a', fontFamily: 'monospace' }}>{fmtTime(b.starts_at)}</p>
                      </div>

                      {/* Status dot */}
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColors[b.status] ?? '#2a2a2a', flexShrink: 0 }} />

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, color: '#e4e4e7', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.service?.name ?? 'Studio session'}
                        </p>
                        <p style={{ fontSize: 11, color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.room?.name ?? 'No room'}{b.engineer ? ` · ${b.engineer.name}` : ''}
                        </p>
                      </div>

                      {/* Amount + status */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: 13, color: '#e4e4e7', fontFamily: 'monospace' }}>
                          ${Number(b.total_usd ?? 0).toFixed(2)}
                        </p>
                        <span style={{
                          fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.04em',
                          padding: '2px 8px', borderRadius: 4,
                          color: statusColors[b.status] ?? '#555',
                          border: `1px solid ${statusColors[b.status] ?? '#2a2a2a'}40`,
                          background: `${statusColors[b.status] ?? '#2a2a2a'}08`,
                        }}>
                          {isActive ? '● upcoming' : b.status?.toLowerCase()}
                        </span>
                      </div>

                      {/* Message thread badge */}
                      {(b._count?.messages ?? 0) > 0 && (
                        <div title="This session has a message thread" style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: 'rgba(90,155,203,0.15)', border: '1px solid rgba(90,155,203,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#5A9BCB" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Profile strength nudge */}
        {passport && (passport as any).profile_strength < 60 && (
          <div className="db-fade db-fade-3" style={{ background: '#0f0f0f', border: '1px solid #1e1e1e', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ fontSize: 13, color: '#e4e4e7', fontWeight: 500, marginBottom: 2 }}>Complete your creative profile</p>
              <p style={{ fontSize: 11, color: '#444' }}>
                {(passport as any).profile_strength}% strength — add bio, genres & vocal type to reach 100%
              </p>
            </div>
            <button onClick={() => setEditOpen(true)} style={{
              fontSize: 11, color: '#5A9BCB', border: '1px solid #5A9BCB30',
              background: '#5A9BCB0a', padding: '7px 14px', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              Complete profile →
            </button>
          </div>
        )}

      </main>

      <footer className="db-desktop-footer" style={{ textAlign: 'center', padding: '24px', fontSize: 10, color: '#1a1a1a', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
        OIANO STUDIOOS · DREAMZ MUSIC LAB
      </footer>

      <ProfileEditDrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initialData={{
          bio:           (artist as any)?.bio ?? '',
          alias:         artist?.alias ?? '',
          genres:        creativeDNA.genres ?? [],
          vocal_type:    creativeDNA.vocal_type ?? '',
          energy_profile: creativeDNA.energy_profile ?? '',
          key_themes:    creativeDNA.key_themes ?? [],
        }}
      />
    </div>
  );
}
