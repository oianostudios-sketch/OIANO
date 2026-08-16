import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

type Message = { id: string; body: string; kind: string; created_at: string; sender: { id: string; role: string; artist?: { name: string; alias?: string | null } | null; producer?: { name: string; alias?: string | null } | null; engineer?: { name: string } | null } };

function nameOf(message: Message) { return message.sender.artist?.alias ?? message.sender.artist?.name ?? message.sender.producer?.alias ?? message.sender.producer?.name ?? message.sender.engineer?.name ?? (message.sender.role === 'STUDIO_ADMIN' ? 'Studio' : 'Oiano'); }

export default function ProjectMessageThread({ projectId }: { projectId: string }) {
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const { data: messages = [], isLoading } = useQuery<Message[]>({ queryKey: ['project-messages', projectId], queryFn: async () => (await api.get(`/projects/${projectId}/messages`)).data, refetchInterval: 15_000 });
  const send = useMutation({ mutationFn: (text: string) => api.post(`/projects/${projectId}/messages`, { body: text }), onSuccess: () => { setBody(''); queryClient.invalidateQueries({ queryKey: ['project-messages', projectId] }); } });
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);
  const submit = () => { if (body.trim() && !send.isPending) send.mutate(body.trim()); };
  return <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-black/20">
    <header className="flex items-center gap-3 border-b border-white/[.06] px-5 py-4"><span className="h-2 w-2 rounded-full bg-emerald-400"/><div><h3 className="text-sm font-semibold">Project conversation</h3><p className="mt-0.5 text-[9px] text-zinc-600">Shared context for the whole working team</p></div><span className="ml-auto text-[9px] font-mono text-zinc-700">{messages.length} MESSAGES</span></header>
    <div className="max-h-80 space-y-3 overflow-y-auto p-5">{isLoading ? <p className="py-8 text-center text-xs text-zinc-700">Opening conversation…</p> : messages.length === 0 ? <div className="py-8 text-center"><p className="text-sm text-zinc-500">Start with the creative direction.</p><p className="mt-1 text-xs text-zinc-700">Reference tracks, goals and decisions will stay with this project.</p></div> : messages.map(message => { const mine = message.sender.id === user?.id; return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className="max-w-[82%]"><p className={`mb-1 px-1 text-[9px] text-zinc-700 ${mine ? 'text-right' : ''}`}>{mine ? 'You' : nameOf(message)}</p><div className={`rounded-2xl px-4 py-2.5 text-sm leading-6 ${mine ? 'rounded-tr-sm border border-dome/20 bg-dome/10 text-zinc-100' : 'rounded-tl-sm border border-white/[.07] bg-white/[.035] text-zinc-300'}`}>{message.body}</div><p className={`mt-1 px-1 text-[8px] text-zinc-800 ${mine ? 'text-right' : ''}`}>{new Date(message.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p></div></div>; })}<div ref={endRef}/></div>
    <div className="flex gap-2 border-t border-white/[.06] p-3"><textarea value={body} onChange={event => setBody(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } }} rows={1} maxLength={4000} placeholder="Share an update, reference or decision…" className="min-h-10 flex-1 resize-none rounded-xl border border-white/[.08] bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-dome/30"/><button onClick={submit} disabled={!body.trim() || send.isPending} aria-label="Send project message" className="grid h-10 w-10 place-items-center rounded-xl bg-dome text-black disabled:opacity-30"><Send size={15}/></button></div>
  </section>;
}
