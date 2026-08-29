import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { api } from '../lib/api';
import ProfileEditDrawer from '../components/ProfileEditDrawer';
import NotificationBell from '../components/NotificationBell';
import { useToast } from '../components/Toast';
import { useStudioState } from '../context/StudioState';
import SessionStats from '../components/SessionStats';
import OianoBrand from '../components/OianoBrand';
import ArtistStatusToggle from '../components/ArtistStatusToggle';
import { fmtTime as _fmtTime, fmtDateShort as _fmtDateShort } from '../lib/fmt';
import { CalendarDays, Compass, Mic2, Pencil } from 'lucide-react';
import ArtistAvatar from '../components/ArtistAvatar';
import { STATUS_HEX } from '../lib/bookingStatus';

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

export function SessionCountdown({ session }: { session: any }) {
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

// ── Main DashboardPage ────────────────────────────────────────────────────────

function StudioBar() {
  const { isLive, activeSession, todaySessions } = useStudioState();
  const navigate = useNavigate();
  const [messageIndex, setMessageIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const { data: tickerNotifications = [] } = useQuery<any[]>({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get('/notifications')).data,
    staleTime: 30_000,
  });
  const next = !isLive ? todaySessions.filter(s => s.starts_at && new Date(s.starts_at).getTime() > Date.now()).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0] : null;
  const studioMessage = isLive
    ? { label: `Studio live · ${(activeSession as any)?.artist?.name ?? 'Session in progress'}`, color: '#E8823A', href: (activeSession as any)?.id ? `/bookings/${(activeSession as any).id}` : '/calendar' }
    : next
      ? { label: `Next session ${minsUntil(next.starts_at)} · ${fmtTime(next.starts_at)}`, color: '#6aa9d2', href: (next as any).id ? `/bookings/${(next as any).id}` : '/calendar' }
      : { label: 'Studio ready', color: '#4fa98a', href: '/calendar' };
  const messages = [studioMessage, ...tickerNotifications.filter((notification: any) => !notification.read_at).slice(0, 4).map((notification: any) => ({ label: notification.title, color: '#d3b35c', href: notification.payload?.booking_id ? `/bookings/${notification.payload.booking_id}` : '/communications?view=priority' }))];
  const current = messages[messageIndex % messages.length] ?? studioMessage;

  useEffect(() => {
    if (paused || messages.length < 2) return;
    const timer = window.setInterval(() => setMessageIndex((value) => (value + 1) % messages.length), 5_000);
    return () => window.clearInterval(timer);
  }, [paused, messages.length]);
  useEffect(() => { setMessageIndex((value) => value % messages.length); }, [messages.length]);

  return <button type="button" onClick={() => navigate(current.href)} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} aria-label={`${current.label}${messages.length > 1 ? `. Message ${(messageIndex % messages.length) + 1} of ${messages.length}` : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 210, maxWidth: 320, padding: '8px 14px', borderRadius: 8, background: isLive ? '#120d08' : '#0f0f0f', border: `1px solid ${isLive ? '#5A9BCB22' : '#1a1a1a'}`, color: current.color, fontSize: 11, fontFamily: 'monospace', cursor: 'pointer', textAlign: 'left' }}>
    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: current.color, boxShadow: `0 0 6px ${current.color}`, animation: isLive ? 'db-pulse 1s ease-in-out infinite' : 'none' }} />
    <span key={`${messageIndex}-${current.label}`} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', animation: 'db-ticker-in .35s ease both' }}>{current.label}</span>
    {messages.length > 1 && <span aria-hidden="true" style={{ marginLeft: 'auto', color: '#3d4347', fontSize: 8, whiteSpace: 'nowrap' }}>{(messageIndex % messages.length) + 1}/{messages.length}</span>}
  </button>;
}

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

  useEffect(() => {
    document.body.classList.add('artist-dashboard');
    return () => document.body.classList.remove('artist-dashboard');
  }, []);

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

  const { data: bookings = [], isLoading: loadingBookings, isError: bookingsError, refetch: refetchBookings } = useQuery({
    queryKey: ['bookings'],
    queryFn: async () => (await api.get('/bookings')).data,
  });

  const { data: portfolioData } = useQuery({
    queryKey: ['passport', 'portfolio'],
    queryFn: async () => (await api.get('/passport/portfolio')).data,
    enabled: user?.role === 'ARTIST',
  });

  const { data: careerActivity = [], isLoading: loadingActivity } = useQuery<any[]>({
    queryKey: ['artist-activity'],
    queryFn: async () => (await api.get('/artist-activity')).data,
    enabled: user?.role === 'ARTIST',
  });

  const { data: studio } = useQuery({
    queryKey: ['studio'],
    queryFn: async () => (await api.get('/studio/current')).data,
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

  // Prefer the live artist record returned with the Passport portfolio. The
  // persisted login snapshot can be stale after profile or avatar changes.
  const artist   = portfolioData?.artist ?? user?.artist;
  const passport = artist?.passport;
  const balance  = Number(artist?.wallet?.balance_usd ?? 0);

  const profileScore = portfolioData?.score ?? (passport as any)?.profile_strength ?? 0;
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
  const activeProjects = (portfolioData?.project_options ?? [])
    .filter((project: any) => project.is_active && project.phase !== 'DELIVERED');
  const nextProject = activeProjects[0] ?? null;
  const primaryAction = nextSession
    ? { to: `/bookings/${nextSession.id}`, eyebrow: 'Your next move', label: 'Prepare for your session', detail: `${fmtDateShort(nextSession.starts_at)} at ${fmtTime(nextSession.starts_at)}`, cta: 'Prepare for session' }
    : activeProjects.length > 0
      ? { to: '/projects', eyebrow: 'Keep the momentum', label: 'Review your active work', detail: `${activeProjects.length} project${activeProjects.length === 1 ? '' : 's'} currently moving`, cta: 'Review project' }
      : { to: '/book', eyebrow: 'Your next move', label: 'Start your next studio session', detail: 'Choose the room, people, and time for your next record', cta: 'Explore studio dates' };

  // Animated stats
  const cSessions  = useCounter(allBookings.length);
  const cHours     = useCounter(Math.round(totalHours(completed)));
  const cCompleted = useCounter(completed.length);

  const creativeDNA  = (passport as any)?.creative_dna ?? {};
  const genres       = creativeDNA.genres ?? [];
  const vocalType    = creativeDNA.vocal_type ?? null;
  const energyProfile = creativeDNA.energy_profile ?? null;
  const themes       = creativeDNA.key_themes ?? [];

  function handleLogout() { logout(); navigate('/enter'); }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#f5f5f5' }}>
      <style>{`
        body.artist-dashboard { padding-top: 0; }
        @keyframes db-pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
        @keyframes db-fade-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes db-ticker-in { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        .db-fade { animation: db-fade-in 0.4s ease both; }
        .db-fade-1 { animation-delay: 0.05s; }
        .db-fade-2 { animation-delay: 0.12s; }
        .db-fade-3 { animation-delay: 0.2s; }
        .db-fade-4 { animation-delay: 0.28s; }
        .db-session-row:hover { background: #141414 !important; }
        .db-primary-action:hover { background: #74add4 !important; color: #000 !important; }
        .db-focus-card:hover { border-color: rgba(106,169,210,.34) !important; transform: translateY(-2px); }
        .db-signal-card:hover { border-color: rgba(255,255,255,.13) !important; transform: translateY(-1px); }
        .db-action-tile:hover { color: #f3f1eb !important; background: rgba(106,169,210,.08) !important; border-color: rgba(106,169,210,.2) !important; }
        .db-legacy-session-history, .db-legacy-profile-nudge { display: none !important; }
        .db-two-col { grid-template-columns: 1fr !important; }
        .db-col-left { min-height: 0; }
        .db-insights summary::-webkit-details-marker { display: none; }
        .db-mobile-status { display: none; }
        .db-header { display: flex; }
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
          .db-mobile-status { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
          .db-briefing { grid-template-columns: 1fr 1fr !important; }
          .db-focus-card { grid-column: 1 / -1; min-height: 210px !important; }
          .db-action-dock { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 520px) {
          .db-briefing { grid-template-columns: 1fr !important; }
          .db-focus-card { grid-column: auto; }
          .db-hero-stats { width: 100%; justify-content: space-between; }
          .db-action-dock { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      {/* Nav */}
      <header className="db-header" style={{ borderBottom: '1px solid #141414', padding: '14px 24px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <OianoBrand variant="compact" size={20} />
          <span style={{ color: '#2a2a2a', fontSize: 11, fontFamily: 'monospace' }}>StudioOS</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <StudioBar />
          <ArtistStatusToggle inline />
          <NotificationBell />
          <button type="button" onClick={handleLogout} style={{ fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
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

      {bookingsError && (
        <div role="alert" style={{ maxWidth: 1100, margin: '16px auto 0', padding: '12px 16px', background: '#1a0d0d', border: '1px solid #5f2828', borderRadius: 10, color: '#fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 13 }}>We couldn't load your sessions. Your profile and wallet are still available.</span>
          <button type="button" onClick={() => refetchBookings()} style={{ color: '#fff', background: '#7f1d1d', border: 'none', borderRadius: 6, padding: '7px 12px', cursor: 'pointer' }}>Try again</button>
        </div>
      )}

      <main className="db-main" style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 28, paddingBottom: 'calc(32px + 68px)' }}>
        <div className="db-mobile-status">
          <StudioBar />
          <ArtistStatusToggle inline />
        </div>

        {/* ── Welcome hero ── */}
        <div className="db-fade db-hero" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <ArtistAvatar src={(artist as any)?.avatar_url} name={artist?.alias ?? artist?.name ?? 'Artist'} size={58} shape="portrait" />
            <div>
            <p style={{ fontSize: 10, color: '#6a6a6a', fontFamily: 'monospace', letterSpacing: '0.14em', marginBottom: 9, textTransform: 'uppercase' }}>
              {fmtDate()}
            </p>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 38, color: '#f2f0eb', fontWeight: 500, lineHeight: 1.08, letterSpacing: '-0.025em' }}>
              {greeting()}, <span style={{ color: '#6aa9d2' }}>{artist?.alias ?? artist?.name ?? user?.email?.split('@')[0]}</span>
            </h1>
            {(passport as any)?.bio && (
              <p style={{ marginTop: 10, fontSize: 13, color: '#999', maxWidth: 480, lineHeight: 1.6 }}>
                {(passport as any).bio.slice(0, 120)}{(passport as any).bio.length > 120 ? '…' : ''}
              </p>
            )}
            </div>
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
                <p style={{ fontSize: 11, color: '#777', fontFamily: 'monospace', marginTop: 3 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Two-column grid ── */}
        <section className="db-fade db-fade-1" aria-labelledby="today-heading">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <p id="today-heading" style={{ fontSize: 10, color: '#777', fontFamily: 'monospace', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Today at OIANO</p>
            <span style={{ fontSize: 10, color: '#3f454a', fontFamily: 'monospace' }}>{studio?.name ?? 'OIANO Network'}</span>
          </div>
          <div className="db-briefing" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1.65fr) repeat(4, minmax(0, 1fr))', gap: 12 }}>
            <Link className="db-focus-card" to={primaryAction.to} style={{ minHeight: 180, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 22, borderRadius: 16, textDecoration: 'none', background: '#0a0f13', border: '1px solid rgba(106,169,210,.2)', boxShadow: '0 24px 70px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.04)' }}>
              <img src="/images/mock/oiano-studio-editorial-v1.png" alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '62% center', opacity: .78 }} />
              <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(5,8,11,.98) 0%, rgba(5,9,12,.9) 43%, rgba(5,9,12,.25) 100%), linear-gradient(0deg, rgba(4,7,9,.65), transparent 70%)' }} />
              <div style={{ position: 'relative' }}>
                <p style={{ margin: 0, fontSize: 9, color: '#83b8d8', fontFamily: 'monospace', letterSpacing: '0.16em', textTransform: 'uppercase' }}>{primaryAction.eyebrow}</p>
                <h2 style={{ margin: '12px 0 7px', maxWidth: 340, color: '#f4f2ed', fontFamily: "'Playfair Display', serif", fontSize: 25, lineHeight: 1.15, fontWeight: 500 }}>{primaryAction.label}</h2>
                <p style={{ margin: 0, color: '#7f8990', fontSize: 11 }}>{primaryAction.detail}</p>
              </div>
              <span style={{ position: 'relative', alignSelf: 'flex-start', color: '#0a0d0f', background: '#6aa9d2', padding: '8px 13px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>{primaryAction.cta} →</span>
            </Link>

            <Link className="db-signal-card" to={nextSession ? `/bookings/${nextSession.id}` : '/book'} style={{ minHeight: 180, display: 'flex', flexDirection: 'column', padding: 17, borderRadius: 16, textDecoration: 'none', background: 'linear-gradient(145deg, rgba(18,21,24,.94), rgba(10,12,14,.92))', border: '1px solid rgba(255,255,255,.075)' }}>
              <span style={{ fontSize: 9, color: '#596168', fontFamily: 'monospace', letterSpacing: '0.12em' }}>NEXT SESSION</span>
              <strong style={{ marginTop: 'auto', color: nextSession ? '#f1efe9' : '#8a8a86', fontFamily: "'Playfair Display', serif", fontWeight: 500, fontSize: 21 }}>{nextSession ? fmtDateShort(nextSession.starts_at) : 'Not booked'}</strong>
              <span style={{ marginTop: 5, color: '#6aa9d2', fontFamily: 'monospace', fontSize: 10 }}>{nextSession ? `${fmtTime(nextSession.starts_at)} · ${nextSession.room?.name ?? 'Room TBA'}` : 'Find a studio time →'}</span>
            </Link>

            <Link className="db-signal-card" to="/projects" style={{ minHeight: 180, display: 'flex', flexDirection: 'column', padding: 17, borderRadius: 16, textDecoration: 'none', background: 'linear-gradient(145deg, rgba(18,21,24,.94), rgba(10,12,14,.92))', border: '1px solid rgba(255,255,255,.075)' }}>
              <span style={{ fontSize: 9, color: '#596168', fontFamily: 'monospace', letterSpacing: '0.12em' }}>ACTIVE WORK</span>
              <strong style={{ marginTop: 'auto', color: '#d3b35c', fontFamily: "'Playfair Display', serif", fontWeight: 500, fontSize: 25 }}>{activeProjects.length}</strong>
              <span style={{ marginTop: 4, color: '#7d7a72', fontSize: 10, lineHeight: 1.4 }}>{nextProject?.title ?? 'Start building your catalogue'}</span>
            </Link>

            <Link className="db-signal-card" to="/artist/passport" style={{ minHeight: 180, display: 'flex', flexDirection: 'column', padding: 17, borderRadius: 16, textDecoration: 'none', background: 'linear-gradient(145deg, rgba(18,21,24,.94), rgba(10,12,14,.92))', border: '1px solid rgba(255,255,255,.075)' }}>
              <span style={{ fontSize: 9, color: '#596168', fontFamily: 'monospace', letterSpacing: '0.12em' }}>PASSPORT</span>
              <strong style={{ marginTop: 'auto', color: profileScore >= 80 ? '#7dc99a' : '#d3b35c', fontFamily: "'Playfair Display', serif", fontWeight: 500, fontSize: 25 }}>{profileScore}%</strong>
              <span style={{ marginTop: 4, color: '#7d7a72', fontSize: 10 }}>{profileScore < 100 ? 'Strength · keep building →' : 'Portfolio complete'}</span>
            </Link>

            <button className="db-signal-card" type="button" onClick={() => setTopUpOpen(true)} style={{ minHeight: 180, display: 'flex', flexDirection: 'column', textAlign: 'left', padding: 17, borderRadius: 16, cursor: 'pointer', background: 'linear-gradient(145deg, rgba(18,21,24,.94), rgba(10,12,14,.92))', border: '1px solid rgba(255,255,255,.075)' }}>
              <span style={{ fontSize: 9, color: '#596168', fontFamily: 'monospace', letterSpacing: '0.12em' }}>STUDIO CREDIT</span>
              <strong style={{ marginTop: 'auto', color: '#f1efe9', fontFamily: "'Playfair Display', serif", fontWeight: 500, fontSize: 23 }}>${balance.toFixed(2)}</strong>
              <span style={{ marginTop: 4, color: '#6aa9d2', fontSize: 10 }}>{balance > 0 ? 'Ready to invest in studio time' : 'Add credits →'}</span>
            </button>
          </div>
        </section>

        <nav className="db-action-dock db-fade db-fade-1" aria-label="Artist shortcuts" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: 8, borderRadius: 16, background: 'rgba(14,17,19,.72)', border: '1px solid rgba(255,255,255,.07)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.025)' }}>
          {[
            { label: 'Book studio', to: '/book', Icon: Mic2 },
            { label: 'My schedule', to: '/calendar', Icon: CalendarDays },
            { label: 'Producers', to: '/producers', Icon: Compass },
          ].map(({ label, to, Icon }) => (
            <Link key={label} className="db-action-tile" to={to} style={{ minHeight: 66, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7, color: '#898d90', textDecoration: 'none', border: '1px solid transparent', borderRadius: 11, fontSize: 10 }}>
              <Icon size={18} strokeWidth={1.65} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
          <button className="db-action-tile" type="button" onClick={() => setEditOpen(true)} style={{ minHeight: 66, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7, color: '#898d90', background: 'transparent', border: '1px solid transparent', borderRadius: 11, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Pencil size={18} strokeWidth={1.65} aria-hidden="true" />
            <span>Edit profile</span>
          </button>
        </nav>

        <div className="db-fade db-fade-1 db-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* LEFT: Account actions */}
          <div className="db-col-left" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Top-up modal */}
            {topUpOpen && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                onClick={() => setTopUpOpen(false)}>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380 }}
                  onClick={e => e.stopPropagation()}>
                  <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: '#fff', margin: '0 0 4px' }}>Add Studio Credit</p>
                  <p style={{ fontSize: 12, color: '#555', margin: '0 0 20px' }}>Use Studio Credit to request sessions. Minimum $10.</p>
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

          </div>
        </div>

        {/* ── E: Session stats ── */}
        <details className="db-insights db-fade db-fade-2" style={{ border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, background: 'rgba(14,17,19,.6)', overflow: 'hidden' }}>
          <summary style={{ listStyle: 'none', cursor: 'pointer', padding: '15px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#92979a', fontSize: 11 }}>
            <span>Studio insights</span><span style={{ color: '#596168', fontFamily: 'monospace' }}>SESSION ANALYTICS +</span>
          </summary>
          <div style={{ padding: '0 14px 14px' }}><SessionStats /></div>
        </details>

        <div className="db-fade db-fade-2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '15px 18px', borderRadius: 14, background: 'linear-gradient(100deg, rgba(211,179,92,.055), rgba(106,169,210,.055))', border: '1px solid rgba(255,255,255,.07)' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, color: '#d7d4ce', fontSize: 12, fontWeight: 600 }}>Discover collaborators</p>
            <p style={{ margin: '3px 0 0', color: '#62676a', fontSize: 10 }}>Find artists by creative DNA or preview producer catalogues.</p>
          </div>
          <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
            <Link to="/discover" style={{ color: '#d3b35c', border: '1px solid rgba(211,179,92,.22)', padding: '7px 11px', borderRadius: 8, textDecoration: 'none', fontSize: 10 }}>Artists</Link>
            <Link to="/producers" style={{ color: '#6aa9d2', border: '1px solid rgba(106,169,210,.22)', padding: '7px 11px', borderRadius: 8, textDecoration: 'none', fontSize: 10 }}>Producers</Link>
          </div>
        </div>

        {/* The home answers what matters now. Historical proof remains one
            deliberate disclosure away instead of competing with today's work. */}
        <details className="db-fade db-fade-2" style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.07)', background: 'rgba(12,15,17,.55)', padding: '0 16px 16px' }}>
          <summary style={{ cursor: 'pointer', padding: '15px 0', color: '#8a8f92', fontSize: 10, fontFamily: 'monospace', letterSpacing: '.14em' }}>VIEW FULL CREATIVE RECORD</summary>
        <section aria-labelledby="career-activity-heading">
          <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 14, marginBottom: 12 }}>
            <div><p id="career-activity-heading" style={{ margin: 0, fontSize: 10, color: '#8a8f92', fontFamily: 'monospace', letterSpacing: '.14em' }}>CAREER ACTIVITY</p><p style={{ margin: '4px 0 0', fontSize: 11, color: '#50565a' }}>The work, proof, and connections building your artist story.</p></div>
            <Link to="/artist/passport" style={{ fontSize: 10, color: '#d3b35c', textDecoration: 'none' }}>Open professional identity →</Link>
          </div>
          <div style={{ overflow: 'hidden', borderRadius: 14, border: '1px solid rgba(255,255,255,.07)', background: 'rgba(12,15,17,.7)' }}>
            {loadingActivity ? <p style={{ padding: 18, margin: 0, fontSize: 10, color: '#555b5f', fontFamily: 'monospace' }}>BUILDING YOUR TIMELINE…</p> : careerActivity.length ? careerActivity.slice(0, 6).map((item: any, index: number) => {
              const colors: Record<string, string> = { blue: '#6aa9d2', gold: '#d3b35c', green: '#4fa98a', violet: '#9878c7' };
              const color = colors[item.tone] ?? '#7d8589';
              return <Link key={item.id} to={item.href} style={{ display: 'grid', gridTemplateColumns: '10px minmax(0,1fr) auto', alignItems: 'center', gap: 13, padding: '13px 16px', borderBottom: index < Math.min(careerActivity.length, 6) - 1 ? '1px solid rgba(255,255,255,.05)' : 'none', textDecoration: 'none' }}>
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 12px ${color}55` }} />
                <span style={{ minWidth: 0 }}><strong style={{ display: 'block', color: '#d9d7d1', fontSize: 12, fontWeight: 600 }}>{item.title}</strong><span style={{ display: 'block', marginTop: 2, color: '#5e6468', fontSize: 10, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.detail}</span></span>
                <time style={{ color: '#4d5357', fontSize: 9, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{new Date(item.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</time>
              </Link>;
            }) : <div style={{ padding: '26px 18px', textAlign: 'center' }}><p style={{ margin: 0, color: '#777d80', fontSize: 12 }}>Your career timeline starts with real activity.</p><Link to="/book" style={{ display: 'inline-block', marginTop: 8, color: '#6aa9d2', fontSize: 10, textDecoration: 'none' }}>Plan your first studio session →</Link></div>}
          </div>
        </section>
        </details>

        <div className="db-legacy-session-history db-fade db-fade-2">
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
                const statusColors = STATUS_HEX as Record<string, string>;
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
        {passport && profileScore < 60 && (
          <div className="db-legacy-profile-nudge db-fade db-fade-3" style={{ background: '#0f0f0f', border: '1px solid #1e1e1e', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ fontSize: 13, color: '#e4e4e7', fontWeight: 500, marginBottom: 2 }}>Complete your creative profile</p>
              <p style={{ fontSize: 11, color: '#444' }}>
                {profileScore}% Passport score — complete your portfolio to increase it
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
        OIANO · DISCOVER · CONNECT · CREATE
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
          profile_strength: profileScore,
        }}
      />
    </div>
  );
}
