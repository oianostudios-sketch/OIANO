import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Clock3, FileAudio, FolderKanban, MessageSquareText, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import ArtistAvatar from '../components/ArtistAvatar';
import TrustSignal from '../components/TrustSignal';
import { useToast } from '../components/Toast';
import ProjectMessageThread from '../components/ProjectMessageThread';
import ProjectActionPanel from '../components/ProjectActionPanel';

const PHASES = ['PRE_PRODUCTION', 'TRACKING', 'EDITING', 'MIXING', 'MASTERING', 'DELIVERED'];
const PHASE_LABELS: Record<string, string> = { PRE_PRODUCTION: 'Pre-production', TRACKING: 'Tracking', EDITING: 'Editing', MIXING: 'Mixing', MASTERING: 'Mastering', DELIVERED: 'Delivered' };
const PHASE_COLORS: Record<string, string> = { PRE_PRODUCTION: '#6aa9d2', TRACKING: '#4fa98a', EDITING: '#9878c7', MIXING: '#df8b4d', MASTERING: '#d3b35c', DELIVERED: '#7d8589' };

function relativeDate(value: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  return `Updated ${days} days ago`;
}

export default function ArtistProjectsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const artistId = useAuthStore((s) => s.user?.artist?.id);

  // Files are private — no bare URL to link to. Exchange a short-lived,
  // file-scoped ticket first, then open the ticket-gated content route.
  async function openFile(fileId: string) {
    if (!artistId) return;
    try {
      const { data } = await api.post(`/artists/${artistId}/files/${fileId}/access-ticket`);
      const base = (import.meta.env.VITE_API_URL ?? '') + '/api';
      window.open(`${base}/artists/${artistId}/files/${fileId}/content?ticket=${encodeURIComponent(data.ticket)}`, '_blank', 'noreferrer');
    } catch {
      toast.error('Could not open file');
    }
  }
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<'ACTIVE' | 'DELIVERED'>('ACTIVE');
  const [rightsNote, setRightsNote] = useState('');
  const { data: projects = [], isLoading, isError, refetch } = useQuery<any[]>({
    queryKey: ['artist-projects'],
    queryFn: async () => (await api.get('/artist-projects')).data,
  });
  const filtered = useMemo(() => projects.filter((project) => filter === 'ACTIVE' ? project.is_active && project.phase !== 'DELIVERED' : project.phase === 'DELIVERED'), [projects, filter]);
  const selectedId = params.get('project');
  const selected = projects.find((project) => project.id === selectedId) ?? filtered[0] ?? null;
  const answerPromotion = useMutation({
    mutationFn: ({ projectId, consentId, action }: { projectId: string; consentId: string; action: 'APPROVE' | 'DECLINE' | 'WITHDRAW' }) => api.patch(`/artist-projects/${projectId}/promotional-consents/${consentId}`, { action }),
    onSuccess: (_data, variables) => { queryClient.invalidateQueries({ queryKey: ['artist-projects'] }); toast.success(variables.action === 'APPROVE' ? 'Promotional permission approved' : variables.action === 'DECLINE' ? 'Permission declined' : 'Permission withdrawn'); },
    onError: (error: any) => toast.error(error?.response?.data?.error ?? 'Permission could not be updated'),
  });
  const answerRights = useMutation({
    mutationFn: ({ projectId, agreementId, action }: { projectId: string; agreementId: string; action: 'APPROVE' | 'DISPUTE' }) => api.patch(`/artist-projects/${projectId}/rights-agreements/${agreementId}`, { action, note: rightsNote || undefined }),
    onSuccess: (_data, variables) => { queryClient.invalidateQueries({ queryKey: ['artist-projects'] }); setRightsNote(''); toast.success(variables.action === 'APPROVE' ? 'Ownership split approved' : 'Split marked as disputed'); },
    onError: (error: any) => toast.error(error?.response?.data?.error ?? 'Rights response failed'),
  });

  useEffect(() => {
    if (!selectedId && filtered[0]) setParams({ project: filtered[0].id }, { replace: true });
  }, [selectedId, filtered, setParams]);

  return (
    <div className="min-h-screen text-zinc-100 pb-28">
      <header className="sticky top-0 z-20 border-b border-white/[.07] px-5 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <Link to="/dashboard" className="text-xs text-zinc-500 hover:text-white">← Home</Link>
          <div>
            <p className="text-[9px] font-mono uppercase tracking-[.18em] text-dome">Your artist workspace</p>
            <h1 className="text-xl font-medium">Studio projects</h1>
          </div>
          <Link to="/book" className="ml-auto rounded-lg border border-dome/25 bg-dome/10 px-3 py-2 text-xs font-semibold text-dome">Plan next session</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-medium">Every record, moving forward</h2>
            <p className="mt-2 max-w-xl text-sm text-zinc-500">Keep each project’s sessions, collaborators, files, and feedback together from first idea to final delivery.</p>
          </div>
          <div className="flex rounded-xl border border-white/[.07] bg-black/20 p-1">
            {(['ACTIVE', 'DELIVERED'] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-lg px-4 py-2 text-[10px] font-mono tracking-wider ${filter === item ? 'bg-white/[.08] text-white' : 'text-zinc-600'}`}>{item === 'ACTIVE' ? `ACTIVE ${projects.filter(p => p.is_active && p.phase !== 'DELIVERED').length}` : `DELIVERED ${projects.filter(p => p.phase === 'DELIVERED').length}`}</button>)}
          </div>
        </div>

        {isLoading ? <div className="grid min-h-[360px] place-items-center text-xs font-mono text-zinc-600">OPENING PROJECTS…</div> : isError ? (
          <div className="rounded-2xl border border-red-900/40 bg-red-950/15 p-8 text-center"><p className="text-sm text-red-200">Projects could not be loaded.</p><button onClick={() => refetch()} className="mt-4 rounded-lg border border-red-800 px-4 py-2 text-xs">Try again</button></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/[.07] bg-white/[.018] px-6 py-16 text-center">
            <FolderKanban className="mx-auto text-zinc-700" size={32} strokeWidth={1.3} />
            <h3 className="mt-5 text-xl">{filter === 'ACTIVE' ? 'Your next record starts here.' : 'No delivered projects yet.'}</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">{filter === 'ACTIVE' ? 'Projects appear here when a producer connects your work to a studio project.' : 'Completed work will become your growing studio catalogue.'}</p>
            {filter === 'ACTIVE' && <Link to="/producers" className="mt-6 inline-block rounded-lg bg-dome px-4 py-2.5 text-xs font-bold text-black">Find a producer →</Link>}
          </div>
        ) : (
          <div className="artist-project-layout grid grid-cols-[310px_minmax(0,1fr)] gap-5">
            <aside className="space-y-2">
              {filtered.map((project) => {
                const active = selected?.id === project.id;
                return <button key={project.id} onClick={() => setParams({ project: project.id })} className={`w-full rounded-xl border p-4 text-left ${active ? 'border-dome/30 bg-dome/[.07]' : 'border-white/[.06] bg-white/[.015] hover:border-white/[.13]'}`}>
                  <div className="mb-3 flex items-center justify-between"><span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: PHASE_COLORS[project.phase] }}>{PHASE_LABELS[project.phase]}</span><span className="text-[9px] text-zinc-700">{relativeDate(project.updated_at)}</span></div>
                  <p className="truncate text-sm font-semibold text-zinc-100">{project.title}</p>
                  <p className="mt-1 truncate text-[11px] text-zinc-600">{project.producer?.alias ?? project.producer?.name ?? 'Producer to be assigned'}</p>
                  <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[.05]"><div className="h-full rounded-full" style={{ width: `${((PHASES.indexOf(project.phase) + 1) / PHASES.length) * 100}%`, background: PHASE_COLORS[project.phase] }} /></div>
                </button>;
              })}
            </aside>

            {selected && <section className="min-w-0 rounded-2xl border border-white/[.07] bg-[rgba(13,16,18,.72)] p-6 shadow-2xl shadow-black/20">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[.06] pb-6">
                <div><p className="text-[9px] font-mono uppercase tracking-[.16em]" style={{ color: PHASE_COLORS[selected.phase] }}>{PHASE_LABELS[selected.phase]}</p><h2 className="mt-2 text-3xl">{selected.title}</h2><p className="mt-2 text-xs text-zinc-600">{relativeDate(selected.updated_at)}</p></div>
                <Link to="/artist/passport" className="rounded-lg border border-gold/20 px-3 py-2 text-[10px] text-gold">{selected.is_public ? 'Visible on your Passport' : 'Add this work to Passport'}</Link>
              </div>

              <div className="my-6 grid grid-cols-3 gap-2">
                {[{ icon: CalendarDays, value: selected.bookings.length, label: 'Sessions' }, { icon: Users, value: selected.collaborators.length, label: 'Collaborators' }, { icon: FileAudio, value: selected.files.length, label: 'Files' }].map(({ icon: Icon, value, label }) => <div key={label} className="rounded-xl border border-white/[.055] bg-black/20 p-3"><Icon size={14} className="mb-3 text-zinc-600"/><strong className="block text-lg">{value}</strong><span className="text-[10px] text-zinc-600">{label}</span></div>)}
              </div>

              <div className="mb-7"><p className="mb-2 text-[9px] font-mono uppercase tracking-widest text-zinc-600">Production path</p><div className="grid grid-cols-6 gap-1">{PHASES.map((phase, index) => <div key={phase}><div className="h-1 rounded-full" style={{ background: index <= PHASES.indexOf(selected.phase) ? PHASE_COLORS[selected.phase] : 'rgba(255,255,255,.06)' }} /><p className="mt-2 hidden text-[8px] text-zinc-700 xl:block">{PHASE_LABELS[phase]}</p></div>)}</div></div>

              {selected.notes && <div className="mb-7 rounded-xl border border-white/[.06] bg-black/20 p-4"><p className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Project brief</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{selected.notes}</p></div>}

              <div className="mb-7"><ProjectActionPanel project={selected}/><ProjectMessageThread projectId={selected.id}/></div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div><h3 className="flex items-center gap-2 text-sm"><Users size={15} className="text-dome"/> Collaborators</h3><div className="mt-3 space-y-2">{selected.collaborators.length ? selected.collaborators.map((person: any) => <div key={`${person.role}-${person.id}`} className="flex items-center gap-3 rounded-lg border border-white/[.05] px-3 py-2.5"><ArtistAvatar src={person.avatar_url} name={person.name} size={32} /><div><p className="text-xs text-zinc-300">{person.name}</p><p className="text-[9px] text-zinc-600">{person.role}</p></div></div>) : <p className="text-xs text-zinc-700">Collaborators will appear when sessions are connected.</p>}</div></div>
                <div><h3 className="flex items-center gap-2 text-sm"><Clock3 size={15} className="text-dome"/> Linked sessions</h3><div className="mt-3 space-y-2">{selected.bookings.length ? selected.bookings.slice(0,3).map((booking: any) => <Link key={booking.id} to={`/bookings/${booking.id}`} className="block rounded-lg border border-white/[.05] px-3 py-2.5 hover:border-dome/20"><p className="text-xs text-zinc-300">{booking.service?.name ?? 'Studio session'}</p><p className="mt-1 text-[9px] text-zinc-600">{new Date(booking.starts_at).toLocaleDateString()} · {booking.room?.name}</p></Link>) : <p className="text-xs text-zinc-700">No studio sessions linked yet.</p>}</div></div>
                <div><h3 className="flex items-center gap-2 text-sm"><FileAudio size={15} className="text-gold"/> Project files</h3><div className="mt-3 space-y-2">{selected.files.length ? selected.files.slice(0,4).map((file: any) => <button key={file.id} onClick={() => openFile(file.id)} className="flex w-full items-center justify-between rounded-lg border border-white/[.05] px-3 py-2.5 text-left"><span className="truncate text-xs text-zinc-400">{file.name}</span><span className="text-[9px] text-zinc-700">OPEN</span></button>) : <p className="text-xs text-zinc-700">Files saved inside a folder matching this project will appear here.</p>}</div></div>
                <div><h3 className="flex items-center gap-2 text-sm"><MessageSquareText size={15} className="text-gold"/> Creative notes</h3><div className="mt-3 space-y-2">{selected.feedback.length ? selected.feedback.slice(0,3).map((item: any) => <div key={item.id} className="rounded-lg border border-white/[.05] px-3 py-2.5"><p className="line-clamp-2 text-xs leading-5 text-zinc-400">“{item.body}”</p><p className="mt-1 text-[9px] text-zinc-700">{item.source}</p></div>) : <p className="text-xs text-zinc-700">Session notes and collaborator feedback will appear here.</p>}</div></div>
                <div className="lg:col-span-2"><h3 className="flex items-center gap-2 text-sm"><FileAudio size={15} className="text-dome"/> Project credit sheet</h3><p className="mt-1 text-[9px] text-zinc-700">Credits record contribution, not rights or ownership.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{selected.credits?.length ? selected.credits.map((credit: any) => <div key={credit.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[.05] px-3 py-2.5"><div><p className="text-xs text-zinc-300">{credit.credited_name}</p><p className="mt-1 text-[9px] text-zinc-600">{credit.role.replaceAll('_',' ')} · {credit.scope || 'Whole project'}</p></div><span className={`rounded-full border px-2 py-1 text-[8px] font-mono ${credit.status === 'CONFIRMED' ? 'border-emerald-500/15 text-emerald-500' : credit.status === 'DISPUTED' ? 'border-red-500/15 text-red-400' : 'border-white/[.07] text-zinc-600'}`}>{credit.status}</span></div>) : <p className="text-xs text-zinc-700">The producer has not added structured credits yet.</p>}</div></div>
              </div>

              {selected.phase === 'DELIVERED' && <div className="mt-7 grid gap-3 rounded-xl border border-emerald-900/30 bg-emerald-950/15 p-4 sm:grid-cols-[1fr_auto]"><div className="flex items-center gap-3"><CheckCircle2 className="text-emerald-500" size={18}/><div><p className="text-xs font-semibold text-emerald-200">Delivered</p><p className="text-[10px] text-emerald-800">Completion is recorded in this OIANO studio project.</p></div></div><TrustSignal kind="studio" compact /></div>}
              {selected.promotional_consents?.length > 0 && <section className="mt-7 rounded-xl border border-gold/15 bg-gold/[.025] p-4"><h3 className="text-sm">Promotional permissions</h3><p className="mt-1 text-[9px] text-zinc-700">Promotion only · no ownership transfer.</p><div className="mt-4 space-y-3">{selected.promotional_consents.map((consent: any) => <article key={consent.id} className="rounded-lg border border-white/[.06] bg-black/20 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-zinc-300">{consent.subject}</p><p className="mt-1 text-[10px] leading-5 text-zinc-600">{consent.purpose}</p><p className="mt-1 text-[9px] text-zinc-700">{consent.channels.join(', ')} · {consent.assets.join(', ')}</p></div><span className="text-[9px] font-mono text-gold">{consent.status}</span></div>{consent.status === 'REQUESTED' && <div className="mt-3 flex gap-2"><button onClick={() => answerPromotion.mutate({ projectId: selected.id, consentId: consent.id, action: 'APPROVE' })} className="rounded-md bg-emerald-500 px-3 py-2 text-[10px] font-semibold text-black">Approve</button><button onClick={() => answerPromotion.mutate({ projectId: selected.id, consentId: consent.id, action: 'DECLINE' })} className="rounded-md border border-red-500/20 px-3 py-2 text-[10px] text-red-400">Decline</button></div>}{consent.status === 'APPROVED' && <button onClick={() => answerPromotion.mutate({ projectId: selected.id, consentId: consent.id, action: 'WITHDRAW' })} className="mt-3 text-[10px] text-zinc-600 underline">Withdraw permission</button>}</article>)}</div></section>}
              {selected.rights_agreements?.length > 0 && <section className="mt-7 rounded-xl border border-white/[.07] bg-black/20 p-4"><h3 className="text-sm">Rights & ownership</h3><p className="mt-1 text-[9px] text-zinc-700">Review master and publishing proposals independently. Consider legal advice before approving.</p><div className="mt-4 space-y-3">{selected.rights_agreements.map((agreement: any) => <article key={agreement.id} className="rounded-lg border border-white/[.06] p-3"><div className="flex justify-between gap-3"><div><p className="text-xs text-zinc-300">{agreement.title}</p><p className="mt-1 text-[9px] text-zinc-700">{agreement.agreement_type}</p></div><span className="text-[9px] font-mono text-gold">{agreement.status}</span></div><div className="mt-3 flex flex-wrap gap-2">{agreement.shares.map((share: any) => <span key={share.id} className="rounded-full border border-white/[.07] px-2.5 py-1 text-[9px] text-zinc-500">{share.holder_name} · {Number(share.percentage)}%</span>)}</div>{agreement.status === 'PROPOSED' && <div className="mt-3"><input value={rightsNote} onChange={event => setRightsNote(event.target.value)} placeholder="Reason required only if disputing" className="w-full rounded-md border border-white/[.07] bg-black/30 px-3 py-2 text-[10px] text-white outline-none"/><div className="mt-2 flex gap-2"><button onClick={() => answerRights.mutate({ projectId: selected.id, agreementId: agreement.id, action: 'APPROVE' })} className="rounded-md bg-emerald-500 px-3 py-2 text-[10px] font-semibold text-black">Approve split</button><button disabled={!rightsNote.trim()} onClick={() => answerRights.mutate({ projectId: selected.id, agreementId: agreement.id, action: 'DISPUTE' })} className="rounded-md border border-red-500/20 px-3 py-2 text-[10px] text-red-400 disabled:opacity-40">Dispute</button></div></div>}</article>)}</div></section>}
            </section>}
          </div>
        )}
      </main>
      <style>{`@media(max-width:820px){.artist-project-layout{grid-template-columns:1fr}.artist-project-layout aside{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}} @media(max-width:520px){.artist-project-layout aside{grid-template-columns:1fr}}`}</style>
    </div>
  );
}
