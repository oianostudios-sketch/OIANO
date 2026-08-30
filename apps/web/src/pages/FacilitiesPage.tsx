import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Building2, CheckCircle2, ChevronRight, Plus, Wrench, X } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';

type OpenIssue = { id: string; severity: 'CRITICAL' | 'DEGRADED' | 'MINOR'; status: string; symptom: string };
type Room = { id: string; name: string; readiness: 'READY' | 'LIMITED' | 'OUT_OF_SERVICE'; open_issues: OpenIssue[] };
type Equipment = { id: string; name: string; type: string; serial: string | null; room: { id: string; name: string } | null; last_service_at: string | null; next_service_at: string | null; readiness: 'READY' | 'LIMITED' | 'OUT_OF_SERVICE'; open_issues: OpenIssue[] };
type Issue = {
  id: string; symptom: string; severity: OpenIssue['severity']; status: string; notes: string | null;
  created_at: string; resolved_at: string | null;
  room: { id: string; name: string } | null; equipment: { id: string; name: string } | null;
  reporter: { id: string; email: string }; assignee: { id: string; email: string } | null;
  booking: { id: string; starts_at: string; service: { name: string } } | null;
};

const READINESS_SIGNAL: Record<Room['readiness'], string> = { READY: '#4ade80', LIMITED: '#facc15', OUT_OF_SERVICE: '#f87171' };
const READINESS_LABEL: Record<Room['readiness'], string> = { READY: 'Ready', LIMITED: 'Limited', OUT_OF_SERVICE: 'Out of service' };
const SEVERITY_LABEL: Record<OpenIssue['severity'], string> = { CRITICAL: 'Cannot use', DEGRADED: 'Degraded', MINOR: 'Minor' };
const NEXT_STATUS: Record<string, { label: string; next: string } | null> = {
  REPORTED: { label: 'Assign to me', next: 'ASSIGNED' },
  ASSIGNED: { label: 'Start repair', next: 'REPAIRING' },
  REPAIRING: { label: 'Ready to verify', next: 'VERIFY' },
  VERIFY: { label: 'Confirm restored', next: 'RESTORED' },
  RESTORED: null,
};

function ReadinessDot({ readiness, live }: { readiness: Room['readiness']; live?: boolean }) {
  return <i className={`signal-dot${live ? ' signal-pulse' : ''}`} style={{ '--signal': READINESS_SIGNAL[readiness] } as CSSProperties} />;
}

export default function FacilitiesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [reportOpen, setReportOpen] = useState(false);
  const [flareIssueId, setFlareIssueId] = useState<string | null>(null);

  const { data: rooms = [], isLoading: roomsLoading } = useQuery<Room[]>({ queryKey: ['facilities-rooms'], queryFn: async () => (await api.get('/facilities/rooms')).data });
  const { data: equipment = [] } = useQuery<Equipment[]>({ queryKey: ['facilities-equipment'], queryFn: async () => (await api.get('/facilities/equipment')).data });
  const { data: issues = [] } = useQuery<Issue[]>({ queryKey: ['facilities-issues'], queryFn: async () => (await api.get('/facilities/issues')).data });

  // "Alive" means a real state transition animates once, then settles — see
  // the Studio Body Audit's motion principle. Not idle looping animation.
  useEffect(() => {
    function onSse(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === 'facility_issue_updated' && detail.issueId) {
        setFlareIssueId(detail.issueId);
        setTimeout(() => setFlareIssueId((current) => (current === detail.issueId ? null : current)), 1400);
      }
    }
    window.addEventListener('sse', onSse);
    return () => window.removeEventListener('sse', onSse);
  }, []);

  const advanceMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/facilities/issues/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facilities-rooms'] }); qc.invalidateQueries({ queryKey: ['facilities-equipment'] }); qc.invalidateQueries({ queryKey: ['facilities-issues'] }); },
    onError: () => toast.error('Could not update that issue.'),
  });

  const openIssues = useMemo(() => issues.filter((i) => i.status !== 'RESTORED'), [issues]);
  const attentionNow = useMemo(() => openIssues.filter((i) => i.status === 'REPORTED').sort((a, b) => (a.severity === 'CRITICAL' ? -1 : b.severity === 'CRITICAL' ? 1 : 0)), [openIssues]);
  const activeRepairs = useMemo(() => openIssues.filter((i) => ['ASSIGNED', 'REPAIRING', 'VERIFY'].includes(i.status)), [openIssues]);
  const recentlyRestored = useMemo(() => issues.filter((i) => i.status === 'RESTORED').slice(0, 5), [issues]);
  const isStudioReady = !roomsLoading && openIssues.length === 0;

  return (
    <main className="min-h-screen bg-studio-bg px-5 py-8 text-white md:px-8 md:py-10">
      <div className="mx-auto max-w-[1100px]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mb-3 text-[9px] font-mono uppercase tracking-[.28em] text-dome">Studio · Facilities</p>
            <h1 className="font-display text-3xl md:text-4xl">Can the studio work right now?</h1>
          </div>
          <button onClick={() => setReportOpen(true)} className="console-control flex items-center gap-2 rounded-xl border bg-white/[.03] px-4 py-2.5 text-xs text-zinc-200">
            <Plus size={14} /> Report issue
          </button>
        </div>

        {isStudioReady ? (
          <div className="mt-10 rounded-2xl border border-emerald-500/15 bg-emerald-500/[.03] p-10 text-center">
            <ReadinessDot readiness="READY" />
            <p className="mt-5 font-display text-2xl">Studio ready.</p>
            <p className="mt-2 text-sm text-zinc-600">No maintenance requiring attention.</p>
          </div>
        ) : (
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <article key={room.id} className="rounded-2xl border border-white/[.065] bg-studio-surface p-5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold"><Building2 size={14} className="text-dome" />{room.name}</span>
                  <ReadinessDot readiness={room.readiness} />
                </div>
                <p className="mt-3 text-[9px] font-mono uppercase tracking-wider" style={{ color: READINESS_SIGNAL[room.readiness] }}>{READINESS_LABEL[room.readiness]}</p>
                {room.open_issues[0] && <p className="mt-2 text-xs text-zinc-600">{room.open_issues[0].symptom}</p>}
              </article>
            ))}
          </div>
        )}

        {attentionNow.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-300"><AlertTriangle size={14} />Attention now</h2>
            <div className="space-y-2">
              {attentionNow.map((issue) => (
                <IssueRow key={issue.id} issue={issue} flare={flareIssueId === issue.id} onAdvance={(status) => advanceMutation.mutate({ id: issue.id, status })} />
              ))}
            </div>
          </section>
        )}

        {activeRepairs.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-dome"><Wrench size={14} />Being fixed</h2>
            <div className="space-y-2">
              {activeRepairs.map((issue) => (
                <IssueRow key={issue.id} issue={issue} flare={flareIssueId === issue.id} onAdvance={(status) => advanceMutation.mutate({ id: issue.id, status })} />
              ))}
            </div>
          </section>
        )}

        {recentlyRestored.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-500"><CheckCircle2 size={14} />Recently restored</h2>
            <div className="space-y-2 opacity-60">
              {recentlyRestored.map((issue) => <IssueRow key={issue.id} issue={issue} flare={false} onAdvance={() => {}} />)}
            </div>
          </section>
        )}

        {equipment.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-zinc-400">Equipment</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {equipment.map((item) => (
                <div key={item.id} className="rounded-xl border border-white/[.05] bg-studio-surface p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{item.name}</span>
                    <ReadinessDot readiness={item.readiness} />
                  </div>
                  <p className="mt-1 text-[9px] font-mono uppercase tracking-wider text-zinc-700">{item.type}{item.room ? ` · ${item.room.name}` : ''}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {reportOpen && (
        <ReportIssueModal
          rooms={rooms}
          equipment={equipment}
          onClose={() => setReportOpen(false)}
          onReported={() => { setReportOpen(false); qc.invalidateQueries({ queryKey: ['facilities-rooms'] }); qc.invalidateQueries({ queryKey: ['facilities-issues'] }); toast.success('Issue reported.'); }}
        />
      )}
    </main>
  );
}

function IssueRow({ issue, flare, onAdvance }: { issue: Issue; flare: boolean; onAdvance: (status: string) => void }) {
  const next = NEXT_STATUS[issue.status];
  return (
    <div className={`flex flex-wrap items-center gap-4 rounded-xl border p-4 transition-colors ${flare ? 'border-dome/40 bg-dome/[.06]' : 'border-white/[.05] bg-studio-surface'}`}>
      <i className="signal-dot" style={{ '--signal': issue.severity === 'CRITICAL' ? '#f87171' : issue.severity === 'DEGRADED' ? '#facc15' : '#71717a' } as CSSProperties} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{issue.room?.name ?? issue.equipment?.name ?? 'Facility'} — {issue.symptom}</p>
        <p className="mt-1 text-[9px] text-zinc-700">
          {SEVERITY_LABEL[issue.severity]} · reported by {issue.reporter.email}
          {issue.booking && ` · during ${issue.booking.service.name}`}
          {issue.assignee && ` · assigned to ${issue.assignee.email}`}
        </p>
      </div>
      {next && <button onClick={() => onAdvance(next.next)} className="console-control flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[10px] text-zinc-300">{next.label}<ChevronRight size={11} /></button>}
    </div>
  );
}

function ReportIssueModal({ rooms, equipment, onClose, onReported }: { rooms: Room[]; equipment: Equipment[]; onClose: () => void; onReported: () => void }) {
  const [targetId, setTargetId] = useState('');
  const [symptom, setSymptom] = useState('');
  const [severity, setSeverity] = useState<OpenIssue['severity'] | null>(null);
  const toast = useToast();

  const submit = useMutation({
    mutationFn: () => {
      const room = rooms.find((r) => r.id === targetId);
      const body = room ? { room_id: targetId, symptom, severity } : { equipment_id: targetId, symptom, severity };
      return api.post('/facilities/issues', body);
    },
    onSuccess: onReported,
    onError: () => toast.error('Could not submit that report.'),
  });

  return (
    <div role="dialog" aria-modal="true" onMouseDown={onClose} className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 px-4 pb-4 backdrop-blur-sm md:items-center">
      <div onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-white/[.1] bg-studio-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between"><h2 className="font-display text-xl">Report an issue</h2><button onClick={onClose}><X size={16} className="text-zinc-600" /></button></div>

        <p className="mt-5 text-[9px] font-mono uppercase tracking-wider text-zinc-600">What?</p>
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="mt-2 w-full rounded-lg border border-white/[.07] bg-[#08090b] p-2.5 text-xs text-zinc-200 outline-none">
          <option value="">Select a room or equipment…</option>
          <optgroup label="Rooms">{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
          {equipment.length > 0 && <optgroup label="Equipment">{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>}
        </select>

        <p className="mt-4 text-[9px] font-mono uppercase tracking-wider text-zinc-600">What happened?</p>
        <textarea value={symptom} onChange={(e) => setSymptom(e.target.value)} rows={2} maxLength={280} placeholder="Short description of the symptom…" className="mt-2 w-full resize-none rounded-lg border border-white/[.07] bg-[#08090b] p-2.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-700" />

        <p className="mt-4 text-[9px] font-mono uppercase tracking-wider text-zinc-600">How bad?</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(['CRITICAL', 'DEGRADED', 'MINOR'] as const).map((value) => (
            <button key={value} onClick={() => setSeverity(value)} className={`console-control rounded-lg border py-2.5 text-[10px] ${severity === value ? 'is-selected bg-white/[.06] text-white' : 'text-zinc-500'}`}>{SEVERITY_LABEL[value]}</button>
          ))}
        </div>

        <button
          onClick={() => submit.mutate()}
          disabled={!targetId || !symptom.trim() || !severity || submit.isPending}
          className="mt-6 w-full rounded-xl bg-dome/90 py-3 text-xs font-medium text-white disabled:opacity-30"
        >
          {submit.isPending ? 'Submitting…' : 'Submit report'}
        </button>
      </div>
    </div>
  );
}
