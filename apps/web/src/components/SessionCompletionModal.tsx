import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Plus, X } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './Toast';
import Modal from './Modal';
import { fmtDateLong, fmtTime } from '../lib/fmt';

const CREDIT_ROLES = [
  'FEATURED_ARTIST', 'PRODUCER', 'ENGINEER', 'SONGWRITER', 'COMPOSER',
  'MIX_ENGINEER', 'MASTERING_ENGINEER', 'MANAGER', 'OTHER',
] as const;

const HOLDER_TYPES = ['ARTIST', 'PRODUCER', 'PARTICIPANT'] as const;

interface CreditRow { credited_name: string; role: typeof CREDIT_ROLES[number]; scope: string }
interface ShareRow { holder_name: string; holder_type: typeof HOLDER_TYPES[number]; holder_ref_id: string; role: string; percentage: string }

interface SessionCompletionModalProps {
  booking: {
    id: string;
    status: string;
    starts_at: string;
    ends_at: string;
    project_id: string | null;
    artist?: { id?: string; name?: string } | null;
    room?: { name?: string } | null;
    engineer?: { name?: string } | null;
    service?: { name?: string } | null;
    project?: {
      producer?: { id: string; name: string; alias?: string | null } | null;
      participants?: Array<{ id: string; display_name: string; participant_ref_id?: string | null }>;
    } | null;
  };
  onClose: () => void;
}

const inputClass = 'w-full bg-studio-bg border border-studio-border text-white text-sm placeholder-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:border-dome';
const labelClass = 'label-mono text-zinc-500 mb-1.5 block';

export default function SessionCompletionModal({ booking, onClose }: SessionCompletionModalProps) {
  const toast = useToast();
  const qc = useQueryClient();
  const hasProject = !!booking.project_id;
  const idempotencyKey = useRef(crypto.randomUUID());

  const [filesProduced, setFilesProduced] = useState(false);
  const [fileUrls, setFileUrls] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'STUDIO_ONLY'>('STUDIO_ONLY');

  const [creditsOpen, setCreditsOpen] = useState(false);
  const [credits, setCredits] = useState<CreditRow[]>([
    { credited_name: booking.artist?.name ?? '', role: 'FEATURED_ARTIST', scope: '' },
    { credited_name: booking.engineer?.name ?? '', role: 'ENGINEER', scope: '' },
  ]);

  const [rightsOpen, setRightsOpen] = useState(false);
  const [agreementType, setAgreementType] = useState<'MASTER' | 'PUBLISHING'>('MASTER');
  const [shares, setShares] = useState<ShareRow[]>([
    { holder_name: booking.artist?.name ?? '', holder_type: 'ARTIST', holder_ref_id: booking.artist?.id ?? '', role: 'Primary Artist', percentage: '' },
    { holder_name: booking.project?.producer?.alias ?? booking.project?.producer?.name ?? '', holder_type: 'PRODUCER', holder_ref_id: booking.project?.producer?.id ?? '', role: 'Producer', percentage: '' },
  ]);

  const rightsHolders = [
    ...(booking.artist?.id ? [{ key: `ARTIST:${booking.artist.id}`, type: 'ARTIST' as const, ref: booking.artist.id, name: booking.artist.name ?? 'Primary artist' }] : []),
    ...(booking.project?.producer?.id ? [{ key: `PRODUCER:${booking.project.producer.id}`, type: 'PRODUCER' as const, ref: booking.project.producer.id, name: booking.project.producer.alias ?? booking.project.producer.name }] : []),
    ...(booking.project?.participants ?? []).map(participant => ({ key: `PARTICIPANT:${participant.id}`, type: 'PARTICIPANT' as const, ref: participant.id, name: participant.display_name })),
  ];

  const [notes, setNotes] = useState('');
  const [qualityRating, setQualityRating] = useState<number | null>(null);
  const [tracksWorked, setTracksWorked] = useState('');

  const shareTotal = shares.reduce((sum, s) => sum + (parseFloat(s.percentage) || 0), 0);
  const sharesValid = Math.abs(shareTotal - 100) < 0.01;
  const validShares = shares.filter((s) => s.holder_name.trim() && s.holder_ref_id && s.percentage.trim());
  const rightsValid = !rightsOpen || (validShares.length >= 2 && sharesValid);

  const complete = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {};

      if (filesProduced) {
        const urls = fileUrls.split('\n').map((s) => s.trim()).filter(Boolean);
        if (urls.length) {
          payload.deliverables = { file_urls: urls, notes: deliveryNotes.trim() || undefined, visibility };
        }
      }

      if (hasProject && creditsOpen) {
        const rows = credits.filter((c) => c.credited_name.trim());
        if (rows.length) {
          payload.credits = rows.map((c) => ({ credited_name: c.credited_name.trim(), role: c.role, scope: c.scope.trim() || undefined }));
        }
      }

      if (hasProject && rightsOpen) {
        if (!rightsValid) throw new Error('Complete at least two rights holders totalling 100%');
        payload.rights = {
          agreement_type: agreementType,
          shares: validShares.map((s) => ({ holder_name: s.holder_name.trim(), holder_type: s.holder_type, holder_ref_id: s.holder_ref_id, role: s.role.trim() || 'Contributor', percentage: parseFloat(s.percentage) })),
        };
      }

      if (notes.trim() || qualityRating || tracksWorked.trim()) {
        payload.session_notes = {
          notes: notes.trim() || undefined,
          quality_rating: qualityRating ?? undefined,
          tracks_worked: tracksWorked.trim() ? tracksWorked.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        };
      }

      return api.post(`/bookings/${booking.id}/complete`, payload, {
        headers: { 'Idempotency-Key': idempotencyKey.current },
      });
    },
    onSuccess: () => {
      toast.success('Session marked complete');
      qc.invalidateQueries({ queryKey: ['booking', booking.id] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Could not complete session'),
  });

  function updateCredit(i: number, patch: Partial<CreditRow>) {
    setCredits((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function updateShare(i: number, patch: Partial<ShareRow>) {
    setShares((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <Modal onClose={onClose} maxWidth={640} maxHeight="86vh" ariaLabel="Complete session">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-lg text-white font-semibold flex items-center gap-2">
          <CheckCircle2 size={18} strokeWidth={2} className="text-dome" /> Complete Session
        </h2>
        <button type="button" aria-label="Close session completion" onClick={onClose} className="text-zinc-600 hover:text-white transition-colors"><X size={18} /></button>
      </div>

      {/* Auto-inferred, read-only */}
      <p className="text-zinc-500 text-xs mb-6">
        {booking.artist?.name ?? 'Artist'} · {booking.service?.name ?? 'Session'} · {booking.room?.name ?? 'Room'}
        {booking.engineer?.name ? ` · ${booking.engineer.name}` : ''}
        <br />
        {fmtDateLong(booking.starts_at)}, {fmtTime(booking.starts_at)}–{fmtTime(booking.ends_at)}
      </p>

      <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">

        {/* Deliverables */}
        <section className="rounded-xl border border-studio-border bg-studio-surface px-5 py-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={filesProduced} onChange={(e) => setFilesProduced(e.target.checked)} className="accent-dome" />
            <span className="text-sm text-white font-medium">Files were produced this session</span>
          </label>
          {filesProduced && (
            <div className="mt-3 space-y-3">
              <div>
                <label className={labelClass}>File URLs (one per line)</label>
                <textarea value={fileUrls} onChange={(e) => setFileUrls(e.target.value)} rows={3}
                  placeholder="https://pub-xxx.r2.dev/files/track-master.wav" className={`${inputClass} font-mono resize-none`} />
              </div>
              <div>
                <label className={labelClass}>Delivery notes (optional)</label>
                <textarea value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} rows={2}
                  placeholder="What changed, what to review" className={`${inputClass} resize-none`} />
              </div>
              <div>
                <label className={labelClass}>Visibility</label>
                <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'PRIVATE' | 'STUDIO_ONLY')} className={inputClass}>
                  <option value="STUDIO_ONLY">Studio only</option>
                  <option value="PRIVATE">Private</option>
                </select>
                <p className="text-zinc-700 text-[10px] mt-1">Making this public on the artist's Passport is the artist's own decision, made later — not set here.</p>
              </div>
            </div>
          )}
        </section>

        {/* Credits */}
        {hasProject && (
          <section className="rounded-xl border border-studio-border bg-studio-surface px-5 py-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={creditsOpen} onChange={(e) => setCreditsOpen(e.target.checked)} className="accent-dome" />
              <span className="text-sm text-white font-medium">Record credits for this session</span>
            </label>
            {creditsOpen && (
              <div className="mt-3 space-y-2">
                {credits.map((c, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <input value={c.credited_name} onChange={(e) => updateCredit(i, { credited_name: e.target.value })}
                      placeholder="Name" className={`${inputClass} flex-1`} />
                    <select value={c.role} onChange={(e) => updateCredit(i, { role: e.target.value as CreditRow['role'] })} className={`${inputClass} w-40`}>
                      {CREDIT_ROLES.map((r) => <option key={r} value={r}>{r.replaceAll('_', ' ')}</option>)}
                    </select>
                    <input value={c.scope} onChange={(e) => updateCredit(i, { scope: e.target.value })}
                      placeholder="Scope (optional)" className={`${inputClass} w-32`} />
                    <button type="button" aria-label={`Remove credit for ${c.credited_name || `row ${i + 1}`}`} onClick={() => setCredits((rows) => rows.filter((_, idx) => idx !== i))}
                      className="text-zinc-600 hover:text-red-400 mt-2"><X size={14} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setCredits((rows) => [...rows, { credited_name: '', role: 'OTHER', scope: '' }])}
                  className="text-xs text-dome flex items-center gap-1 mt-1"><Plus size={12} /> Add credit</button>
                <p className="text-zinc-700 text-[10px]">Credits are recorded as drafts — the artist or producer confirms them before they're final.</p>
              </div>
            )}
          </section>
        )}

        {/* Rights */}
        {hasProject && (
          <section className="rounded-xl border border-studio-border bg-studio-surface px-5 py-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={rightsOpen} onChange={(e) => setRightsOpen(e.target.checked)} className="accent-dome" />
              <span className="text-sm text-white font-medium">Propose a rights split for this session's output</span>
            </label>
            {rightsOpen && (
              <div className="mt-3 space-y-3">
                <select value={agreementType} onChange={(e) => setAgreementType(e.target.value as 'MASTER' | 'PUBLISHING')} className={inputClass}>
                  <option value="MASTER">Master</option>
                  <option value="PUBLISHING">Publishing</option>
                </select>
                {shares.map((s, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <select value={s.holder_ref_id ? `${s.holder_type}:${s.holder_ref_id}` : ''} onChange={(e) => {
                      const holder = rightsHolders.find(option => option.key === e.target.value);
                      if (holder) updateShare(i, { holder_name: holder.name, holder_type: holder.type, holder_ref_id: holder.ref });
                    }} className={`${inputClass} flex-1`}>
                      <option value="">Choose an OIANO identity</option>
                      {rightsHolders.map((holder) => <option key={holder.key} value={holder.key}>{holder.name} · {holder.type.toLowerCase()}</option>)}
                    </select>
                    <input value={s.role} onChange={(e) => updateShare(i, { role: e.target.value })}
                      placeholder="Role" className={`${inputClass} w-28`} />
                    <input value={s.percentage} onChange={(e) => updateShare(i, { percentage: e.target.value.replace(/[^0-9.]/g, '') })}
                      placeholder="%" className={`${inputClass} w-16 text-right`} />
                    <button type="button" aria-label={`Remove rights holder ${s.holder_name || `row ${i + 1}`}`} onClick={() => setShares((rows) => rows.filter((_, idx) => idx !== i))}
                      className="text-zinc-600 hover:text-red-400 mt-2"><X size={14} /></button>
                  </div>
                ))}
                <div>
                  <div className="flex items-center justify-between">
                    <button type="button" onClick={() => setShares((rows) => [...rows, { holder_name: '', holder_type: 'PARTICIPANT', holder_ref_id: '', role: '', percentage: '' }])}
                      className="text-xs text-dome flex items-center gap-1"><Plus size={12} /> Add holder</button>
                    <span className={`text-xs font-mono ${sharesValid ? 'text-emerald-400' : 'text-orange-400'}`}>{shareTotal.toFixed(1)}% of 100%</span>
                  </div>
                  <div className="meter mt-2">
                    <div className="meter-fill" style={{ width: `${Math.min(100, shareTotal)}%`, '--signal': sharesValid ? '#34d399' : '#fb923c' } as React.CSSProperties} />
                  </div>
                </div>
                {!rightsValid && <p className="text-orange-400 text-[10px]">Add at least two complete holders whose shares total exactly 100%.</p>}
                <p className="text-zinc-700 text-[10px]">Every holder is linked to an accepted OIANO identity and confirms their share separately. This record does not replace legal advice.</p>
              </div>
            )}
          </section>
        )}

        {/* Session notes */}
        <section className="rounded-xl border border-studio-border bg-studio-surface px-5 py-4">
          <p className="text-sm text-white font-medium mb-3">Session notes</p>
          <div className="space-y-3">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="How did the session go?" className={`${inputClass} resize-none`} />
            <div>
              <label className={labelClass}>Quality rating</label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" aria-pressed={qualityRating === n} aria-label={`Quality rating ${n} of 5`} onClick={() => setQualityRating(qualityRating === n ? null : n)}
                    className={`w-8 h-8 rounded-lg border text-xs font-mono transition-colors ${qualityRating === n ? 'bg-dome text-black border-dome' : 'border-studio-border text-zinc-500 hover:border-dome/40'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>Tracks worked (comma separated)</label>
              <input value={tracksWorked} onChange={(e) => setTracksWorked(e.target.value)}
                placeholder="Track 1, Track 2" className={inputClass} />
            </div>
          </div>
        </section>
      </div>

      <div className="flex gap-2 mt-5">
        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-studio-border text-zinc-400 text-sm hover:text-white transition-colors">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => complete.mutate()}
          disabled={complete.isPending || !rightsValid}
          className="flex-1 py-2.5 rounded-lg bg-dome hover:bg-dome-light text-black font-semibold text-sm transition-colors disabled:opacity-40"
        >
          {complete.isPending ? 'Completing…' : booking.status === 'COMPLETED' ? 'Save updates' : 'Complete session →'}
        </button>
      </div>
    </Modal>
  );
}
