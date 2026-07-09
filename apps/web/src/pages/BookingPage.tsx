import { useState, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { useToast } from '../components/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = 'engineer' | 'service' | 'room' | 'datetime' | 'confirm';
const STEPS: Step[] = ['engineer', 'service', 'room', 'datetime', 'confirm'];
const STEP_LABELS: Record<Step, string> = {
  engineer: 'Engineer',
  service:  'Service',
  room:     'Room',
  datetime: 'When',
  confirm:  'Confirm',
};

// ─── Time helpers ─────────────────────────────────────────────────────────────
function buildSlots() {
  const slots: string[] = [];
  for (let h = 8; h <= 23; h++) slots.push(`${String(h).padStart(2, '0')}:00`);
  return slots;
}
const HOUR_SLOTS = buildSlots();

const DURATION_PRESETS = [1, 2, 3, 4, 6, 8];

function slotLabel(time: string) {
  const h = parseInt(time.split(':')[0]);
  const ampm = h >= 12 ? 'pm' : 'am';
  const d = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${d}${ampm}`;
}

function addHours(time: string, hours: number): string {
  const h = parseInt(time.split(':')[0]) + hours;
  if (h > 24) return '24:00';
  return `${String(h).padStart(2, '0')}:00`;
}

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
}

/** Build a proper ISO string in local timezone (avoids the UTC offset bug) */
function toLocalISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

function isSlotBooked(slot: string, bookings: any[], date: string): boolean {
  return bookings.some((b) => {
    const start = new Date(b.starts_at);
    const end = new Date(b.ends_at);
    const slotStart = new Date(`${date}T${slot}:00`);
    const slotEnd = new Date(`${date}T${addHours(slot, 1)}:00`);
    return slotStart < end && slotEnd > start;
  });
}

// ─── Service category icons ───────────────────────────────────────────────────
const CAT_ICON: Record<string, string> = {
  RECORDING:   '🎙',
  MIX_MASTER:  '🎚',
  FULL_DAY:    '📅',
  COACHING:    '🎓',
  EVENT:       '🎤',
  MEMBERSHIP:  '♾',
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function BookingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuthStore();

  // Rebook prefill from BookingDetailPage
  const prefill = (location.state as any)?.prefill as {
    service_id?: string; room_id?: string; engineer_id?: string;
  } | undefined;

  // Calendar click prefill — ?date=YYYY-MM-DD&time=HH:00&room_id=...
  const [searchParams] = useSearchParams();
  const calDate   = searchParams.get('date')    ?? '';
  const calTime   = searchParams.get('time')    ?? '';
  const calRoomId = searchParams.get('room_id') ?? '';

  const hasCalPrefill = !!(calDate || calRoomId);
  const [step, setStep] = useState<Step>(
    prefill ? 'datetime' : hasCalPrefill ? 'datetime' : 'engineer'
  );
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(4);
  const [selected, setSelected] = useState({
    service_id:  prefill?.service_id  ?? '',
    room_id:     prefill?.room_id  ?? calRoomId,
    engineer_id: prefill?.engineer_id ?? '',
    date:        calDate,
    start_time:  calTime,
    end_time:    calTime ? `${String(parseInt(calTime)+2).padStart(2,'0')}:00` : '',
    intent:      '', // session goal / label — stored in notes
    project_id:  '',  // optional — links booking to a producer project
  });

  // ── Queries ────────────────────────────────────────────────────────────────
  // Producer projects — only fetched when user has PRODUCER role
  const { data: producerProjects = [] } = useQuery({
    queryKey: ['producer', 'projects'],
    queryFn: async () => (await api.get('/producer/projects')).data,
    enabled: user?.role === 'PRODUCER',
  });
  const { data: studio, isLoading: loadingStudio } = useQuery({
    queryKey: ['studio'],
    queryFn: async () => (await api.get('/studio')).data,
  });

  const { data: availData, isFetching: loadingAvail } = useQuery({
    queryKey: ['availability', selected.date, selected.room_id],
    queryFn: async () =>
      (await api.get(`/availability?date=${selected.date}&room_id=${selected.room_id}`)).data,
    enabled: !!(selected.date && selected.room_id),
  });

  const bookedSlots: any[] = availData?.bookings ?? [];

  // ── Derived ────────────────────────────────────────────────────────────────
  const services  = studio?.services  ?? [];
  const rooms     = studio?.rooms     ?? [];
  const engineers = studio?.engineers ?? [];

  const selectedService  = services.find((s: any)  => s.id === selected.service_id);
  const selectedRoom     = rooms.find((r: any)      => r.id === selected.room_id);
  const selectedEngineer = engineers.find((e: any)  => e.id === selected.engineer_id);

  const hours    = calcHours(selected.start_time, selected.end_time);
  const total    = useMemo(() => {
    if (!selectedService) return 0;
    return selectedService.unit === 'hour'
      ? Number(selectedService.min_price_usd) * Math.max(hours, 0)
      : Number(selectedService.min_price_usd);
  }, [selectedService, hours]);

  // Live wallet balance — auth store is stale after transactions
  const { data: meData, isLoading: loadingMe } = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/auth/me')).data,
    staleTime: 30_000,
  });
  // Prefer live meData; fall back to auth store while loading
  const walletBalance = Number(meData?.artist?.wallet?.balance_usd ?? user?.artist?.wallet?.balance_usd ?? 0);
  const afterBalance  = walletBalance - total;
  const canAfford     = walletBalance >= total;

  const [walletGateDismissed, setWalletGateDismissed] = useState(false);
  const stepIndex = STEPS.indexOf(step);

  // ── Validation ─────────────────────────────────────────────────────────────
  function canProceed(): boolean {
    if (step === 'engineer') return true; // optional
    if (step === 'service')  return !!selected.service_id;
    if (step === 'room')     return !!selected.room_id;
    if (step === 'datetime') return !!selected.date && !!selected.start_time && !!selected.end_time && hours > 0;
    return canAfford;
  }

  // ── Slot click logic ───────────────────────────────────────────────────────
  function handleSlotClick(slot: string) {
    if (isSlotBooked(slot, bookedSlots, selected.date)) return;
    if (!selected.start_time || (selected.start_time && selected.end_time)) {
      setSelected((p) => ({ ...p, start_time: slot, end_time: '' }));
    } else if (slot > selected.start_time) {
      setSelected((p) => ({ ...p, end_time: addHours(slot, 1) }));
    } else {
      setSelected((p) => ({ ...p, start_time: slot, end_time: '' }));
    }
  }

  function applyDuration(h: number) {
    if (!selected.start_time) return;
    setSelected((p) => ({ ...p, end_time: addHours(p.start_time, h) }));
  }

  function isSlotInRange(slot: string) {
    if (!selected.start_time || !selected.end_time) return false;
    return slot >= selected.start_time && slot < selected.end_time;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  const createBooking = useMutation({
    mutationFn: async () => {
      const starts_at = toLocalISO(selected.date, selected.start_time);
      const ends_at   = toLocalISO(selected.date, selected.end_time);
      const notes = selected.intent || undefined;
      return (await api.post('/bookings', {
        service_id:   selected.service_id,
        room_id:      selected.room_id,
        engineer_id:  selected.engineer_id || undefined,
        starts_at,
        ends_at,
        notes,
        repeat_weeks: repeatEnabled ? repeatWeeks : 1,
        project_id:  selected.project_id || undefined,
      })).data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      if (data?.recurring) {
        toast.success(`${data.total_created} sessions booked — pending studio confirmation`);
        navigate('/dashboard');
      } else {
        toast.success('Session booked — pending studio confirmation');
        navigate(`/bookings/${data.booking?.id ?? data.id}`);
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? 'Booking failed');
    },
  });

  // ── UI ─────────────────────────────────────────────────────────────────────
  // ── Wallet gate — intercept zero-balance artists before they waste time ──────
  // Only gate after /me resolves — avoids flash for funded artists during load
  const showWalletGate = !walletGateDismissed && !loadingMe && walletBalance === 0;

  if (!loadingStudio && showWalletGate) {
    return (
      <div className="min-h-screen bg-studio-bg text-white flex flex-col items-center justify-center p-6">
        <style>{`
          @keyframes wg-fade { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
          .wg-card { animation: wg-fade 0.35s ease both; }
        `}</style>
        <div className="wg-card w-full max-w-md">
          {/* Icon */}
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#1a1200', border: '1px solid #5A9BCB22', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5A9BCB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M16 11a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" fill="#5A9BCB" stroke="none" />
              <path d="M2 10V7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3" />
            </svg>
          </div>

          <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: '#f0ede8', marginBottom: 8, lineHeight: 1.2 }}>
            Fund your wallet first
          </p>
          <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 28 }}>
            Your OIANO wallet is empty. Add funds before booking — sessions are charged at confirmation.
          </p>

          {/* Balance display */}
          <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#3a3a3a', fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Current balance</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, color: '#E8823A', fontWeight: 700 }}>
              ${walletBalance.toFixed(2)}
            </span>
          </div>

          {/* Top-up presets */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
            {[50, 100, 200, 500].map(amt => (
              <button
                key={amt}
                onClick={async () => {
                  try {
                    const { data } = await api.post('/payments/wallet/top-up', { amount_usd: amt });
                    window.location.href = data.checkout_url;
                  } catch {
                    toast.error('Top-up failed — try again');
                  }
                }}
                style={{
                  padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: '#5A9BCB', color: '#000', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#7BB3D9')}
                onMouseLeave={e => (e.currentTarget.style.background = '#5A9BCB')}
              >
                +${amt}
              </button>
            ))}
          </div>

          <button
            onClick={() => setWalletGateDismissed(true)}
            style={{ width: '100%', padding: '11px 0', borderRadius: 9, fontSize: 12, color: '#444', background: 'none', border: '1px solid #1e1e1e', cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#777')}
            onMouseLeave={e => (e.currentTarget.style.color = '#444')}
          >
            I'll add funds later — continue to booking
          </button>
        </div>
      </div>
    );
  }

  if (loadingStudio) {
    return (
      <div className="min-h-screen bg-studio-bg flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading studio info…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-studio-bg text-white">
      {/* Header */}
      <header className="border-b border-studio-border px-6 py-4 flex items-center gap-4 sticky top-0 bg-studio-bg z-10">
        <Link to="/dashboard" className="text-zinc-500 hover:text-white text-sm transition-colors">← Back</Link>
        <h1 className="font-display text-xl text-dome font-semibold">Book a Session</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-zinc-600 text-xs font-mono">Balance</span>
          <span className={`text-sm font-semibold font-mono ${walletBalance < 50 ? 'text-yellow-400' : 'text-white'}`}>
            ${walletBalance.toFixed(2)}
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">

        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-10">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <button
                onClick={() => i < stepIndex && setStep(s)}
                className={`flex items-center gap-2 group ${i < stepIndex ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  i < stepIndex  ? 'bg-dome text-black' :
                  i === stepIndex ? 'bg-dome text-black ring-2 ring-dome/30' :
                  'bg-studio-muted text-zinc-600'
                }`}>
                  {i < stepIndex ? '✓' : i + 1}
                </div>
                <span className={`text-xs transition-colors ${i <= stepIndex ? 'text-white' : 'text-zinc-600'}`}>
                  {STEP_LABELS[s]}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-3 transition-colors ${i < stepIndex ? 'bg-dome/40' : 'bg-studio-border'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content card */}
        <div className="bg-studio-surface border border-studio-border rounded-2xl overflow-hidden">

          {/* ── Step 1: Service ─────────────────────────────────────────── */}
          {/* ── Step 1: Engineer ────────────────────────────────────────── */}
          {step === 'engineer' && (
            <div className="p-6">
              <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mb-1">Step 1</p>
              <h2 className="font-display text-2xl text-white mb-1">Who's behind the desk?</h2>
              <p className="text-zinc-500 text-sm mb-6">Pick your engineer first — or skip and we'll assign one for you.</p>

              <div className="space-y-2 mb-4">
                {/* No preference option */}
                <button
                  onClick={() => setSelected((p) => ({ ...p, engineer_id: '' }))}
                  className={`w-full text-left px-5 py-4 rounded-xl border transition-all ${
                    selected.engineer_id === ''
                      ? 'border-dome bg-dome/8 ring-1 ring-dome/20'
                      : 'border-studio-border bg-studio-muted hover:border-zinc-600'
                  }`}
                >
                  <p className="text-sm font-semibold text-white">No preference</p>
                  <p className="text-zinc-500 text-xs mt-0.5">Studio will assign the best available engineer</p>
                </button>

                {engineers.map((e: any) => {
                  const avgRating = e.avg_rating ?? null;
                  return (
                    <button
                      key={e.id}
                      onClick={() => setSelected((p) => ({
                        ...p,
                        engineer_id: p.engineer_id === e.id ? '' : e.id,
                      }))}
                      className={`w-full text-left px-5 py-4 rounded-xl border transition-all ${
                        selected.engineer_id === e.id
                          ? 'border-dome bg-dome/8 ring-1 ring-dome/20'
                          : 'border-studio-border bg-studio-muted hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-white">{e.name}</p>
                            {avgRating && (
                              <span className="text-dome text-xs">{'★'.repeat(Math.round(avgRating))}</span>
                            )}
                          </div>
                          {e.bio && <p className="text-zinc-500 text-xs mt-1 leading-relaxed line-clamp-2">{e.bio}</p>}
                          {e.specialties?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {e.specialties.slice(0, 4).map((sp: string) => (
                                <span key={sp} className="text-xs px-2 py-0.5 rounded-full bg-studio-bg border border-studio-border text-zinc-400 font-mono">{sp}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          {e.hourly_rate_usd && (
                            <>
                              <p className="text-zinc-300 text-sm font-semibold">${e.hourly_rate_usd}</p>
                              <p className="text-zinc-600 text-xs">/ hr</p>
                            </>
                          )}
                          {selected.engineer_id === e.id && (
                            <span className="text-dome text-xs mt-1 block">✓ Selected</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 'service' && (
            <div className="p-6">
              <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mb-1">Step 1</p>
              <h2 className="font-display text-2xl text-white mb-6">What do you need?</h2>
              <div className="grid grid-cols-1 gap-3">
                {services.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => setSelected((p) => ({ ...p, service_id: s.id }))}
                    className={`text-left px-5 py-4 rounded-xl border transition-all ${
                      selected.service_id === s.id
                        ? 'border-dome bg-dome/8 ring-1 ring-dome/20'
                        : 'border-studio-border bg-studio-muted hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{CAT_ICON[s.category] ?? '🎵'}</span>
                        <div>
                          <p className="text-sm font-semibold text-white">{s.name}</p>
                          {s.description && (
                            <p className="text-xs text-zinc-500 mt-0.5">{s.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <p className="text-dome text-sm font-semibold">${s.min_price_usd}</p>
                        <p className="text-zinc-600 text-xs">per {s.unit}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 2: Room + Engineer ──────────────────────────────────── */}
          {step === 'room' && (
            <div className="p-6">
              <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mb-1">Step 3</p>
              <h2 className="font-display text-2xl text-white mb-6">Pick your space</h2>

              <div className="space-y-2 mb-8">
                {rooms.map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => setSelected((p) => ({ ...p, room_id: r.id }))}
                    className={`w-full text-left px-5 py-4 rounded-xl border transition-all ${
                      selected.room_id === r.id
                        ? 'border-dome bg-dome/8 ring-1 ring-dome/20'
                        : 'border-studio-border bg-studio-muted hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{r.name}</p>
                        {r.description && <p className="text-xs text-zinc-500 mt-0.5">{r.description}</p>}
                        <p className="text-xs text-zinc-600 mt-1">Capacity: {r.capacity}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <p className="text-dome text-sm font-semibold">${r.hourly_rate}</p>
                        <p className="text-zinc-600 text-xs">/ hr</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* ── Step 3: Date + Time ──────────────────────────────────────── */}
          {step === 'datetime' && (
            <div className="p-6 space-y-6">
              <div>
                <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mb-1">Step 4</p>
                <h2 className="font-display text-2xl text-white">When?</h2>
              </div>

              {/* Date picker */}
              <div>
                <label className="text-zinc-500 text-xs mb-1.5 block">Date</label>
                <input
                  type="date"
                  value={selected.date}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setSelected((p) => ({
                    ...p, date: e.target.value, start_time: '', end_time: '',
                  }))}
                  className="w-full bg-studio-muted border border-studio-border text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-dome transition-colors"
                />
              </div>

              {/* Availability grid */}
              {selected.date && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-zinc-400 text-sm font-medium">
                        {!selected.start_time
                          ? 'Tap a slot to set start'
                          : !selected.end_time
                          ? `Start: ${slotLabel(selected.start_time)} — tap end`
                          : `${slotLabel(selected.start_time)} → ${slotLabel(selected.end_time)} · ${hours.toFixed(1)}h`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {loadingAvail && (
                        <span className="text-zinc-600 text-xs font-mono animate-pulse">Loading…</span>
                      )}
                      {selected.start_time && (
                        <button
                          onClick={() => setSelected((p) => ({ ...p, start_time: '', end_time: '' }))}
                          className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 mb-4">
                    {HOUR_SLOTS.map((slot) => {
                      const booked  = isSlotBooked(slot, bookedSlots, selected.date);
                      const isStart = slot === selected.start_time;
                      const inRange = isSlotInRange(slot);
                      return (
                        <button
                          key={slot}
                          disabled={booked}
                          onClick={() => handleSlotClick(slot)}
                          className={`py-2.5 text-xs rounded-lg border font-mono transition-colors ${
                            booked
                              ? 'border-red-900/30 bg-red-900/10 text-red-900 cursor-not-allowed'
                              : isStart
                              ? 'border-dome bg-dome text-black font-bold'
                              : inRange
                              ? 'border-dome/30 bg-dome/10 text-dome'
                              : 'border-studio-border bg-studio-muted text-zinc-400 hover:border-zinc-600 hover:text-white'
                          }`}
                        >
                          {slotLabel(slot)}
                        </button>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="flex gap-4 mb-4">
                    {[
                      { color: 'bg-dome border-dome', label: 'Start' },
                      { color: 'bg-dome/10 border-dome/30', label: 'Range' },
                      { color: 'bg-red-900/10 border-red-900/30', label: 'Booked' },
                    ].map((l) => (
                      <div key={l.label} className="flex items-center gap-1.5">
                        <div className={`w-2.5 h-2.5 rounded border ${l.color}`} />
                        <span className="text-zinc-600 text-xs">{l.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Duration quick-select */}
                  {selected.start_time && (
                    <div>
                      <p className="text-zinc-600 text-xs mb-2 font-mono uppercase tracking-widest">Duration</p>
                      <div className="flex gap-2 flex-wrap">
                        {DURATION_PRESETS.map((h) => {
                          const endT = addHours(selected.start_time, h);
                          const active = selected.end_time === endT;
                          const invalid = parseInt(endT) > 24;
                          return (
                            <button
                              key={h}
                              disabled={invalid}
                              onClick={() => applyDuration(h)}
                              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                                active
                                  ? 'border-dome bg-dome text-black font-semibold'
                                  : invalid
                                  ? 'border-studio-border text-zinc-700 cursor-not-allowed opacity-40'
                                  : 'border-studio-border text-zinc-400 hover:border-zinc-600 hover:text-white'
                              }`}
                            >
                              {h}h
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Manual time fallback */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-500 text-xs mb-1.5 block">Start time</label>
                  <input
                    type="time"
                    value={selected.start_time}
                    onChange={(e) => setSelected((p) => ({ ...p, start_time: e.target.value }))}
                    className="w-full bg-studio-muted border border-studio-border text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-dome transition-colors"
                  />
                </div>
                <div>
                  <label className="text-zinc-500 text-xs mb-1.5 block">End time</label>
                  <input
                    type="time"
                    value={selected.end_time}
                    onChange={(e) => setSelected((p) => ({ ...p, end_time: e.target.value }))}
                    className="w-full bg-studio-muted border border-studio-border text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-dome transition-colors"
                  />
                </div>
              </div>

              {/* Live cost */}
              {total > 0 && (
                <div className="flex items-center justify-between bg-dome/5 border border-dome/15 rounded-xl px-5 py-4">
                  <div>
                    <p className="text-zinc-500 text-xs">Estimated cost</p>
                    <p className="text-2xl font-display font-semibold text-dome mt-0.5">${total.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-zinc-500 text-xs">Duration</p>
                    <p className="text-white text-sm font-semibold mt-0.5">{hours.toFixed(1)} hours</p>
                  </div>
                </div>
              )}

              {/* Producer project picker — only visible for PRODUCER role */}
              {user?.role === 'PRODUCER' && producerProjects.length > 0 && (
                <div>
                  <label className="text-zinc-500 text-xs mb-1.5 block">Attach to project (optional)</label>
                  <select
                    value={selected.project_id}
                    onChange={(e) => setSelected((p) => ({ ...p, project_id: e.target.value }))}
                    className="w-full bg-studio-muted border border-studio-border text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-dome transition-colors"
                  >
                    <option value="">No project</option>
                    {(producerProjects as any[]).map((proj: any) => (
                      <option key={proj.id} value={proj.id}>
                        {proj.title} · {proj.phase.replace(/_/g, ' ').toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Session intent */}
              <div>
                <label className="text-zinc-500 text-xs mb-1.5 block">Session goal (optional)</label>
                <input
                  type="text"
                  value={selected.intent}
                  onChange={(e) => setSelected((p) => ({ ...p, intent: e.target.value }))}
                  placeholder="e.g. Tracking vocals for EP, mix session for 'Late Nights'…"
                  className="w-full bg-studio-muted border border-studio-border text-white placeholder-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-dome transition-colors"
                />
              </div>

              {/* Repeat weekly */}
              <div className="border border-studio-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-medium">Repeat weekly</p>
                    <p className="text-zinc-500 text-xs mt-0.5">Book the same slot every week</p>
                  </div>
                  <button
                    onClick={() => setRepeatEnabled(e => !e)}
                    className={`w-10 h-6 rounded-full transition-colors relative ${
                      repeatEnabled ? 'bg-dome' : 'bg-studio-muted'
                    }`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                      repeatEnabled ? 'left-5' : 'left-1'
                    }`} />
                  </button>
                </div>
                {repeatEnabled && (
                  <div className="mt-4">
                    <p className="text-zinc-500 text-xs mb-2">Number of weeks</p>
                    <div className="flex gap-2 flex-wrap">
                      {[2, 4, 6, 8, 12].map((w) => (
                        <button
                          key={w}
                          onClick={() => setRepeatWeeks(w)}
                          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                            repeatWeeks === w
                              ? 'border-dome bg-dome/10 text-dome'
                              : 'border-studio-border text-zinc-400 hover:border-zinc-500'
                          }`}
                        >
                          {w}w
                        </button>
                      ))}
                    </div>
                    <p className="text-zinc-600 text-xs mt-2">
                      Creates {repeatWeeks} sessions · same time each week
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 4: Confirm ──────────────────────────────────────────── */}
          {step === 'confirm' && (
            <div className="p-6">
              <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mb-1">Step 4</p>
              <h2 className="font-display text-2xl text-white mb-6">Review & confirm</h2>

              {/* Invoice breakdown */}
              <div className="border border-studio-border rounded-xl overflow-hidden mb-5">
                <div className="bg-studio-muted px-5 py-3 border-b border-studio-border">
                  <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Booking summary</p>
                </div>
                <div className="divide-y divide-studio-border">
                  {[
                    { label: 'Service',  value: selectedService?.name ?? '—' },
                    { label: 'Room',     value: selectedRoom?.name ?? '—' },
                    { label: 'Engineer', value: selectedEngineer?.name ?? 'None' },
                    {
                      label: 'Date',
                      value: new Date(selected.date).toLocaleDateString('en-US', {
                        weekday: 'long', month: 'long', day: 'numeric',
                      }),
                    },
                    {
                      label: 'Time',
                      value: `${slotLabel(selected.start_time)} → ${slotLabel(selected.end_time)} (${hours.toFixed(1)}h)`,
                    },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between items-center px-5 py-3.5 text-sm">
                      <span className="text-zinc-500">{row.label}</span>
                      <span className="text-white font-medium">{row.value}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-studio-muted px-5 py-4 border-t border-studio-border">
                  {repeatEnabled && (
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="text-zinc-500">Per session</span>
                      <span className="text-zinc-400">${total.toFixed(2)} × {repeatWeeks}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-white text-sm font-semibold">
                      {repeatEnabled ? `Total (${repeatWeeks} sessions)` : 'Total'}
                    </span>
                    <span className="text-2xl font-display font-semibold text-dome">
                      ${(total * (repeatEnabled ? repeatWeeks : 1)).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Wallet balance check */}
              <div className={`rounded-xl px-5 py-4 mb-5 ${
                canAfford
                  ? 'bg-green-900/10 border border-green-900/30'
                  : 'bg-red-900/10 border border-red-900/30'
              }`}>
                <div className="flex justify-between items-center">
                  <div>
                    <p className={`text-sm font-medium ${canAfford ? 'text-green-400' : 'text-red-400'}`}>
                      {canAfford ? 'Wallet sufficient' : 'Insufficient balance'}
                    </p>
                    <p className="text-zinc-500 text-xs mt-0.5">
                      ${walletBalance.toFixed(2)} balance
                      {canAfford
                        ? ` → $${afterBalance.toFixed(2)} after booking`
                        : ` — need $${(total - walletBalance).toFixed(2)} more`}
                    </p>
                  </div>
                  <span className={`text-lg ${canAfford ? 'text-green-400' : 'text-red-400'}`}>
                    {canAfford ? '✓' : '✕'}
                  </span>
                </div>
              </div>

              {/* Session goal */}
              {selected.intent && (
                <div className="bg-studio-muted border border-studio-border rounded-xl px-5 py-3 mb-5">
                  <p className="text-zinc-500 text-xs mb-1">Session goal</p>
                  <p className="text-zinc-300 text-sm">{selected.intent}</p>
                </div>
              )}

              <div className="bg-dome/5 border border-dome/10 rounded-xl px-5 py-3 text-xs text-zinc-500 leading-relaxed">
                Your booking will be <span className="text-zinc-400">pending</span> until confirmed by the studio team.
                Wallet is charged only on confirmation.
              </div>

              {createBooking.isError && (
                <div className="mt-4 bg-red-900/10 border border-red-900/30 rounded-xl px-5 py-3 text-red-400 text-sm">
                  {(createBooking.error as any)?.response?.data?.error ?? 'Booking failed. Please try again.'}
                </div>
              )}

              <button
                onClick={() => createBooking.mutate()}
                disabled={!canAfford || createBooking.isPending}
                className="w-full mt-6 bg-dome text-black font-semibold py-3.5 rounded-xl hover:bg-dome-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-display text-sm tracking-wide"
              >
                {createBooking.isPending ? 'Booking…' : repeatEnabled ? `Confirm ${repeatWeeks} sessions →` : 'Confirm booking →'}
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <button
            onClick={() => setStep(STEPS[stepIndex - 1])}
            disabled={stepIndex === 0}
            className="px-5 py-2.5 text-sm text-zinc-500 hover:text-white transition-colors disabled:opacity-0"
          >
            ← Back
          </button>
          {step !== 'confirm' && (
            <button
              onClick={() => setStep(STEPS[stepIndex + 1])}
              disabled={!canProceed()}
              className="px-6 py-2.5 text-sm bg-dome text-black font-semibold rounded-xl hover:bg-dome-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue →
            </button>
          )}
        </div>
      </main>
    
    </div>
  );
}
