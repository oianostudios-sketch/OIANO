import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { SkeletonKPI, SkeletonRow, SkeletonArtistCard } from '../components/Skeleton';
import { fmtTime, fmtDate } from '../lib/fmt';

// ── Mini sparkline ────────────────────────────────────────────────────────────
function MiniSparkline({ values, color = '#C9A84C' }: { values: number[]; color?: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[2px] h-[20px] w-full mt-2">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm transition-all"
          style={{
            height: `${Math.max(10, (v / max) * 100)}%`,
            background: i === values.length - 1 ? color : `${color}55`,
          }}
        />
      ))}
    </div>
  );
}

// ── Engagement badge ──────────────────────────────────────────────────────────
function engagementLevel(lastDate: string | null): 'HOT' | 'WARM' | 'COLD' | null {
  if (!lastDate) return null;
  const days = Math.floor((Date.now() - new Date(lastDate).getTime()) / 86_400_000);
  if (days <= 7)  return 'HOT';
  if (days <= 21) return 'WARM';
  return 'COLD';
}
const ENGAGEMENT_STYLE = {
  HOT:  { label: 'HOT',  bg: '#1D9E7515', color: '#1D9E75', border: '#1D9E7530' },
  WARM: { label: 'WARM', bg: '#C9A84C15', color: '#C9A84C', border: '#C9A84C30' },
  COLD: { label: 'COLD', bg: '#D94A4A12', color: '#D94A4A', border: '#D94A4A25' },
};

// ── Booking funnel panel ──────────────────────────────────────────────────────
function BookingFunnel({ funnel }: { funnel: { pending: number; confirmed: number; completed: number; no_show: number; cancelled: number } }) {
  const total = funnel.pending + funnel.confirmed + funnel.completed + funnel.no_show + funnel.cancelled;
  const rows = [
    { label: 'Requested',  count: total,             color: '#3B8BFF' },
    { label: 'Confirmed',  count: funnel.confirmed + funnel.completed + funnel.no_show, color: '#9B6EFF' },
    { label: 'Completed',  count: funnel.completed,  color: '#1D9E75' },
    { label: 'No-show',    count: funnel.no_show,     color: '#D94A4A' },
  ];
  return (
    <div className="bg-studio-surface border border-studio-border rounded-xl px-5 py-4 animate-surface-4">
      <p className="label-mono mb-3">Booking funnel</p>
      <div className="space-y-2">
        {rows.map((r) => {
          const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
          return (
            <div key={r.label} className="flex items-center gap-3">
              <span className="text-zinc-500 text-[10px] font-mono w-20 flex-shrink-0">{r.label}</span>
              <div className="flex-1 h-1.5 bg-studio-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: r.color }}
                />
              </div>
              <span className="metric-number text-xs w-6 text-right" style={{ color: r.color }}>{r.count}</span>
            </div>
          );
        })}
      </div>
      <p className="text-zinc-700 text-[10px] font-mono mt-3">{total} total bookings all-time</p>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:     'bg-yellow-900/30 text-yellow-400',
  CONFIRMED:   'bg-green-900/30 text-green-400',
  IN_PROGRESS: 'bg-blue-900/30 text-blue-400',
  COMPLETED:   'bg-zinc-800 text-zinc-400',
  CANCELLED:   'bg-red-900/30 text-red-400',
  NO_SHOW:     'bg-red-900/20 text-red-600',
};

const BOOKING_TABS = ['All', 'Pending', 'Confirmed', 'Completed', 'Cancelled'] as const;
type BookingTab = typeof BOOKING_TABS[number];

const CREDIT_AMOUNTS = [50, 100, 200, 500];
const DURATION_PRESETS = [60, 120, 180, 240];

// Static lookup — never interpolate Tailwind class names dynamically (purge-safe)
const SURFACE_ANIMS = [
  'animate-surface-1',
  'animate-surface-2',
  'animate-surface-3',
  'animate-surface-4',
] as const;

function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export default function AdminDashboardPage() {
  const { logout } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const [bookingTab, setBookingTab] = useState<BookingTab>('All');
  const [creditTarget, setCreditTarget] = useState<{ id: string; name: string } | null>(null);
  const [creditAmount, setCreditAmount] = useState<number>(100);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // Walk-in state
  const [showAnnounce, setShowAnnounce] = useState(false);
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceBody, setAnnounceBody] = useState('');

  const [showWalkIn, setShowWalkIn] = useState(false);
  const [wiName, setWiName] = useState('');
  const [wiPhone, setWiPhone] = useState('');
  const [wiRoomId, setWiRoomId] = useState('');
  const [wiDate, setWiDate] = useState(todayStr());
  const [wiTime, setWiTime] = useState(nowTimeStr());
  const [wiDuration, setWiDuration] = useState(120);
  const [wiNotes, setWiNotes] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: analytics, isLoading: loadingAnalytics } = useQuery({
    queryKey: ['analytics'],
    queryFn: async () => (await api.get('/admin/analytics')).data,
    refetchInterval: 30_000,
  });

  const { data: allBookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ['all-bookings'],
    queryFn: async () => { const r = (await api.get('/bookings')).data; return Array.isArray(r) ? r : (r?.data ?? []); },
  });

  const { data: artists = [], isLoading: loadingArtists } = useQuery({
    queryKey: ['artists'],
    queryFn: async () => { const r = (await api.get('/artists')).data; return Array.isArray(r) ? r : (r?.data ?? []); },
  });

  const { data: creditRequests = [] } = useQuery({
    queryKey: ['credit-requests'],
    queryFn: async () => (await api.get('/admin/credit-requests')).data,
    refetchInterval: 60_000,
  });

  const { data: studio } = useQuery({
    queryKey: ['studio'],
    queryFn: async () => (await api.get('/studio')).data,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => {
      setPendingAction(id);
      return api.patch(`/bookings/${id}/status`, { status });
    },
    onSuccess: (_data, vars) => {
      setPendingAction(null);
      qc.invalidateQueries({ queryKey: ['all-bookings'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      const labels: Record<string, string> = {
        CONFIRMED: 'confirmed', COMPLETED: 'marked complete',
        CANCELLED: 'cancelled', NO_SHOW: 'marked no-show',
      };
      toast.success(`Booking ${labels[vars.status] ?? vars.status.toLowerCase()}`);
    },
    onError: () => { setPendingAction(null); toast.error('Failed to update status'); },
  });

  const mutate = useCallback((id: string, status: string) => {
    updateStatus.mutate({ id, status });
  }, [updateStatus]);

  const creditWallet = useMutation({
    mutationFn: ({ artist_id, amount_usd }: { artist_id: string; amount_usd: number }) =>
      api.post('/admin/wallet/credit', { artist_id, amount_usd }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['artists'] });
      toast.success(`$${vars.amount_usd} credited to ${creditTarget?.name}`);
      setCreditTarget(null);
    },
    onError: () => toast.error('Wallet credit failed'),
  });

  const walkIn = useMutation({
    mutationFn: () => {
      const starts_at = new Date(`${wiDate}T${wiTime}:00`).toISOString();
      return api.post('/admin/walkin', {
        name: wiName.trim(),
        phone: wiPhone.trim() || undefined,
        room_id: wiRoomId,
        starts_at,
        duration_minutes: wiDuration,
        notes: wiNotes.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-bookings'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      toast.success(`Walk-in booked for ${wiName}`);
      setShowWalkIn(false);
      setWiName(''); setWiPhone(''); setWiRoomId('');
      setWiDate(todayStr()); setWiTime(nowTimeStr());
      setWiDuration(120); setWiNotes('');
    },
    onError: () => toast.error('Walk-in booking failed'),
  });

  const broadcast = useMutation({
    mutationFn: () => api.post('/admin/announcements', { title: announceTitle, body: announceBody }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['studio-announcement'] });
      setAnnounceTitle('');
      setAnnounceBody('');
      setShowAnnounce(false);
    },
  });

  // ── Derived data ─────────────────────────────────────────────────────────────
  const pending  = (allBookings as any[]).filter((b) => b.status === 'PENDING');
  const today    = (analytics?.todays_bookings ?? []) as any[];
  const rooms    = (studio?.rooms ?? []) as any[];
  const tz       = studio?.timezone as string | undefined;

  // Last booking date per artist — derived from allBookings (no extra fetch)
  const lastBookingByArtist = (allBookings as any[]).reduce<Record<string, string>>((acc, b) => {
    if (!b.artist?.id || !b.starts_at) return acc;
    const prev = acc[b.artist.id];
    if (!prev || b.starts_at > prev) acc[b.artist.id] = b.starts_at;
    return acc;
  }, {});

  const filteredBookings = (allBookings as any[]).filter((b) => {
    if (bookingTab === 'All') return true;
    return b.status === bookingTab.toUpperCase();
  });

  // ── Helpers — tz-aware via studio.timezone ────────────────────────────────────
  const fmt = (iso: string) => fmtDate(iso, tz);
  const fmt2 = (iso: string) => fmtTime(iso, tz);

  const wiValid = wiName.trim().length > 0 && wiRoomId && wiDate && wiTime;

  // Sparkline + delta helpers
  const weekRevDays   = (analytics?.weekly_days ?? []) as { date: string; revenue_usd: number; booking_count: number }[];
  const sparkRevenue  = weekRevDays.map((d) => d.revenue_usd);
  const sparkSessions = weekRevDays.map((d) => d.booking_count);
  function pctDelta(curr: number, prev: number): string | null {
    if (!prev) return null;
    const d = Math.round(((curr - prev) / prev) * 100);
    return `${d >= 0 ? '+' : ''}${d}%`;
  }
  const revDelta = analytics ? pctDelta(analytics.week_revenue_usd ?? 0, analytics.prev_week_revenue_usd ?? 0) : null;
  const sesDelta = analytics ? pctDelta(analytics.week_sessions ?? 0, analytics.prev_week_sessions ?? 0) : null;

  const kpis = [
    { label: 'Artists',         value: analytics?.total_artists     ?? '—', spark: null,         delta: null },
    { label: 'Sessions',        value: analytics?.total_bookings    ?? '—', spark: sparkSessions, delta: sesDelta },
    { label: 'Revenue',         value: analytics ? `$${Number(analytics.total_revenue_usd).toFixed(0)}` : '—', spark: sparkRevenue, delta: revDelta },
    { label: 'Awaiting review', value: pending.length,                       spark: null,         delta: null },
  ];

  return (
    <div className="min-h-screen bg-studio-bg text-white">

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <header className="border-b border-studio-border px-6 py-3 flex items-center justify-between sticky top-0 bg-studio-bg/95 backdrop-blur-sm z-10">
        <div className="flex items-center gap-4">
          <span className="brand-wordmark text-base">OIANO</span>
          <span className="text-[10px] font-mono text-zinc-600 tracking-widest uppercase">
            Dreamz Music Lab · Admin
          </span>
        </div>
        <nav className="flex gap-5 items-center">
          {[
            { to: '/pulse',     label: 'Studio Pulse' },
            { to: '/calendar',  label: 'Calendar' },
            { to: '/runsheet',  label: 'Runsheet' },
            { to: '/book',      label: 'Book' },
            { to: '/dashboard', label: 'Artist view' },
          ].map(({ to, label }) => (
            <Link key={to} to={to} className="link-underline text-zinc-500 hover:text-white text-sm transition-colors">
              {label}
            </Link>
          ))}
          <button
            onClick={() => { logout(); navigate('/enter'); }}
            className="text-zinc-600 hover:text-zinc-400 text-sm transition-colors ml-2"
          >
            Sign out
          </button>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* ── KPI strip ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-px bg-studio-border rounded-xl overflow-hidden border border-studio-border">
          {loadingAnalytics
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-studio-surface p-6">
                  <SkeletonKPI />
                </div>
              ))
            : kpis.map((kpi, i) => {
                const isPendingCard = kpi.label === 'Awaiting review' && Number(kpi.value) > 0;
                return (
                <div
                  key={kpi.label}
                  className={`bg-studio-surface p-6 flex flex-col justify-between ${SURFACE_ANIMS[i] ?? 'animate-surface-4'}${isPendingCard ? ' kpi-pending-pulse' : ''}`}
                >
                  <div>
                    <p className="label-mono mb-3">{kpi.label}</p>
                    <div className="flex items-baseline gap-3">
                      <p className="metric-number animate-metric text-3xl text-white leading-none">{kpi.value}</p>
                      {kpi.delta && (
                        <span className={`text-[11px] font-mono ${kpi.delta.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
                          {kpi.delta} <span className="text-zinc-600">7d</span>
                        </span>
                      )}
                    </div>
                  </div>
                  {kpi.spark && kpi.spark.length > 0 && (
                    <MiniSparkline values={kpi.spark} color={kpi.label === 'Revenue' ? '#C9A84C' : '#3B8BFF'} />
                  )}
                </div>
                );
              })
          }
        </div>

        {/* ── Two-column: Today's schedule + Sidebar ─────────────────────────── */}
        <div className="grid grid-cols-3 gap-6">

          {/* Today's schedule — takes 2 cols */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="label-mono mb-1">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
                <h2 className="font-display animate-heading-1 text-xl text-white">Today's sessions</h2>
              </div>
              <div className="flex items-center gap-2">
                {today.filter((b: any) => b.status === 'PENDING').length > 0 && (
                  <button
                    onClick={() => {
                      today
                        .filter((b: any) => b.status === 'PENDING')
                        .forEach((b: any) => mutate(b.id, 'CONFIRMED'));
                    }}
                    className="flex items-center gap-1.5 bg-emerald-900/20 border border-emerald-800/50 text-emerald-400 text-xs px-3 py-2 rounded-lg hover:bg-emerald-900/30 transition-colors font-mono"
                  >
                    Confirm all
                    <span className="bg-emerald-900/40 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded-full">
                      {today.filter((b: any) => b.status === 'PENDING').length}
                    </span>
                  </button>
                )}
                <button
                  onClick={() => setShowWalkIn(true)}
                  className="flex items-center gap-2 bg-dome/10 border border-dome/30 text-dome text-xs px-4 py-2 rounded-lg hover:bg-dome/20 transition-colors font-medium"
                >
                  + Walk-in
                </button>
              </div>
            </div>

            {loadingAnalytics ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}</div>
            ) : today.length === 0 ? (
              <div className="bg-studio-surface border border-studio-border rounded-xl p-10 text-center">
                <p className="font-display text-zinc-600 italic text-base">Studio is clear.</p>
                <p className="text-zinc-700 text-xs mt-1 font-mono">No sessions on the books today</p>
              </div>
            ) : (
              <div className="space-y-2">
                {today.map((b: any, idx: number) => {
                  const isActing = pendingAction === b.id;
                  const animClass = SURFACE_ANIMS[Math.min(idx, 3)];
                  return (
                    <div
                      key={b.id}
                      className={`bg-studio-surface border border-studio-border rounded-xl px-5 py-4 flex items-center justify-between ${animClass}`}
                    >
                      {/* Time + artist */}
                      <div className="flex items-center gap-5">
                        <div className="text-center w-16 border-r border-studio-border pr-5">
                          <p className="metric-number text-dome text-sm">{fmt2(b.starts_at)}</p>
                          <p className="metric-number text-zinc-600 text-xs">{fmt2(b.ends_at)}</p>
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium">{b.artist?.name ?? 'Walk-in'}</p>
                          <p className="text-zinc-500 text-xs mt-0.5">
                            {b.room?.name ?? '—'}
                            {b.engineer?.name && (
                              <span className="text-zinc-600"> · {b.engineer.name}</span>
                            )}
                            {b.service?.name && (
                              <span className="text-zinc-700"> · {b.service.name}</span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${STATUS_COLORS[b.status] ?? 'text-zinc-500'}`}>
                          {b.status}
                        </span>
                        {isActing ? (
                          <span className="text-xs text-zinc-500 font-mono animate-pulse px-2">saving…</span>
                        ) : (
                          <>
                            {b.status === 'PENDING' && (
                              <button
                                onClick={() => mutate(b.id, 'CONFIRMED')}
                                className="text-xs bg-green-900/20 border border-green-800 text-green-400 px-3 py-1 rounded-lg hover:bg-green-900/40 transition-colors"
                              >Confirm</button>
                            )}
                            {b.status === 'CONFIRMED' && (
                              <>
                                <button onClick={() => mutate(b.id, 'COMPLETED')}
                                  className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-2.5 py-1 rounded-lg hover:bg-zinc-700 transition-colors">Complete</button>
                                <button onClick={() => mutate(b.id, 'NO_SHOW')}
                                  className="text-xs bg-orange-900/20 border border-orange-800 text-orange-400 px-2.5 py-1 rounded-lg hover:bg-orange-900/30 transition-colors">No show</button>
                                <button onClick={() => mutate(b.id, 'CANCELLED')}
                                  className="text-xs bg-red-900/20 border border-red-800 text-red-400 px-2.5 py-1 rounded-lg hover:bg-red-900/30 transition-colors">Cancel</button>
                              </>
                            )}
                          </>
                        )}
                        <Link to={`/bookings/${b.id}`} className="text-zinc-600 hover:text-dome text-xs transition-colors px-1.5 ml-1">→</Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar: funnel + credit requests + roster */}
          <div className="space-y-6">

            {/* Booking funnel */}
            {analytics?.funnel && <BookingFunnel funnel={analytics.funnel} />}

            {/* Credit requests (urgent — show if any) */}
            {(creditRequests as any[]).length > 0 && (
              <div className="animate-surface-1">
                <div className="flex items-center gap-2 mb-3">
                  <p className="label-mono">Credit requests</p>
                  <span className="text-[10px] bg-yellow-900/30 text-yellow-400 border border-yellow-900/30 px-1.5 py-0.5 rounded-full font-mono">
                    {(creditRequests as any[]).length}
                  </span>
                </div>
                <div className="space-y-2">
                  {(creditRequests as any[]).map((r: any) => (
                    <div key={r.id} className="bg-studio-surface border border-yellow-900/20 rounded-xl px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-white text-sm">{r.artist_name}</p>
                        <p className="text-zinc-600 text-[10px] font-mono mt-0.5">
                          {new Date(r.requested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <button
                        onClick={() => { setCreditTarget({ id: r.artist_id, name: r.artist_name }); setCreditAmount(100); }}
                        className="text-xs bg-dome/10 border border-dome/20 text-dome px-3 py-1.5 rounded-lg hover:bg-dome/20 transition-colors"
                      >+ Credit</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Announce to all artists */}
            <div className="animate-surface-1">
              <div className="flex items-center justify-between mb-3">
                <p className="label-mono">Studio broadcast</p>
                <button
                  onClick={() => setShowAnnounce(v => !v)}
                  className="text-[10px] border border-studio-border text-zinc-400 px-2 py-1 rounded-lg hover:text-white transition-colors"
                >
                  {showAnnounce ? 'Cancel' : '📢 Compose'}
                </button>
              </div>
              {showAnnounce && (
                <div className="space-y-2">
                  <input
                    value={announceTitle}
                    onChange={e => setAnnounceTitle(e.target.value)}
                    placeholder="Announcement title…"
                    className="w-full bg-zinc-900 border border-studio-border rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-dome/40"
                  />
                  <textarea
                    value={announceBody}
                    onChange={e => setAnnounceBody(e.target.value)}
                    placeholder="Message body (visible to all artists)…"
                    rows={3}
                    className="w-full bg-zinc-900 border border-studio-border rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-dome/40 resize-none"
                  />
                  <button
                    onClick={() => broadcast.mutate()}
                    disabled={!announceTitle.trim() || !announceBody.trim() || broadcast.isPending}
                    className="w-full bg-dome/10 border border-dome/20 text-dome py-2 rounded-lg text-sm font-semibold hover:bg-dome/20 transition-colors disabled:opacity-40"
                  >
                    {broadcast.isPending ? 'Broadcasting…' : 'Broadcast to all artists'}
                  </button>
                </div>
              )}
            </div>

            {/* Artist roster (compact) */}
            <div className="animate-surface-2">
              <p className="label-mono mb-3">
                Roster · {loadingArtists ? '…' : (artists as any[]).length} artists
              </p>
              {loadingArtists ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonArtistCard key={i} />)}</div>
              ) : (
                <div className="space-y-2">
                  {(artists as any[]).map((a) => {
                    const heat = engagementLevel(lastBookingByArtist[a.id] ?? null);
                    const hs   = heat ? ENGAGEMENT_STYLE[heat] : null;
                    return (
                      <div key={a.id} className="bg-studio-surface border border-studio-border rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Link
                                to={`/artists/${a.id}`}
                                className="text-white text-sm font-medium hover:text-dome transition-colors truncate"
                              >
                                {a.name}
                              </Link>
                              {hs && (
                                <span
                                  className="text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                                  style={{ background: hs.bg, color: hs.color, border: `0.5px solid ${hs.border}` }}
                                >{hs.label}</span>
                              )}
                            </div>
                            <p className="text-zinc-600 text-[10px] font-mono mt-0.5">
                              {a.passport?.passport_code ?? '—'}
                              <span className="text-zinc-700 mx-1">·</span>
                              <span className="text-dome/70">{a.passport?.profile_strength ?? 0}%</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            <span className="metric-number text-xs text-zinc-400">
                              ${Number(a.wallet?.balance_usd ?? 0).toFixed(0)}
                            </span>
                            <button
                              onClick={() => { setCreditTarget({ id: a.id, name: a.name }); setCreditAmount(100); }}
                              className="text-[10px] bg-dome/10 border border-dome/20 text-dome px-2 py-0.5 rounded hover:bg-dome/20 transition-colors"
                            >+$</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── All bookings (tabbed, full width) ──────────────────────────────── */}
        <div className="animate-surface-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl text-white animate-heading-2">All bookings</h2>
            <span className="text-zinc-600 text-xs font-mono">{filteredBookings.length} shown</span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-studio-border mb-4">
            {BOOKING_TABS.map((tab) => {
              const count = tab === 'All'
                ? allBookings.length
                : (allBookings as any[]).filter((b) => b.status === tab.toUpperCase()).length;
              return (
                <button
                  key={tab}
                  onClick={() => setBookingTab(tab)}
                  className={`px-4 py-2 text-xs transition-colors flex items-center gap-1.5 ${
                    bookingTab === tab
                      ? 'text-dome border-b-2 border-dome -mb-px'
                      : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  {tab}
                  {count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                      bookingTab === tab ? 'bg-dome/20 text-dome' : 'bg-studio-muted text-zinc-600'
                    }`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {loadingBookings ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}</div>
          ) : filteredBookings.length === 0 ? (
            <div className="bg-studio-surface border border-studio-border rounded-xl p-8 text-center">
              <p className="font-display text-zinc-600 italic">Nothing here.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredBookings.map((b: any) => (
                <div
                  key={b.id}
                  className="bg-studio-surface border border-studio-border rounded-xl px-5 py-3 flex items-center gap-4 hover:border-zinc-700 transition-colors"
                >
                  <div className="w-32 flex-shrink-0">
                    <p className="text-zinc-400 text-xs">{fmt(b.starts_at)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{b.artist?.name ?? '—'}</p>
                    <p className="text-zinc-500 text-xs truncate">
                      {b.service?.name ?? 'Session'} · {b.room?.name ?? 'No room'}
                    </p>
                  </div>
                  <div className="w-16 text-right flex-shrink-0">
                    <p className="metric-number text-zinc-300 text-sm">${Number(b.total_usd ?? 0).toFixed(0)}</p>
                  </div>
                  <div className="w-24 flex-shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${STATUS_COLORS[b.status] ?? 'text-zinc-500'}`}>
                      {b.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {pendingAction === b.id ? (
                      <span className="text-xs text-zinc-500 font-mono animate-pulse px-2">saving…</span>
                    ) : (
                      <>
                        {b.status === 'PENDING' && (
                          <>
                            <button onClick={() => mutate(b.id, 'CONFIRMED')}
                              className="text-xs bg-green-900/20 border border-green-800 text-green-400 px-2.5 py-1 rounded-lg hover:bg-green-900/40 transition-colors">Confirm</button>
                            <button onClick={() => mutate(b.id, 'CANCELLED')}
                              className="text-xs bg-red-900/20 border border-red-800 text-red-400 px-2.5 py-1 rounded-lg hover:bg-red-900/30 transition-colors">Cancel</button>
                          </>
                        )}
                        {b.status === 'CONFIRMED' && (
                          <>
                            <button onClick={() => mutate(b.id, 'COMPLETED')}
                              className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-2.5 py-1 rounded-lg hover:bg-zinc-700 transition-colors">Complete</button>
                            <button onClick={() => mutate(b.id, 'NO_SHOW')}
                              className="text-xs bg-orange-900/20 border border-orange-800 text-orange-400 px-2.5 py-1 rounded-lg hover:bg-orange-900/30 transition-colors">No show</button>
                            <button onClick={() => mutate(b.id, 'CANCELLED')}
                              className="text-xs bg-red-900/20 border border-red-800 text-red-400 px-2.5 py-1 rounded-lg hover:bg-red-900/30 transition-colors">Cancel</button>
                          </>
                        )}
                      </>
                    )}
                    <Link to={`/bookings/${b.id}`}
                      className="text-zinc-600 hover:text-dome text-xs transition-colors px-1.5 ml-1">→</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>

      <footer className="text-center py-6">
        <span className="brand-wordmark text-xs opacity-30" style={{ animationDelay: '0.5s' }}>OIANO</span>
      </footer>

      {/* ── Walk-in modal ──────────────────────────────────────────────────────── */}
      {showWalkIn && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={(e) => e.target === e.currentTarget && setShowWalkIn(false)}
        >
          <div className="bg-studio-surface border border-studio-border rounded-xl p-6 w-full max-w-md space-y-5 animate-surface">
            <div>
              <p className="label-mono mb-1">Instant booking</p>
              <h3 className="font-display text-lg text-white animate-heading">Walk-in</h3>
            </div>

            <div>
              <label className="text-zinc-500 text-xs mb-1.5 block">Name *</label>
              <input
                  type="text"
                placeholder="Artist or client name"
                value={wiName}
                onChange={(e) => setWiName(e.target.value)}
                className="w-full bg-studio-muted border border-studio-border text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-dome transition-colors"
              />
            </div>

            <div>
              <label className="text-zinc-500 text-xs mb-1.5 block">Phone (optional)</label>
              <input
                type="tel"
                placeholder="+1 555 000 0000"
                value={wiPhone}
                onChange={(e) => setWiPhone(e.target.value)}
                className="w-full bg-studio-muted border border-studio-border text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-dome transition-colors"
              />
            </div>

            <div>
              <label className="text-zinc-500 text-xs mb-1.5 block">Room *</label>
              <select
                value={wiRoomId}
                onChange={(e) => setWiRoomId(e.target.value)}
                className="w-full bg-studio-muted border border-studio-border text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-dome transition-colors"
              >
                <option value="">Select a room</option>
                {rooms.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-500 text-xs mb-1.5 block">Date *</label>
                <input
                  type="date"
                  value={wiDate}
                  onChange={(e) => setWiDate(e.target.value)}
                  className="w-full bg-studio-muted border border-studio-border text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-dome transition-colors"
                />
              </div>
              <div>
                <label className="text-zinc-500 text-xs mb-1.5 block">Start time *</label>
                <input
                  type="time"
                  value={wiTime}
                  onChange={(e) => setWiTime(e.target.value)}
                  className="w-full bg-studio-muted border border-studio-border text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-dome transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-zinc-500 text-xs mb-1.5 block">Duration</label>
              <div className="grid grid-cols-4 gap-2">
                {DURATION_PRESETS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setWiDuration(d)}
                    className={`py-2 text-sm rounded-lg border transition-colors ${
                      wiDuration === d
                        ? 'border-dome bg-dome/10 text-dome'
                        : 'border-studio-border bg-studio-muted text-zinc-400 hover:border-zinc-600'
                    }`}
                  >{d / 60}h</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-zinc-500 text-xs mb-1.5 block">Notes (optional)</label>
              <input
                type="text"
                placeholder="e.g. bring own headphones"
                value={wiNotes}
                onChange={(e) => setWiNotes(e.target.value)}
                className="w-full bg-studio-muted border border-studio-border text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-dome transition-colors"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowWalkIn(false)}
                className="flex-1 border border-studio-border text-zinc-400 py-2.5 rounded-lg text-sm hover:text-white transition-colors"
              >Cancel</button>
              <button
                onClick={() => walkIn.mutate()}
                disabled={!wiValid || walkIn.isPending}
                className="flex-1 bg-dome text-black font-semibold py-2.5 rounded-lg text-sm hover:bg-dome-light transition-colors disabled:opacity-40"
              >{walkIn.isPending ? 'Booking…' : 'Book walk-in'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Wallet credit modal ────────────────────────────────────────────────── */}
      {creditTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={(e) => e.target === e.currentTarget && setCreditTarget(null)}
        >
          <div className="bg-studio-surface border border-studio-border rounded-xl p-6 w-full max-w-sm space-y-5 animate-surface">
            <div>
              <p className="label-mono mb-1">Credit wallet</p>
              <h3 className="font-display text-lg text-white animate-heading">{creditTarget.name}</h3>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {CREDIT_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setCreditAmount(amt)}
                  className={`py-2 text-sm rounded-lg border transition-colors ${
                    creditAmount === amt
                      ? 'border-dome bg-dome/10 text-dome'
                      : 'border-studio-border bg-studio-muted text-zinc-400 hover:border-zinc-600'
                  }`}
                >${amt}</button>
              ))}
            </div>

            <div>
              <label className="text-zinc-500 text-xs mb-1 block">Custom amount ($)</label>
              <input
                type="number"
                min={1}
                max={10000}
                value={creditAmount}
                onChange={(e) => setCreditAmount(Number(e.target.value))}
                className="w-full bg-studio-muted border border-studio-border text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-dome transition-colors"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setCreditTarget(null)}
                className="flex-1 border border-studio-border text-zinc-400 py-2.5 rounded-lg text-sm hover:text-white transition-colors"
              >Cancel</button>
              <button
                onClick={() => creditWallet.mutate({ artist_id: creditTarget.id, amount_usd: creditAmount })}
                disabled={creditWallet.isPending || !creditAmount}
                className="flex-1 bg-dome text-black font-semibold py-2.5 rounded-lg text-sm disabled:opacity-50 hover:bg-dome-light transition-colors"
              >
                {creditWallet.isPending ? 'Crediting…' : `Credit $${creditAmount}`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
