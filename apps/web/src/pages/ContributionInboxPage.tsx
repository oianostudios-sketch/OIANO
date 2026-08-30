import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Clock3, FileCheck2, FolderKanban, MessageSquareText, Music2, PenLine, UsersRound, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';

type Invitation = {
  id: string; display_name: string; email: string | null; role: string; status: string; updated_at: string;
  credits: Array<{ id: string; credited_name: string; role: string; scope: string | null; status: string }>;
  project: {
    id: string; title: string; phase: string; is_active: boolean; updated_at: string;
    producer: { name: string; alias: string | null; user_id: string };
    artist: { name: string; alias: string | null } | null;
    bookings: Array<{ id: string; starts_at: string; studio: { name: string } }>;
  };
};

const roleLabel = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());

export default function ContributionInboxPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [correctionId, setCorrectionId] = useState<string | null>(null);
  const [correctionNote, setCorrectionNote] = useState('');
  const { data = [], isLoading, isError } = useQuery<Invitation[]>({ queryKey: ['contribution-inbox'], queryFn: async () => (await api.get('/contributions/inbox')).data });
  const pending = useMemo(() => data.filter(item => item.status === 'INVITED'), [data]);
  const history = useMemo(() => data.filter(item => item.status !== 'INVITED'), [data]);
  const active = useMemo(() => data.filter(item => item.status === 'ACTIVE'), [data]);
  const confirmedCredits = useMemo(() => data.flatMap(item => item.credits).filter(credit => credit.status === 'CONFIRMED'), [data]);
  const linkedSessions = useMemo(() => new Set(active.flatMap(item => item.project.bookings.map(booking => booking.id))).size, [active]);

  const respond = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: string; note?: string }) => api.patch(`/contributions/${id}/respond`, { decision, note }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['contribution-inbox'] });
      qc.invalidateQueries({ queryKey: ['network-metrics'] });
      setCorrectionId(null); setCorrectionNote('');
      toast.success(variables.decision === 'ACCEPT' ? 'Contribution accepted' : variables.decision === 'DECLINE' ? 'Invitation declined' : 'Correction request sent');
    },
    onError: (error: any) => toast.error(error?.response?.data?.error ?? 'The invitation could not be updated'),
  });
  const respondToCredit = useMutation({
    mutationFn: ({ creditId, decision }: { creditId: string; decision: 'CONFIRM' | 'DISPUTE' }) => api.patch(`/contributions/credits/${creditId}/respond`, { decision }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['contribution-inbox'] });
      qc.invalidateQueries({ queryKey: ['network-metrics'] });
      toast.success(variables.decision === 'CONFIRM' ? 'Credit confirmed' : 'Credit disputed');
    },
    onError: (error: any) => toast.error(error?.response?.data?.error ?? 'The credit could not be updated'),
  });

  return <main className="min-h-screen bg-studio-bg px-5 py-10 text-zinc-100 md:px-8"><div className="mx-auto max-w-6xl">
    <header className="border-b border-white/[.06] pb-8"><Link to="/dashboard" className="inline-flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider text-zinc-600 no-underline hover:text-white"><ArrowLeft size={12}/> My home</Link><div className="mt-6 flex flex-wrap items-end justify-between gap-5"><div><p className="text-[9px] font-mono uppercase tracking-[.28em] text-violet-300">My contribution record</p><h1 className="mt-3 font-display text-4xl">Know the role. Join the work. Keep the proof.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">Review invitations, enter accepted project rooms and preserve credits, sessions and rights decisions under one OIANO identity.</p></div><div className="rounded-2xl border border-violet-300/15 bg-violet-300/[.025] px-5 py-4 text-center"><p className="text-2xl font-semibold text-violet-300">{pending.length}</p><p className="mt-1 text-[8px] font-mono uppercase tracking-wider text-zinc-600">Decisions waiting</p></div></div></header>

    {!isLoading && !isError && <section aria-label="Contribution record summary" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4"><article className="metric-enter rounded-2xl border border-white/[.06] bg-studio-surface p-4"><Clock3 size={14} className="text-violet-300"/><p className="mt-4 text-2xl">{pending.length}</p><p className="mt-1 text-[8px] font-mono uppercase text-zinc-700">Pending decisions</p></article><article className="metric-enter rounded-2xl border border-white/[.06] bg-studio-surface p-4"><FolderKanban size={14} className="text-[#5A9BCB]"/><p className="mt-4 text-2xl">{active.length}</p><p className="mt-1 text-[8px] font-mono uppercase text-zinc-700">Active projects</p></article><article className="metric-enter rounded-2xl border border-white/[.06] bg-studio-surface p-4"><FileCheck2 size={14} className="text-emerald-400"/><p className="mt-4 text-2xl">{confirmedCredits.length}</p><p className="mt-1 text-[8px] font-mono uppercase text-zinc-700">Confirmed credits</p></article><article className="metric-enter rounded-2xl border border-white/[.06] bg-studio-surface p-4"><Music2 size={14} className="text-amber-300"/><p className="mt-4 text-2xl">{linkedSessions}</p><p className="mt-1 text-[8px] font-mono uppercase text-zinc-700">Linked sessions</p></article></section>}

    {isLoading ? <div className="mt-8 grid gap-3 md:grid-cols-2">{[0,1].map(item=><div key={item} className="h-64 animate-pulse rounded-3xl bg-white/[.03]"/>)}</div>
      : isError ? <div role="alert" className="mt-8 rounded-2xl border border-red-400/15 bg-red-400/[.04] p-5 text-sm text-red-300">Contribution invitations are temporarily unavailable.</div>
      : <>
        <section className="mt-8"><div className="flex items-center gap-3"><Clock3 size={15} className="text-violet-300"/><h2 className="text-xs font-semibold uppercase tracking-wider">Needs your decision</h2></div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">{pending.map(invitation=><article key={invitation.id} className="card-lift rounded-3xl border border-violet-300/15 bg-studio-surface p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[8px] font-mono uppercase tracking-[.16em] text-violet-300">Invited as {roleLabel(invitation.role)}</p><h3 className="mt-2 text-xl font-semibold">{invitation.project.title}</h3><p className="mt-2 text-[10px] text-zinc-600">From {invitation.project.producer.alias || invitation.project.producer.name}{invitation.project.artist ? ` · with ${invitation.project.artist.alias || invitation.project.artist.name}` : ''}</p></div><UsersRound size={18} className="text-zinc-700"/></div>
            <div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-xl bg-black/20 p-3"><p className="text-[7px] font-mono uppercase text-zinc-700">Project phase</p><p className="mt-1 text-[10px] text-zinc-400">{roleLabel(invitation.project.phase)}</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-[7px] font-mono uppercase text-zinc-700">Studio context</p><p className="mt-1 text-[10px] text-zinc-400">{invitation.project.bookings[0]?.studio.name ?? 'No session linked yet'}</p></div></div>
            {correctionId === invitation.id ? <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[.025] p-4"><label htmlFor={`correction-${invitation.id}`} className="text-[8px] font-mono uppercase tracking-wider text-amber-300/70">What needs correcting?</label><textarea id={`correction-${invitation.id}`} value={correctionNote} onChange={event=>setCorrectionNote(event.target.value)} maxLength={500} rows={3} className="mt-2 w-full resize-none rounded-xl border border-white/[.08] bg-black/30 p-3 text-xs text-white outline-none focus:border-amber-300/30" placeholder="Explain the role or scope that should change."/><div className="mt-3 flex gap-2"><button type="button" disabled={!correctionNote.trim()||respond.isPending} onClick={()=>respond.mutate({id:invitation.id,decision:'REQUEST_CORRECTION',note:correctionNote})} className="rounded-lg bg-amber-300 px-3 py-2 text-[9px] font-semibold text-black disabled:opacity-40">Send request</button><button type="button" onClick={()=>{setCorrectionId(null);setCorrectionNote('')}} className="rounded-lg border border-white/[.08] px-3 py-2 text-[9px] text-zinc-500">Cancel</button></div></div>
            : <div className="mt-5 grid grid-cols-3 gap-2"><button type="button" onClick={()=>respond.mutate({id:invitation.id,decision:'ACCEPT'})} disabled={respond.isPending} className="flex items-center justify-center gap-1.5 rounded-xl bg-violet-300 px-3 py-3 text-[9px] font-semibold text-black"><Check size={12}/> Accept</button><button type="button" onClick={()=>setCorrectionId(invitation.id)} className="flex items-center justify-center gap-1.5 rounded-xl border border-white/[.08] px-3 py-3 text-[9px] text-zinc-400"><PenLine size={12}/> Correct</button><button type="button" onClick={()=>respond.mutate({id:invitation.id,decision:'DECLINE'})} disabled={respond.isPending} className="flex items-center justify-center gap-1.5 rounded-xl border border-red-400/10 px-3 py-3 text-[9px] text-red-300/70"><X size={12}/> Decline</button></div>}
          </article>)}{!pending.length&&<div className="col-span-full rounded-3xl border border-dashed border-white/[.07] p-10 text-center"><Check size={18} className="mx-auto text-emerald-400"/><p className="mt-3 text-sm text-zinc-400">No contribution invitations need your response.</p></div>}</div>
        </section>

        {active.length>0&&<section className="mt-8" aria-labelledby="active-contributions"><div className="mb-3 flex items-center gap-2"><FolderKanban size={15} className="text-[#5A9BCB]"/><h2 id="active-contributions" className="text-xs font-semibold uppercase tracking-wider">Active contribution rooms</h2></div><div className="grid gap-2 md:grid-cols-2">{active.map(item=><Link key={`workspace-${item.id}`} to={`/contributions/${item.id}/workspace`} className="flex items-center justify-between rounded-2xl border border-violet-300/15 bg-violet-300/[.025] p-4 text-sm text-zinc-200 no-underline hover:border-violet-300/30"><span><b className="block text-xs">{item.project.title}</b><span className="mt-1 block text-[9px] text-zinc-600">Your {roleLabel(item.role)} workspace</span></span><span className="text-[9px] text-violet-300">Open →</span></Link>)}</div></section>}

        <section className="mt-10"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><Music2 size={15} className="text-[#5A9BCB]"/><h2 className="text-xs font-semibold uppercase tracking-wider">Contribution history</h2></div><Link to="/workrooms" className="flex items-center gap-1 text-[9px] text-zinc-600 no-underline hover:text-white">Open workrooms <ArrowRight size={11}/></Link></div><div className="mt-4 overflow-hidden rounded-2xl border border-white/[.06] bg-studio-surface">{history.map(item=><div key={item.id} className="border-b border-white/[.045] px-5 py-4 last:border-0"><div className="flex flex-wrap items-center gap-4"><div className="grid h-9 w-9 place-items-center rounded-xl bg-white/[.03]"><MessageSquareText size={14} className="text-zinc-600"/></div><div className="min-w-0 flex-1"><b className="block truncate text-xs font-medium">{item.project.title}</b><p className="mt-1 text-[9px] text-zinc-700">{roleLabel(item.role)} · {item.project.producer.alias || item.project.producer.name}</p></div><span className={`rounded-full border px-2.5 py-1 text-[7px] font-mono uppercase tracking-wider ${item.status==='ACTIVE'?'border-emerald-400/15 text-emerald-400':item.status==='DECLINED'?'border-red-400/10 text-red-300':'border-amber-300/15 text-amber-300'}`}>{item.status.replaceAll('_',' ')}</span></div>{item.status==='ACTIVE'&&item.credits.map(credit=><div key={credit.id} className="ml-13 mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-white/[.05] bg-black/20 p-3"><div className="min-w-0 flex-1"><p className="text-[8px] font-mono uppercase tracking-wider text-[#5A9BCB]">Credit for review</p><p className="mt-1 text-[10px] text-zinc-400">{roleLabel(credit.role)}{credit.scope ? ` · ${credit.scope}` : ''}</p></div>{credit.status==='DRAFT'?<div className="flex gap-2"><button type="button" disabled={respondToCredit.isPending} onClick={()=>respondToCredit.mutate({creditId:credit.id,decision:'CONFIRM'})} className="rounded-lg bg-[#5A9BCB] px-3 py-2 text-[8px] font-semibold text-black">Confirm</button><button type="button" disabled={respondToCredit.isPending} onClick={()=>respondToCredit.mutate({creditId:credit.id,decision:'DISPUTE'})} className="rounded-lg border border-white/[.08] px-3 py-2 text-[8px] text-zinc-400">Dispute</button></div>:<span className="text-[8px] font-mono uppercase text-zinc-600">{credit.status}</span>}</div>)}</div>)}{!history.length&&<p className="p-8 text-center text-xs text-zinc-700">Your accepted and previous contribution decisions will appear here.</p>}</div></section>
      </>}
  </div></main>;
}
