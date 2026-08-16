import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, FileCheck2, Megaphone, Scale, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { useToast } from './Toast';

type Consent = { id: string; subject: string; purpose: string; status: string; channels: string[] };
type Agreement = { id: string; title: string; agreement_type: string; status: string; shares: Array<{ id: string; holder_name: string; percentage: number | string }> };
type Credit = { id: string; credited_name: string; role: string; status: string };
type Deliverable = { id: string; title: string; status: string; current_version: number };
type ProjectActions = { id: string; promotional_consents?: Consent[]; rights_agreements?: Agreement[]; credits?: Credit[]; bookings?: Array<{ id: string; deliverables?: Deliverable[] }> };

function badge(status: string) {
  return status === 'APPROVED' || status === 'CONFIRMED' ? 'border-emerald-500/20 bg-emerald-500/[.07] text-emerald-300'
    : status === 'DISPUTED' || status === 'DECLINED' ? 'border-red-500/20 bg-red-500/[.07] text-red-300'
      : 'border-amber-500/20 bg-amber-500/[.07] text-amber-300';
}

export default function ProjectActionPanel({ project }: { project: ProjectActions }) {
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [openDispute, setOpenDispute] = useState<string | null>(null);
  const isArtist = user?.role === 'ARTIST';
  const pendingConsents = (project.promotional_consents ?? []).filter(item => item.status === 'REQUESTED');
  const pendingRights = (project.rights_agreements ?? []).filter(item => item.status === 'PROPOSED');
  const disputedCredits = (project.credits ?? []).filter(item => item.status === 'DISPUTED');
  const deliverables = (project.bookings ?? []).flatMap(booking => (booking.deliverables ?? []).map(deliverable => ({ ...deliverable, bookingId: booking.id }))).filter(item => item.status === 'PENDING_REVIEW' || item.status === 'CHANGES_REQUESTED');
  const total = pendingConsents.length + pendingRights.length + disputedCredits.length + deliverables.length;

  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['artist-projects'] }); queryClient.invalidateQueries({ queryKey: ['producer-projects'] }); queryClient.invalidateQueries({ queryKey: ['workrooms'] }); };
  const answerConsent = useMutation({ mutationFn: ({ id, action }: { id: string; action: 'APPROVE' | 'DECLINE' }) => api.patch(`/artist-projects/${project.id}/promotional-consents/${id}`, { action }), onSuccess: (_data, variables) => { refresh(); toast.success(variables.action === 'APPROVE' ? 'Promotional permission approved' : 'Promotional permission declined'); }, onError: (error: any) => toast.error(error?.response?.data?.error ?? 'Decision could not be saved') });
  const answerRights = useMutation({ mutationFn: ({ id, action }: { id: string; action: 'APPROVE' | 'DISPUTE' }) => api.patch(`/artist-projects/${project.id}/rights-agreements/${id}`, { action, note: action === 'DISPUTE' ? note : undefined }), onSuccess: (_data, variables) => { refresh(); setNote(''); setOpenDispute(null); toast.success(variables.action === 'APPROVE' ? 'Ownership proposal approved' : 'Ownership proposal disputed'); }, onError: (error: any) => toast.error(error?.response?.data?.error ?? 'Decision could not be saved') });

  if (!total) return <section className="mb-3 flex items-center gap-3 rounded-xl border border-emerald-500/10 bg-emerald-500/[.025] px-4 py-3"><ShieldCheck size={16} className="text-emerald-500"/><div><p className="text-xs text-emerald-200">No outstanding decisions</p><p className="mt-0.5 text-[9px] text-emerald-900">The project workroom is clear.</p></div></section>;

  return <section className="mb-3 overflow-hidden rounded-2xl border border-amber-500/15 bg-amber-500/[.025]">
    <header className="flex items-center gap-3 border-b border-amber-500/10 px-4 py-3"><AlertTriangle size={15} className="text-amber-400"/><div><p className="text-xs font-semibold text-amber-100">Action centre</p><p className="text-[9px] text-amber-800">{total} item{total === 1 ? '' : 's'} need attention</p></div></header>
    <div className="divide-y divide-white/[.05]">
      {deliverables.map(item => <article key={item.id} className="flex flex-wrap items-center gap-3 p-4"><FileCheck2 size={16} className="text-dome"/><div className="min-w-48 flex-1"><p className="text-xs text-zinc-200">Review “{item.title}”</p><p className="mt-1 text-[9px] text-zinc-600">Version {item.current_version} · {item.status.replaceAll('_', ' ')}</p></div><Link to={`/bookings/${item.bookingId}`} className="rounded-lg border border-dome/20 px-3 py-2 text-[10px] text-dome">Open deliverable →</Link></article>)}
      {pendingConsents.map(item => <article key={item.id} className="p-4"><div className="flex items-start gap-3"><Megaphone size={16} className="mt-0.5 text-purple-400"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs text-zinc-200">Promotional permission · {item.subject}</p><span className={`rounded-full border px-2 py-0.5 text-[8px] ${badge(item.status)}`}>{item.status}</span></div><p className="mt-1 text-[10px] leading-5 text-zinc-600">{item.purpose} · {item.channels.join(', ')}</p>{isArtist ? <div className="mt-3 flex gap-2"><button onClick={() => answerConsent.mutate({ id: item.id, action: 'APPROVE' })} className="flex items-center gap-1 rounded-md bg-emerald-500 px-3 py-1.5 text-[10px] font-semibold text-black"><Check size={11}/> Approve</button><button onClick={() => answerConsent.mutate({ id: item.id, action: 'DECLINE' })} className="rounded-md border border-red-500/20 px-3 py-1.5 text-[10px] text-red-300">Decline</button></div> : <p className="mt-2 text-[9px] text-zinc-700">Waiting for artist response</p>}</div></div></article>)}
      {pendingRights.map(item => <article key={item.id} className="p-4"><div className="flex items-start gap-3"><Scale size={16} className="mt-0.5 text-gold"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs text-zinc-200">Rights proposal · {item.title}</p><span className={`rounded-full border px-2 py-0.5 text-[8px] ${badge(item.status)}`}>{item.status}</span></div><p className="mt-1 text-[9px] text-zinc-600">{item.agreement_type} · {item.shares.map(share => `${share.holder_name} ${Number(share.percentage)}%`).join(' · ')}</p>{isArtist ? <div className="mt-3"><div className="flex gap-2"><button onClick={() => answerRights.mutate({ id: item.id, action: 'APPROVE' })} className="rounded-md bg-emerald-500 px-3 py-1.5 text-[10px] font-semibold text-black">Approve split</button><button onClick={() => setOpenDispute(openDispute === item.id ? null : item.id)} className="rounded-md border border-red-500/20 px-3 py-1.5 text-[10px] text-red-300">Dispute</button></div>{openDispute === item.id && <div className="mt-2 flex gap-2"><input value={note} onChange={event => setNote(event.target.value)} placeholder="Explain what should change" className="flex-1 rounded-md border border-white/[.08] bg-black/30 px-3 py-2 text-[10px] text-white outline-none"/><button disabled={!note.trim()} onClick={() => answerRights.mutate({ id: item.id, action: 'DISPUTE' })} className="rounded-md bg-red-500 px-3 py-2 text-[10px] font-semibold text-black disabled:opacity-30">Send</button></div>}</div> : <p className="mt-2 text-[9px] text-zinc-700">Waiting for artist response</p>}</div></div></article>)}
      {disputedCredits.map(item => <article key={item.id} className="flex items-center gap-3 p-4"><AlertTriangle size={15} className="text-red-400"/><div><p className="text-xs text-zinc-200">Credit disputed · {item.credited_name}</p><p className="mt-1 text-[9px] text-zinc-600">{item.role.replaceAll('_', ' ')} · resolve with the project team</p></div></article>)}
    </div>
  </section>;
}
