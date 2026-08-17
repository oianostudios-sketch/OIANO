import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Calendar, CreditCard, UploadCloud, Download } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { fmtTime, fmtDateLong, fmtDuration } from '../lib/fmt';
import MessageThread from '../components/MessageThread';
import ArtistReviewForm from '../components/ArtistReviewForm';
import { useToast } from '../components/Toast';
import { BookingStatus, STATUS_TAILWIND, STATUS_DOT_TAILWIND, STATUS_MESSAGE } from '../lib/bookingStatus';


// ── Stripe pay button ─────────────────────────────────────────────────────────
function StripePayButton({ bookingId }: { bookingId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handlePay() {
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/payments/stripe/checkout-session', { booking_id: bookingId });
      if (data?.checkout_url) {
        window.location.href = data.checkout_url; // redirect to Stripe hosted checkout
      } else {
        setError('No checkout URL returned.');
      }
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Payment failed to initialise.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {error && (
        <p className="text-red-400 text-xs mb-3 font-mono">{error}</p>
      )}
      <button onClick={handlePay} disabled={loading}
        className="w-full py-3 rounded-lg font-semibold text-sm transition-all"
        style={{
          background: loading ? '#1a1a1a' : '#5A9BCB',
          color: loading ? '#555' : '#000',
          border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          letterSpacing: '0.04em',
        }}>
        {loading
          ? 'Redirecting to checkout…'
          : <span className="inline-flex items-center gap-2"><CreditCard size={15} strokeWidth={2} /> Pay with Stripe</span>}
      </button>
      <p className="text-zinc-600 text-xs text-center mt-2">Secured by Stripe · You'll be redirected to complete payment</p>
    </div>
  );
}


export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle Stripe redirect back
  const paymentResult = searchParams.get('payment');
  useEffect(() => {
    if (paymentResult === 'success') {
      toast.success('Payment received! Your booking is confirmed.');
      setSearchParams({}, { replace: true });
      qc.invalidateQueries({ queryKey: ['booking', id] });
    } else if (paymentResult === 'cancelled') {
      toast.error('Payment cancelled. Your booking is still pending.');
      setSearchParams({}, { replace: true });
    }
  }, [paymentResult]);
  const { user } = useAuthStore();
  const toast = useToast();
  const qc = useQueryClient();
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dawLinked, setDawLinked] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [deliverUrls, setDeliverUrls] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleStart, setRescheduleStart] = useState('');
  const [rescheduleEnd, setRescheduleEnd] = useState('');
  const [policyOpen, setPolicyOpen] = useState(false);

  const reschedule = useMutation({
    mutationFn: () => {
      const starts_at = new Date(`${rescheduleDate}T${rescheduleStart}`).toISOString();
      const ends_at   = new Date(`${rescheduleDate}T${rescheduleEnd}`).toISOString();
      return api.patch(`/bookings/${id}/reschedule`, { starts_at, ends_at });
    },
    onSuccess: () => {
      toast.success('Booking rescheduled');
      setRescheduleOpen(false);
      qc.invalidateQueries({ queryKey: ['booking', id] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Reschedule failed'),
  });

  const deliver = useMutation({
    mutationFn: () => api.post(`/bookings/${id}/deliver`, {
      file_urls: deliverUrls.split('\n').map(s => s.trim()).filter(Boolean),
      notes: deliveryNotes.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success('Files delivered — artist notified');
      setDeliverOpen(false);
      setDeliveryNotes('');
      qc.invalidateQueries({ queryKey: ['booking', id] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Delivery failed'),
  });

  const reviewDeliverable = useMutation({
    mutationFn: ({ deliverableId, decision }: { deliverableId: string; decision: 'APPROVED' | 'CHANGES_REQUESTED' }) =>
      api.patch(`/bookings/${id}/deliverables/${deliverableId}/review`, { decision, note: reviewNote || undefined }),
    onSuccess: (_response, variables) => {
      toast.success(variables.decision === 'APPROVED' ? 'Deliverable approved' : 'Revision request sent');
      setReviewNote('');
      qc.invalidateQueries({ queryKey: ['booking', id] });
    },
    onError: (error: any) => toast.error(error?.response?.data?.error ?? 'Review could not be saved'),
  });

  const backTo = user?.role === 'STUDIO_ADMIN' ? '/admin' : '/dashboard';

  const { data: booking, isLoading } = useQuery({
    queryKey: ['booking', id],
    queryFn: async () => (await api.get(`/bookings/${id}`)).data,
    enabled: !!id,
  });

  const canDeliver = (user?.role === 'ENGINEER' || user?.role === 'STUDIO_ADMIN')
    && ['CONFIRMED','IN_PROGRESS','COMPLETED'].includes(booking?.status ?? '');
  async function shareCard() {
    if (!id || sharing) return;
    setSharing(true);
    try {
      const token = (api.defaults.headers?.common?.['Authorization'] as string ?? '').replace('Bearer ', '');
      const res = await fetch(`/api/bookings/${id}/card.png`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Card fetch failed');
      const blob = await res.blob();
      const file = new File([blob], `session-${id.slice(0, 8)}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Studio Session — OIANO', text: `${booking?.artist?.name ?? 'Session'} at Dreamz Music Lab` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = file.name; a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } finally { setSharing(false); }
  }

  if (isLoading) return (
    <div className="min-h-screen bg-studio-bg flex items-center justify-center">
      <div className="text-zinc-500 text-sm">Loading…</div>
    </div>
  );

  if (!booking) return (
    <div className="min-h-screen bg-studio-bg flex items-center justify-center">
      <div className="text-center">
        <p className="text-zinc-500 text-sm">Booking not found.</p>
        <button onClick={() => navigate(backTo)} className="mt-4 text-dome text-sm hover:text-dome-light">← Back</button>
      </div>
    </div>
  );

  const showThread = ['PENDING','CONFIRMED','IN_PROGRESS','COMPLETED'].includes(booking.status);
  const showReview = user?.role === 'ARTIST' && booking.status === 'COMPLETED' && booking.engineer;

  return (
    <div className="min-h-screen bg-studio-bg text-white">
      <header className="border-b border-studio-border px-6 py-4 flex items-center justify-between sticky top-0 bg-studio-bg z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(backTo)} className="text-zinc-500 hover:text-white text-sm transition-colors">← Back</button>
          <h1 className="font-display text-xl text-dome font-semibold animate-heading">Booking Detail</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Link DAW — downloads a pre-filled watcher.config.json for apps/watcher */}
          {['CONFIRMED','IN_PROGRESS'].includes(booking?.status ?? '') && (
            <button
              onClick={() => {
                const token = useAuthStore.getState().token ?? '';
                const cfg = {
                  api_url:    window.location.origin,
                  token,
                  artist_id:  booking.artist?.id ?? '',
                  session_id: booking.id,
                  watch_path: '',
                  extensions: ['.flp','.wav','.mp3','.aiff','.aif','.ogg','.mid','.als','.logic','.zip'],
                  debounce_ms: 2000,
                  _instructions: 'Set watch_path to your DAW project folder, then run: node watcher.js in apps/watcher/',
                  _fl_studio_path: 'C:\\Users\\YourName\\Documents\\Image-Line\\FL Studio\\Projects',
                };
                const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'watcher.config.json';
                a.click();
                URL.revokeObjectURL(a.href);
                setDawLinked(true);
                setTimeout(() => setDawLinked(false), 3000);
              }}
              title="Download a config file that auto-uploads your DAW project files to the studio — run it with node watcher.js in apps/watcher/"
              className="flex items-center gap-2 text-xs border border-studio-border text-zinc-400 px-3 py-1.5 rounded-lg hover:border-blue-500/40 hover:text-blue-400 transition-colors"
            >
              {dawLinked
                ? <span className="text-blue-400">Config downloaded ↓</span>
                : <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77a5.07 5.07 0 0 0-.09-3.77S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
                    </svg>
                    Link DAW
                  </>}
            </button>
          )}
          <button onClick={shareCard} disabled={sharing}
            className="flex items-center gap-2 text-xs border border-studio-border text-zinc-400 px-3 py-1.5 rounded-lg hover:border-dome/40 hover:text-dome transition-colors disabled:opacity-40">
            {sharing ? <span className="animate-pulse">Preparing…</span>
              : copied ? <span className="text-green-400">Link copied</span>
              : <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                  Share card
                </>}
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-6">

        {/* Status */}
        <div className={`rounded-xl border px-6 py-5 animate-surface ${STATUS_TAILWIND[booking.status as BookingStatus] ?? 'border-studio-border'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="label-mono flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT_TAILWIND[booking.status as BookingStatus] ?? 'bg-zinc-500'}`} />
              Status
            </p>
            <span className="text-sm font-semibold font-mono">{booking.status}</span>
          </div>
          <p className="text-sm opacity-80">{STATUS_MESSAGE[booking.status as BookingStatus] ?? booking.status}</p>
        </div>

        {/* Project context — the one connection (Booking -> Project -> Producer)
            that already exists in the data but was invisible everywhere in the
            UI. Only a link when the viewer is the owning producer: /producer/
            projects/:id is scoped server-side to the requesting producer's own
            projects, so linking it for other roles would just 404. */}
        {booking.project && (
          user?.role === 'PRODUCER' ? (
            <Link
              to={`/producer/projects/${booking.project.id}`}
              className="flex items-center justify-between rounded-xl border border-purple-500/20 bg-purple-500/5 px-5 py-3.5 hover:bg-purple-500/10 transition-colors"
            >
              <span className="text-sm text-zinc-300">
                Part of project <span className="text-purple-300 font-medium">{booking.project.title}</span>
                {booking.project.producer?.name ? <span className="text-zinc-500"> · {booking.project.producer.name}</span> : null}
              </span>
              <span className="text-xs text-purple-300">View project →</span>
            </Link>
          ) : user?.role === 'ARTIST' ? (
            <Link
              to="/projects"
              className="flex items-center justify-between rounded-xl border border-purple-500/20 bg-purple-500/5 px-5 py-3.5 hover:bg-purple-500/10 transition-colors"
            >
              <span className="text-sm text-zinc-300">
                Part of project <span className="text-purple-300 font-medium">{booking.project.title}</span>
                {booking.project.producer?.name ? <span className="text-zinc-500"> · produced by {booking.project.producer.name}</span> : null}
              </span>
              <span className="text-xs text-purple-300">Open projects →</span>
            </Link>
          ) : (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 px-5 py-3.5">
              <span className="text-sm text-zinc-300">
                Part of project <span className="text-purple-300 font-medium">{booking.project.title}</span>
                {booking.project.producer?.name ? <span className="text-zinc-500"> · produced by {booking.project.producer.name}</span> : null}
              </span>
            </div>
          )
        )}

        {/* Session details */}
        <div className="bg-studio-surface border border-studio-border rounded-xl p-6 animate-surface-1">
          <p className="label-mono mb-5 flex items-center gap-2"><Calendar size={12} strokeWidth={2} /> Session details</p>
          <div className="space-y-4">
            {[
              { label: 'Date',     value: fmtDateLong(booking.starts_at) },
              { label: 'Time',     value: `${fmtTime(booking.starts_at)} → ${fmtTime(booking.ends_at)} (${fmtDuration(booking.starts_at, booking.ends_at)})` },
              { label: 'Room',     value: booking.room?.name ?? '—' },
              { label: 'Service',  value: booking.service?.name ?? '—' },
              { label: 'Engineer', value: booking.engineer?.name ?? 'Assigned by studio' },
            ].map((row) => (
              <div key={row.label} className="flex justify-between text-sm border-b border-studio-border pb-4 last:border-0 last:pb-0">
                <span className="text-zinc-500">{row.label}</span>
                <span className="text-white text-right max-w-[60%]">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Payment */}
        <div className="bg-studio-surface border border-studio-border rounded-xl p-6 animate-surface-2">
          <p className="label-mono mb-5 flex items-center gap-2"><CreditCard size={12} strokeWidth={2} /> Payment</p>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-zinc-500 text-xs">Total</p>
              <p className="metric-number animate-metric text-3xl text-white mt-1">${Number(booking.total_usd ?? 0).toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-zinc-500 text-xs">Payment status</p>
              <span className={`text-sm font-medium font-mono ${
                booking.payment?.status === 'PAID' ? 'text-green-400' :
                booking.payment?.status === 'PARTIAL' ? 'text-yellow-400' : 'text-zinc-400'
              }`}>{booking.payment?.status ?? 'UNPAID'}</span>
            </div>
          </div>

          {/* Stripe pay button — shown to artist when booking is unpaid/partial */}
          {user?.role === 'ARTIST' && booking.payment?.status !== 'PAID' && (
            <div className="mt-5 pt-5 border-t border-studio-border">
              <StripePayButton bookingId={booking.id} />
            </div>
          )}
        </div>

        {/* Artist info (admin view) */}
        {user?.role === 'STUDIO_ADMIN' && booking.artist && (
          <div className="bg-studio-surface border border-studio-border rounded-xl p-6 animate-surface-3">
            <p className="label-mono mb-4">Artist</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium">{booking.artist.name}</p>
                {booking.artist.alias && <p className="text-dome text-xs mt-0.5">{booking.artist.alias}</p>}
              </div>
              <button onClick={() => navigate(`/artists/${booking.artist.id}`)}
                className="text-xs bg-dome/10 border border-dome/20 text-dome px-3 py-1.5 rounded-lg hover:bg-dome/20 transition-colors">
                View profile
              </button>
            </div>
          </div>
        )}

        {/* Notes */}
        {booking.notes && (
          <div className="bg-studio-surface border border-studio-border rounded-xl p-6">
            <p className="label-mono mb-3">Notes</p>
            <p className="text-zinc-300 text-sm leading-relaxed">{booking.notes}</p>
          </div>
        )}

        {/* ── A: Message thread ── */}
        {showThread && id && (
          <MessageThread
            variant="booking"
            endpoint={`/bookings/${id}/messages`}
            queryKey={['booking-messages', id]}
            sseMatch={(e) => e?.type === 'booking_message' && e?.booking_id === id}
            title="Session thread"
            emptyTitle="No messages yet."
            emptySubtitle="Start the conversation — reference tracks, session goals, anything."
            placeholder="Reference tracks, goals, questions…"
          />
        )}

        {/* ── B: Artist review ── */}
        {showReview && id && (
          <ArtistReviewForm
            bookingId={id}
            engineerName={booking.engineer.name}
            existing={{
              artist_rating:      booking.session_log?.artist_rating ?? null,
              artist_testimonial: booking.session_log?.artist_testimonial ?? null,
            }}
          />
        )}

        {/* Session log (engineer notes) */}
        {booking.session_log && (booking.session_log.notes || (booking.session_log.tracks_worked_on)) && (
          <div className="rounded-xl border border-studio-border bg-studio-surface px-6 py-5 animate-surface">
            <p className="label-mono mb-3">Session Notes</p>
            {booking.session_log.notes && (
              <p className="text-zinc-300 text-sm whitespace-pre-wrap leading-relaxed mb-3">
                {booking.session_log.notes}
              </p>
            )}
            {booking.session_log.tracks_worked_on && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {booking.session_log.tracks_worked_on.split(',').map((t: string) => (
                  <span key={t.trim()} className="text-xs px-2 py-0.5 rounded-full bg-studio-bg border border-studio-border text-zinc-400 font-mono">
                    {t.trim()}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Session file delivery (engineer/admin) ── */}
        {canDeliver && (
          <div className="rounded-xl border border-studio-border bg-studio-surface px-6 py-5 animate-surface">
            <div className="flex items-center justify-between mb-3">
              <p className="label-mono flex items-center gap-2"><UploadCloud size={12} strokeWidth={2} /> Deliver Files</p>
              <button onClick={() => setDeliverOpen(o => !o)}
                className="text-xs text-dome border border-dome/30 px-3 py-1 rounded-lg hover:bg-dome/5 transition-colors">
                {deliverOpen ? 'Cancel' : booking?.session_log?.tracks_worked?.length ? 'Re-deliver' : 'Deliver to artist'}
              </button>
            </div>
            {/* Already delivered files */}
            {booking?.session_log?.tracks_worked?.length > 0 && !deliverOpen && (
              <div className="space-y-1.5">
                {booking.session_log.tracks_worked.map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-xs text-zinc-400 hover:text-dome transition-colors font-mono truncate">
                    <span className="text-zinc-600">↗</span>{url.split('/').pop() ?? `File ${i + 1}`}
                  </a>
                ))}
                <p className="text-zinc-700 text-xs mt-2">Artist has been notified</p>
              </div>
            )}
            {deliverOpen && (
              <div className="space-y-3">
                <p className="text-zinc-500 text-xs">Paste file URLs (one per line) — use R2 or any public link</p>
                <textarea
                  value={deliverUrls}
                  onChange={e => setDeliverUrls(e.target.value)}
                  placeholder="https://pub-xxx.r2.dev/files/track-master.wav&#10;https://pub-xxx.r2.dev/files/stems.zip"
                  rows={4}
                  className="w-full bg-studio-bg border border-studio-border text-white text-xs font-mono placeholder-zinc-700 rounded-lg px-3 py-2.5 focus:outline-none focus:border-dome resize-none"
                />
                <textarea value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)} placeholder="Version notes for the artist — what changed, what to review" rows={3} className="w-full bg-studio-bg border border-studio-border text-white text-xs placeholder-zinc-700 rounded-lg px-3 py-2.5 focus:outline-none focus:border-dome resize-none" />
                <button onClick={() => deliver.mutate()} disabled={!deliverUrls.trim() || deliver.isPending}
                  className="w-full bg-dome hover:bg-dome-light text-black font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-40">
                  {deliver.isPending ? 'Delivering…' : 'Deliver & notify artist →'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Artist approval workflow with immutable version history. */}
        {user?.role === 'ARTIST' && booking?.deliverables?.map((deliverable: any) => {
          const latest = deliverable.versions?.[0];
          return (
          <div key={deliverable.id} className="rounded-xl border border-dome/20 bg-dome/5 px-6 py-5 animate-surface">
            <div className="mb-4 flex items-start justify-between gap-4"><div><p className="label-mono text-dome flex items-center gap-2"><Download size={12} strokeWidth={2} /> {deliverable.title}</p><p className="mt-1 text-[10px] text-zinc-600">Version {deliverable.current_version} · {deliverable.status.replaceAll('_', ' ')}{deliverable.review_due_at && deliverable.status === 'PENDING_REVIEW' ? ` · review by ${new Date(deliverable.review_due_at).toLocaleDateString()}` : ''}</p></div><span className={`rounded-full border px-2.5 py-1 text-[9px] font-mono ${deliverable.status === 'APPROVED' ? 'border-emerald-500/20 text-emerald-400' : deliverable.status === 'CHANGES_REQUESTED' ? 'border-orange-500/20 text-orange-400' : 'border-dome/20 text-dome'}`}>{deliverable.status.replaceAll('_', ' ')}</span></div>
            <div className="space-y-2">{latest?.file_urls?.map((url: string, index: number) => <a key={url} href={url} target="_blank" rel="noreferrer" download className="flex items-center gap-2 truncate font-mono text-sm text-dome hover:text-dome-light"><Download size={13}/>{url.split('/').pop() ?? `File ${index + 1}`}</a>)}</div>
            {latest?.notes && <p className="mt-4 rounded-lg border border-white/[.05] bg-black/20 p-3 text-xs leading-5 text-zinc-500">{latest.notes}</p>}
            {deliverable.status !== 'APPROVED' && <div className="mt-5 border-t border-white/[.06] pt-4"><textarea value={reviewNote} onChange={event => setReviewNote(event.target.value)} placeholder="Revision notes (required when requesting changes)" rows={3} className="w-full resize-none rounded-lg border border-studio-border bg-studio-bg px-3 py-2.5 text-xs text-white outline-none focus:border-dome"/><div className="mt-3 flex gap-2"><button onClick={() => reviewDeliverable.mutate({ deliverableId: deliverable.id, decision: 'APPROVED' })} disabled={reviewDeliverable.isPending} className="flex-1 rounded-lg bg-emerald-500 px-3 py-2.5 text-xs font-semibold text-black disabled:opacity-40">Approve version {deliverable.current_version}</button><button onClick={() => reviewDeliverable.mutate({ deliverableId: deliverable.id, decision: 'CHANGES_REQUESTED' })} disabled={!reviewNote.trim() || reviewDeliverable.isPending} className="flex-1 rounded-lg border border-orange-500/25 px-3 py-2.5 text-xs text-orange-400 disabled:opacity-40">Request changes</button></div></div>}
            {deliverable.versions?.length > 1 && <details className="mt-4 border-t border-white/[.06] pt-3"><summary className="cursor-pointer text-[10px] text-zinc-600">Version history · {deliverable.versions.length} versions</summary><div className="mt-3 space-y-2">{deliverable.versions.slice(1).map((version: any) => <div key={version.id} className="rounded-lg border border-white/[.05] p-3"><p className="text-[10px] text-zinc-500">Version {version.version_number} · {new Date(version.created_at).toLocaleDateString()}</p><p className="mt-1 text-[9px] text-zinc-700">{version.file_urls.length} file{version.file_urls.length === 1 ? '' : 's'}</p></div>)}</div></details>}
            {deliverable.reviews?.length > 0 && <details className="mt-3 border-t border-white/[.06] pt-3"><summary className="cursor-pointer text-[10px] text-zinc-600">Decision history · {deliverable.reviews.length}</summary><div className="mt-3 space-y-2">{deliverable.reviews.map((review: any) => <div key={review.id} className="rounded-lg border border-white/[.05] p-3"><p className="text-[10px] text-zinc-400">Version {review.version_number} · {review.decision.replaceAll('_', ' ')}</p>{review.note && <p className="mt-1 text-xs leading-5 text-zinc-600">{review.note}</p>}<p className="mt-1 text-[9px] text-zinc-700">{new Date(review.created_at).toLocaleString()}</p></div>)}</div></details>}
          </div>
          );
        })}

        {/* Legacy deliveries created before version tracking. */}
        {user?.role === 'ARTIST' && !booking?.deliverables?.length && booking?.session_log?.tracks_worked?.length > 0 && (
          <div className="rounded-xl border border-dome/20 bg-dome/5 px-6 py-5 animate-surface">
            <p className="label-mono text-dome mb-3 flex items-center gap-2"><Download size={12} strokeWidth={2} /> Your Files Are Ready</p>
            <div className="space-y-2">
              {booking.session_log.tracks_worked.map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" download
                  className="flex items-center gap-2 text-sm text-dome hover:text-dome-light transition-colors font-mono truncate">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                  </svg>
                  {url.split('/').pop() ?? `File ${i + 1}`}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Artist: reschedule button */}
        {user?.role === 'ARTIST' && ['PENDING','CONFIRMED'].includes(booking.status) && (
          <div>
            <button
              onClick={() => {
                const s = new Date(booking.starts_at);
                const e = new Date(booking.ends_at);
                setRescheduleDate(s.toISOString().slice(0,10));
                setRescheduleStart(s.toTimeString().slice(0,5));
                setRescheduleEnd(e.toTimeString().slice(0,5));
                setRescheduleOpen(true);
              }}
              className="w-full py-3 rounded-xl border border-studio-border text-zinc-400 text-sm hover:border-dome/30 hover:text-dome transition-colors"
            >
              Reschedule this booking
            </button>
          </div>
        )}

        {/* Cancellation & policy */}
        <div className="rounded-xl border border-studio-border bg-studio-surface">
          <button
            onClick={() => setPolicyOpen(p => !p)}
            className="w-full flex items-center justify-between px-5 py-4 text-left"
          >
            <span className="text-zinc-400 text-sm font-medium">Cancellation & Rescheduling Policy</span>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: policyOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: '#555' }}
            >
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          {policyOpen && (
            <div className="px-5 pb-5 space-y-3 text-sm text-zinc-500 border-t border-studio-border pt-4">
              <p>We know life as an artist is unpredictable. Here's how we handle changes:</p>
              <div className="space-y-2">
                <div className="flex gap-3">
                  <span className="text-dome font-mono text-xs mt-0.5">72h+</span>
                  <span>Cancel or reschedule with no fee. Your credits are returned in full.</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-dome font-mono text-xs mt-0.5">48h</span>
                  <span>50% of session credits are retained. The rest return to your wallet.</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-dome font-mono text-xs mt-0.5">24h</span>
                  <span>Last-minute cancellations retain the full session cost. Reach out to the studio if there's an emergency — we're human.</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-dome font-mono text-xs mt-0.5">Now</span>
                  <span>Use the Reschedule button above to move to a new slot at no extra charge (72h+ notice). The studio is always on your side.</span>
                </div>
              </div>
              <p className="text-zinc-600 text-xs pt-1">Rescheduling is always free with sufficient notice. Contact the studio directly for anything not covered here.</p>
            </div>
          )}
        </div>

        {/* Rebook + receipt */}
        <div className="flex gap-3">
          {booking.status === 'COMPLETED' && (
            <Link
              to={`/book?rebook=${booking.id}`}
              className="flex-1 text-center py-3 rounded-xl border border-dome/30 text-dome text-sm font-semibold hover:bg-dome/5 transition-colors font-display"
            >
              Rebook this session
            </Link>
          )}
          {['CONFIRMED','COMPLETED'].includes(booking.status) && (
            <Link
              to={`/receipt/${booking.id}`}
              className="flex-1 text-center py-3 rounded-xl border border-studio-border text-zinc-400 text-sm hover:border-zinc-600 hover:text-white transition-colors"
            >
              View receipt
            </Link>
          )}
        </div>

      </main>

      {/* Reschedule modal */}
      {rescheduleOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setRescheduleOpen(false)}
        >
          <div
            className="bg-studio-surface border border-studio-border rounded-2xl p-6 w-full max-w-sm"
            onClick={e => e.stopPropagation()}
          >
            <p className="font-display text-lg text-white mb-1">Reschedule Session</p>
            <p className="text-zinc-500 text-xs mb-5">Pick a new date and time for this booking. The room stays the same.</p>
            <div className="space-y-4">
              <div>
                <label className="label-mono text-zinc-500 block mb-1.5">Date</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  min={new Date().toISOString().slice(0,10)}
                  onChange={e => setRescheduleDate(e.target.value)}
                  className="w-full bg-studio-bg border border-studio-border text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-dome"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-mono text-zinc-500 block mb-1.5">Start time</label>
                  <input
                    type="time"
                    value={rescheduleStart}
                    onChange={e => setRescheduleStart(e.target.value)}
                    className="w-full bg-studio-bg border border-studio-border text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-dome"
                  />
                </div>
                <div>
                  <label className="label-mono text-zinc-500 block mb-1.5">End time</label>
                  <input
                    type="time"
                    value={rescheduleEnd}
                    onChange={e => setRescheduleEnd(e.target.value)}
                    className="w-full bg-studio-bg border border-studio-border text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-dome"
                  />
                </div>
              </div>
            </div>
            <button
              onClick={() => reschedule.mutate()}
              disabled={!rescheduleDate || !rescheduleStart || !rescheduleEnd || reschedule.isPending}
              className="w-full mt-5 py-3 bg-dome hover:bg-dome-light text-black font-semibold text-sm rounded-xl transition-colors disabled:opacity-40"
            >
              {reschedule.isPending ? 'Rescheduling…' : 'Confirm new time →'}
            </button>
            <button
              onClick={() => setRescheduleOpen(false)}
              className="w-full mt-2 py-2 text-zinc-500 text-xs hover:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
