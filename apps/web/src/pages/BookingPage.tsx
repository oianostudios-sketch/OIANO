import { useState, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { useToast } from '../components/Toast';
import TrustSignal from '../components/TrustSignal';

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = 'studio' | 'engineer' | 'service' | 'room' | 'datetime' | 'confirm';
const ALL_STEPS: Step[] = ['studio', 'service', 'room', 'datetime', 'confirm'];
const STEP_LABELS: Record<Step, string> = {
  studio: 'Studio',
  engineer: 'Engineer assignment',
  service:  'Session type',
  room:     'Room',
  datetime: 'Date & time',
  confirm:  'Review',
};

const STEP_CTA: Record<Exclude<Step, 'confirm'>, string> = {
  studio: 'Choose this studio',
  engineer: 'Continue to session type',
  service: 'Continue to rooms',
  room: 'Continue to dates',
  datetime: 'Review session request',
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
    studio_id?: string; service_id?: string; room_id?: string; engineer_id?: string; project_id?: string;
  } | undefined;

  // Calendar click prefill — ?date=YYYY-MM-DD&time=HH:00&room_id=...
  const [searchParams] = useSearchParams();
  const calDate   = searchParams.get('date')    ?? '';
  const calTime   = searchParams.get('time')    ?? '';
  const calRoomId = searchParams.get('room_id') ?? '';
  const calStudioId = searchParams.get('studio') ?? '';

  const [step, setStep] = useState<Step>(
    prefill ? 'datetime' : (calDate || calRoomId) ? 'datetime' : calStudioId ? 'service' : 'studio'
  );
  const [selectedStudioId, setSelectedStudioId] = useState(prefill?.studio_id ?? calStudioId);
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
    project_id:  prefill?.project_id ?? '',
  });

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: studioOptions = [], isLoading: loadingStudioOptions, isError: studioOptionsError, refetch: refetchStudioOptions } = useQuery({
    queryKey: ['studio-options'],
    queryFn: async () => (await api.get('/studio/options')).data,
  });
  const effectiveStudioId = selectedStudioId;
  const visibleSteps = ALL_STEPS;
  const visibleStepNumber = (target: Step) => visibleSteps.indexOf(target) + 1;
  const { data: studio, isLoading: loadingStudioDetails, isError: studioDetailsError, refetch: refetchStudio } = useQuery({
    queryKey: ['studio', effectiveStudioId],
    queryFn: async () => (await api.get(`/studio/${effectiveStudioId}`)).data,
    enabled: !!effectiveStudioId,
  });
  const loadingStudio = loadingStudioOptions || (!!effectiveStudioId && loadingStudioDetails);
  const studioError = studioOptionsError || studioDetailsError;

  const { data: availData, isFetching: loadingAvail, isError: availabilityError, refetch: refetchAvailability } = useQuery({
    queryKey: ['availability', effectiveStudioId, selected.date, selected.room_id],
    queryFn: async () =>
      (await api.get(`/availability?date=${selected.date}&room_id=${selected.room_id}&studio_id=${effectiveStudioId}`)).data,
    enabled: !!(effectiveStudioId && selected.date && selected.room_id),
  });

  const bookedSlots: any[] = availData?.bookings ?? [];

  const { data: artistProjects = [] } = useQuery<any[]>({
    queryKey: ['artist-projects'],
    queryFn: async () => (await api.get('/artist-projects')).data,
  });
  const activeProjects = artistProjects.filter((project: any) => project.is_active && project.phase !== 'DELIVERED');
  const selectedProject = activeProjects.find((project: any) => project.id === selected.project_id);

  // ── Derived ────────────────────────────────────────────────────────────────
  const services  = studio?.services  ?? [];
  const rooms     = studio?.rooms     ?? [];
  const engineers = studio?.engineers ?? [];

  const selectedService  = services.find((s: any)  => s.id === selected.service_id);
  const selectedRoom     = rooms.find((r: any)      => r.id === selected.room_id);

  const hours    = calcHours(selected.start_time, selected.end_time);
  const total    = useMemo(() => {
    if (!selectedService) return 0;
    return selectedService.unit === 'hour'
      ? Number(selectedService.min_price_usd) * Math.max(hours, 0)
      : Number(selectedService.min_price_usd);
  }, [selectedService, hours]);
  const sessionCount = repeatEnabled ? repeatWeeks : 1;
  const grandTotal = total * sessionCount;
  const selectionConflicts = useMemo(() => {
    if (!selected.date || !selected.start_time || !selected.end_time) return false;
    const start = new Date(toLocalISO(selected.date, selected.start_time)).getTime();
    const end = new Date(toLocalISO(selected.date, selected.end_time)).getTime();
    return bookedSlots.some((booking: any) =>
      new Date(booking.starts_at).getTime() < end && new Date(booking.ends_at).getTime() > start,
    );
  }, [bookedSlots, selected.date, selected.start_time, selected.end_time]);

  // Live wallet balance — auth store is stale after transactions
  const { data: meData, isLoading: loadingMe, isError: walletError, refetch: refetchWallet } = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/auth/me')).data,
    staleTime: 30_000,
  });
  // Prefer live meData; fall back to auth store while loading
  const walletBalance = Number(meData?.artist?.wallet?.balance_usd ?? user?.artist?.wallet?.balance_usd ?? 0);
  const afterBalance  = walletBalance - grandTotal;
  const canAfford     = !walletError && walletBalance >= grandTotal;

  const [walletGateDismissed, setWalletGateDismissed] = useState(false);
  const stepIndex = visibleSteps.indexOf(step);
  const progressPercent = Math.round(((stepIndex + 1) / visibleSteps.length) * 100);
  const selectionSummary = [
    studio?.name && { label: 'Studio', value: studio.name },
    stepIndex > 0 && { label: 'Engineer', value: 'Assigned by studio' },
    selectedService?.name && { label: 'Session', value: selectedService.name },
    selectedRoom?.name && { label: 'Room', value: selectedRoom.name },
    selectedProject?.title && { label: 'Project', value: selectedProject.title },
    selected.date && { label: 'Date', value: new Date(`${selected.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) },
  ].filter(Boolean) as { label: string; value: string }[];

  // ── Validation ─────────────────────────────────────────────────────────────
  function canProceed(): boolean {
    if (step === 'studio') return !!effectiveStudioId;
    if (step === 'service')  return !!selected.service_id;
    if (step === 'room')     return !!selected.room_id;
    if (step === 'datetime') return !!selected.date && !!selected.start_time && !!selected.end_time && hours > 0 && !availabilityError && !selectionConflicts;
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
        studio_id:    effectiveStudioId,
        service_id:   selected.service_id,
        room_id:      selected.room_id,
        starts_at,
        ends_at,
        notes,
        repeat_weeks: repeatEnabled ? repeatWeeks : 1,
        project_id: selected.project_id || undefined,
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
  const showWalletGate = !walletGateDismissed && !loadingMe && !walletError && !studioError && walletBalance === 0;

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
            Your OIANO wallet is empty. Credits are deducted when you submit a booking.
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

  if (studioError) {
    return (
      <div className="min-h-screen bg-studio-bg text-white flex items-center justify-center p-6">
        <div role="alert" className="w-full max-w-md rounded-xl border border-red-900/40 bg-red-950/20 p-6 text-center">
          <h1 className="font-display text-2xl text-white mb-2">Studio details unavailable</h1>
          <p className="text-zinc-400 text-sm mb-5">We couldn't load rooms, services, or engineers. No booking information has been lost.</p>
          <div className="flex justify-center gap-3">
            <button type="button" onClick={() => { refetchStudioOptions(); refetchStudio(); }} className="rounded-lg bg-dome px-4 py-2 text-sm font-semibold text-black">Try again</button>
            <button type="button" onClick={() => navigate('/dashboard')} className="rounded-lg border border-studio-border px-4 py-2 text-sm text-zinc-300">Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-studio-bg text-white">
      {/* Header */}
      <header className="border-b border-studio-border px-6 py-4 flex items-center gap-4 sticky top-0 bg-studio-bg z-10">
        <Link to="/dashboard" className="text-zinc-500 hover:text-white text-sm transition-colors">← Back</Link>
        <h1 className="font-display text-xl text-dome font-semibold">Plan your studio session</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-zinc-600 text-xs font-mono">Balance</span>
          <span className={`text-sm font-semibold font-mono ${walletBalance < 50 ? 'text-yellow-400' : 'text-white'}`}>
            ${walletBalance.toFixed(2)}
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">

        {walletError && (
          <div role="alert" className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-yellow-900/40 bg-yellow-950/20 px-4 py-3">
            <p className="text-sm text-yellow-200">Your latest wallet balance could not be verified. Confirming is disabled until it refreshes.</p>
            <button type="button" onClick={() => refetchWallet()} className="shrink-0 rounded-lg border border-yellow-700/50 px-3 py-1.5 text-xs text-yellow-100">Retry</button>
          </div>
        )}

        {studio && step !== 'studio' && (
          <div className="mb-6 flex items-center justify-between gap-4 overflow-hidden rounded-xl border border-dome/20 bg-dome/5 pr-4">
            <div className="flex min-w-0 items-center gap-3">
              <img src={studio.image_url || '/images/mock/oiano-studio-editorial-v1.png'} alt={`${studio.name} interior`} className="h-[66px] w-[92px] shrink-0 object-cover" />
              <div><p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">Booking at</p><p className="text-sm font-semibold text-white mt-0.5">{studio.name}</p>{studio.address && <p className="text-xs text-zinc-500 mt-0.5">{studio.address}</p>}</div>
            </div>
            {studioOptions.length > 1 && <button type="button" onClick={() => setStep('studio')} className="shrink-0 rounded-lg border border-dome/30 px-3 py-2 text-xs text-dome">Change studio</button>}
          </div>
        )}

        {/* Progress: readable on mobile, detailed on larger screens */}
        <div className="mb-4 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-600">
          <span>Step {stepIndex + 1} of {visibleSteps.length}</span>
          <span className="text-dome">{progressPercent}% complete</span>
        </div>
        <div className="mb-7 h-1 overflow-hidden rounded-full bg-studio-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-dome transition-all duration-500" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="flex items-center gap-0 mb-6" aria-label="Booking progress">
          {visibleSteps.map((s, i) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                onClick={() => i < stepIndex && setStep(s)}
                aria-current={i === stepIndex ? 'step' : undefined}
                aria-label={`${STEP_LABELS[s]}${i < stepIndex ? ', completed' : i === stepIndex ? ', current step' : ''}`}
                className={`flex items-center gap-2 group ${i < stepIndex ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  i < stepIndex  ? 'bg-dome text-black' :
                  i === stepIndex ? 'bg-dome text-black ring-2 ring-dome/30' :
                  'bg-studio-muted text-zinc-600'
                }`}>
                  {i < stepIndex ? '✓' : i + 1}
                </div>
                <span className={`hidden text-xs transition-colors sm:inline ${i <= stepIndex ? 'text-white' : 'text-zinc-600'}`}>
                  {STEP_LABELS[s]}
                </span>
              </button>
              {i < visibleSteps.length - 1 && (
                <div className={`flex-1 h-px mx-3 transition-colors ${i < stepIndex ? 'bg-dome/40' : 'bg-studio-border'}`} />
              )}
            </div>
          ))}
        </div>

        {selectionSummary.length > 0 && step !== 'studio' && (
          <div className="mb-6 flex gap-2 overflow-x-auto pb-1" aria-label="Current booking selections">
            {selectionSummary.map((item) => (
              <div key={item.label} className="shrink-0 rounded-full border border-studio-border bg-studio-surface px-3 py-2">
                <span className="mr-1.5 text-[9px] font-mono uppercase tracking-wider text-zinc-600">{item.label}</span>
                <span className="text-xs text-zinc-300">{item.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Step content card */}
        <div className="bg-studio-surface border border-studio-border rounded-2xl overflow-hidden">

          {step === 'studio' && (
            <div className="p-6">
              <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mb-1">Step {visibleStepNumber('studio')} of {visibleSteps.length}</p>
              <h2 className="font-display text-2xl text-white mb-1">Choose your studio</h2>
              <p className="text-zinc-500 text-sm mb-6">Your studio determines the available engineers, services, rooms, pricing and schedule.</p>
              <div className="space-y-3">
                {studioOptions.map((option: any) => (
                  <button key={option.id} type="button" aria-pressed={effectiveStudioId === option.id} onClick={() => { setSelectedStudioId(option.id); setSelected((current) => ({ ...current, service_id: '', room_id: '', engineer_id: '', date: '', start_time: '', end_time: '' })); }} className={`group w-full overflow-hidden text-left rounded-xl border transition-all ${effectiveStudioId === option.id ? 'border-dome bg-dome/8 ring-1 ring-dome/20' : 'border-studio-border bg-studio-muted hover:border-zinc-600'}`}>
                    <img src={option.image_url} alt={`${option.name} interior`} className="h-36 w-full object-cover transition-transform duration-700 group-hover:scale-[1.025]" />
                    <div className="px-5 py-5">
                    <div className="flex justify-between gap-4"><div><p className="text-base font-semibold text-white">{option.name}</p>{option.address && <p className="text-zinc-500 text-xs mt-1">{option.address}</p>}</div>{effectiveStudioId === option.id && <span className="text-dome text-xs">✓ Selected</span>}</div>
                    <div className="flex flex-wrap gap-4 mt-3 text-[10px] font-mono text-zinc-600"><span>{option._count.rooms} rooms</span><span>{option._count.engineers} engineers</span><span>{option._count.services} services</span><span className="ml-auto text-dome opacity-70 transition-opacity group-hover:opacity-100">View availability →</span></div>
                    <div className="mt-3 flex flex-wrap gap-1.5">{option.amenities?.map((amenity: string) => <span key={amenity} className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-zinc-500">{amenity}</span>)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Dead step: 'engineer' is not in ALL_STEPS/visibleSteps, so this
               branch is unreachable in the live wizard — the studio now assigns
               the engineer after booking instead (see bookings.controller.ts).
               Left in place rather than deleted without sign-off; see the
               system audit (docs/OIANO_SYSTEM_AUDIT.md) for the removal call. ── */}
          {step === 'engineer' && (
            <div className="p-6">
              <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mb-1">Step {visibleStepNumber('engineer')} of {visibleSteps.length}</p>
              <h2 className="font-display text-2xl text-white mb-1">Choose your engineer</h2>
              <p className="text-zinc-500 text-sm mb-6">Choose the right creative partner, or let the studio match one to your session.</p>

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
                  <div className="flex items-center gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-dome/20 bg-dome/10 text-lg text-dome">◎</div><div><p className="text-sm font-semibold text-white">Match me with an engineer</p><p className="text-zinc-500 text-xs mt-0.5">The studio will choose the strongest available fit</p><span className="mt-1.5 inline-block text-[9px] font-mono uppercase tracking-wider text-dome">Recommended if you are flexible</span></div></div>
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
                        <div className="flex min-w-0 flex-1 gap-3">
                          <img src={e.avatar_url} alt={`${e.name}, recording engineer`} className="h-16 w-16 shrink-0 rounded-xl object-cover object-top" />
                          <div className="min-w-0 flex-1">
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
              <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mb-1">Step {visibleStepNumber('service')} of {visibleSteps.length}</p>
              <h2 className="font-display text-2xl text-white mb-2">What are you creating?</h2>
              <p className="mb-6 text-sm text-zinc-500">Choose the session type that best matches the result you want.</p>
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
              <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mb-1">Step {visibleStepNumber('room')} of {visibleSteps.length}</p>
              <h2 className="font-display text-2xl text-white mb-2">Choose where you’ll create</h2>
              <p className="mb-6 text-sm text-zinc-500">Match the room to the sound and energy you want from this session.</p>

              <div className="grid gap-3 mb-8 sm:grid-cols-2">
                {rooms.map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => setSelected((p) => ({ ...p, room_id: r.id }))}
                    className={`group w-full overflow-hidden text-left rounded-xl border transition-all ${
                      selected.room_id === r.id
                        ? 'border-dome bg-dome/8 ring-1 ring-dome/20'
                        : 'border-studio-border bg-studio-muted hover:border-zinc-600'
                    }`}
                  >
                    <div className="relative h-32 overflow-hidden">
                      <img src={r.image_url || '/images/mock/oiano-live-room-v1.png'} alt={`${r.name} interior`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                      <span className="absolute bottom-3 left-4 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider text-zinc-300 backdrop-blur-sm">Live room</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{r.name}</p>
                        {r.description && <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{r.description}</p>}
                        <p className="text-xs text-zinc-600 mt-1">Capacity: {r.capacity}</p>
                        <div className="mt-2 flex flex-wrap gap-1">{r.amenities?.slice(0, 3).map((amenity: string) => <span key={amenity} className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] text-zinc-500">{amenity}</span>)}</div>
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
                <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mb-1">Step {visibleStepNumber('datetime')} of {visibleSteps.length}</p>
                <h2 className="font-display text-2xl text-white">Choose your date and time</h2>
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

                  {availabilityError && (
                    <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-3">
                      <span className="text-xs text-red-200">Availability couldn't be loaded. Choose no time until this refreshes.</span>
                      <button type="button" onClick={() => refetchAvailability()} className="shrink-0 text-xs text-red-100 underline underline-offset-2">Retry</button>
                    </div>
                  )}

                  {selectionConflicts && (
                    <div role="alert" className="mb-4 rounded-lg border border-yellow-800/40 bg-yellow-950/20 px-4 py-3 text-xs text-yellow-100">
                      Part of this time range is already booked. Choose a different start time or shorter duration.
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-1.5 mb-4">
                    {HOUR_SLOTS.map((slot) => {
                      const booked  = isSlotBooked(slot, bookedSlots, selected.date);
                      const isStart = slot === selected.start_time;
                      const inRange = isSlotInRange(slot);
                      return (
                        <button
                          key={slot}
                          disabled={booked || availabilityError}
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

              {/* Keep the studio session inside the artist's wider body of work. */}
              <div>
                <label className="text-zinc-500 text-xs mb-1.5 block">Connect to a project (optional)</label>
                <select
                  value={selected.project_id}
                  onChange={(e) => setSelected((p) => ({ ...p, project_id: e.target.value }))}
                  className="w-full bg-studio-muted border border-studio-border text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-dome transition-colors"
                >
                  <option value="">Standalone studio session</option>
                  {activeProjects.map((project: any) => (
                    <option key={project.id} value={project.id}>
                      {project.title} · {String(project.phase).replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
                <p className="text-zinc-600 text-xs mt-2">
                  Linked sessions stay with the project timeline, collaborators and deliverables.
                </p>
              </div>

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
              <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mb-1">Step {visibleStepNumber('confirm')} of {visibleSteps.length}</p>
              <h2 className="font-display text-2xl text-white mb-2">Review your session</h2>
              <p className="mb-6 text-sm text-zinc-500">Check the details before sending your request to the studio.</p>

              {/* Invoice breakdown */}
              <div className="border border-studio-border rounded-xl overflow-hidden mb-5">
                <div className="bg-studio-muted px-5 py-3 border-b border-studio-border">
                  <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Booking summary</p>
                </div>
                <div className="divide-y divide-studio-border">
                  {[
                    { label: 'Studio',   value: studio?.name ?? '—' },
                    { label: 'Service',  value: selectedService?.name ?? '—' },
                    { label: 'Room',     value: selectedRoom?.name ?? '—' },
                    { label: 'Engineer', value: `Assigned by ${studio?.name ?? 'the studio'}` },
                    { label: 'Project',  value: selectedProject?.title ?? 'Standalone session' },
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
                      ${grandTotal.toFixed(2)}
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
                      {canAfford ? 'Studio Credit ready' : 'More Studio Credit needed'}
                    </p>
                    <p className="text-zinc-500 text-xs mt-0.5">
                      ${walletBalance.toFixed(2)} balance
                      {canAfford
                        ? ` → $${afterBalance.toFixed(2)} after booking`
                        : ` — need $${(grandTotal - walletBalance).toFixed(2)} more`}
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
                Credits are deducted when you submit this booking. The session remains <span className="text-zinc-400">pending</span> until the studio team confirms the schedule.
              </div>
              <div className="mt-3"><TrustSignal kind="studio" compact /></div>

              {createBooking.isError && (
                <div className="mt-4 bg-red-900/10 border border-red-900/30 rounded-xl px-5 py-3 text-red-400 text-sm">
                  {(createBooking.error as any)?.response?.data?.error ?? 'Booking failed. Please try again.'}
                </div>
              )}

              <button
                onClick={() => createBooking.mutate()}
                disabled={!canAfford || selectionConflicts || availabilityError || createBooking.isPending}
                className="w-full mt-6 bg-dome text-black font-semibold py-3.5 rounded-xl hover:bg-dome-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-display text-sm tracking-wide"
              >
                {createBooking.isPending ? 'Securing your session…' : `Request ${repeatEnabled ? `${repeatWeeks} sessions` : 'this session'} · $${grandTotal.toFixed(2)} studio credit →`}
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="sticky bottom-0 z-10 -mx-6 mt-6 flex justify-between border-t border-studio-border bg-studio-bg/95 px-6 py-4 backdrop-blur-xl">
          <button
                onClick={() => setStep(visibleSteps[stepIndex - 1])}
            disabled={stepIndex === 0}
            className="px-5 py-2.5 text-sm text-zinc-500 hover:text-white transition-colors disabled:opacity-0"
          >
            ← Back
          </button>
          {step !== 'confirm' && (
            <button
              onClick={() => setStep(visibleSteps[stepIndex + 1])}
              disabled={!canProceed()}
              className="px-6 py-2.5 text-sm bg-dome text-black font-semibold rounded-xl hover:bg-dome-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {STEP_CTA[step as Exclude<Step, 'confirm'>]} →
            </button>
          )}
        </div>
      </main>
    
    </div>
  );
}
