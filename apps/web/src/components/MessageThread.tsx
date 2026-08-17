import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

interface ThreadSender {
  id: string;
  role: string;
  artist?: { name: string; alias?: string | null } | null;
  producer?: { name: string; alias?: string | null } | null;
  engineer?: { name: string } | null;
}
interface ThreadMessage {
  id: string;
  body: string;
  created_at: string;
  sender: ThreadSender;
}

function senderName(message: ThreadMessage): string {
  return (
    message.sender.artist?.alias ??
    message.sender.artist?.name ??
    message.sender.producer?.alias ??
    message.sender.producer?.name ??
    message.sender.engineer?.name ??
    (message.sender.role === 'STUDIO_ADMIN' ? 'Studio' : 'Oiano')
  );
}

const THEME = {
  booking: {
    container: 'bg-studio-surface border border-studio-border rounded-xl overflow-hidden',
    header: 'px-5 py-3.5 border-b border-studio-border flex items-center gap-2',
    dot: 'w-1.5 h-1.5 rounded-full bg-dome animate-pulse',
    title: 'label-mono',
    count: 'ml-auto text-zinc-600 text-xs',
    list: 'max-h-72 overflow-y-auto px-5 py-4 space-y-3',
    bubbleMine: 'bg-dome/10 border border-dome/20 text-white rounded-tr-sm',
    bubbleTheirs: 'bg-studio-muted border border-studio-border text-zinc-300 rounded-tl-sm',
    inputRow: 'border-t border-studio-border px-4 py-3 flex gap-2',
    input: 'flex-1 bg-studio-muted border border-studio-border text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dome transition-colors',
    sendBtn: 'bg-dome text-black font-semibold text-xs px-4 py-2 rounded-lg hover:bg-dome-light transition-colors disabled:opacity-40',
  },
  project: {
    container: 'overflow-hidden rounded-2xl border border-white/[.07] bg-black/20',
    header: 'flex items-center gap-3 border-b border-white/[.06] px-5 py-4',
    dot: 'h-2 w-2 rounded-full bg-emerald-400',
    title: 'text-sm font-semibold',
    count: 'ml-auto text-[9px] font-mono text-zinc-700',
    list: 'max-h-80 space-y-3 overflow-y-auto p-5',
    bubbleMine: 'rounded-tr-sm border border-dome/20 bg-dome/10 text-zinc-100',
    bubbleTheirs: 'rounded-tl-sm border border-white/[.07] bg-white/[.035] text-zinc-300',
    inputRow: 'flex gap-2 border-t border-white/[.06] p-3',
    input: 'min-h-10 flex-1 resize-none rounded-xl border border-white/[.08] bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-dome/30',
    sendBtn: 'grid h-10 w-10 place-items-center rounded-xl bg-dome text-black disabled:opacity-30',
  },
} as const;

interface MessageThreadProps {
  variant: 'booking' | 'project';
  endpoint: string;
  queryKey: readonly unknown[];
  sseMatch: (event: any) => boolean;
  title: string;
  subtitle?: string;
  emptyTitle: string;
  emptySubtitle: string;
  placeholder: string;
}

export default function MessageThread({ variant, endpoint, queryKey, sseMatch, title, subtitle, emptyTitle, emptySubtitle, placeholder }: MessageThreadProps) {
  const user = useAuthStore((state) => state.user);
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const t = THEME[variant];

  const { data: messages = [], isLoading } = useQuery<ThreadMessage[]>({
    queryKey,
    queryFn: async () => (await api.get(endpoint)).data,
  });

  const send = useMutation({
    mutationFn: (text: string) => api.post(endpoint, { body: text }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey });
    },
  });

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (sseMatch(detail)) qc.invalidateQueries({ queryKey });
    }
    window.addEventListener('sse', handler);
    return () => window.removeEventListener('sse', handler);
  }, [qc, queryKey, sseMatch]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const submit = () => { if (body.trim() && !send.isPending) send.mutate(body.trim()); };
  const isMe = (message: ThreadMessage) => message.sender.id === user?.id;

  return (
    <div className={t.container}>
      <div className={t.header}>
        <span className={t.dot} />
        <div>
          <p className={t.title}>{title}</p>
          {subtitle && <p className="mt-0.5 text-[9px] text-zinc-600">{subtitle}</p>}
        </div>
        <span className={t.count}>{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
      </div>

      <div className={t.list}>
        {isLoading && <p className="py-4 text-center text-xs text-zinc-600">Loading thread…</p>}
        {!isLoading && messages.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm text-zinc-500">{emptyTitle}</p>
            <p className="mt-1 text-xs text-zinc-700">{emptySubtitle}</p>
          </div>
        )}
        {messages.map((message) => {
          const mine = isMe(message);
          return (
            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[80%]">
                <p className={`mb-1 px-1 text-[9px] text-zinc-700 ${mine ? 'text-right' : ''}`}>{mine ? 'You' : senderName(message)}</p>
                <div className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${mine ? t.bubbleMine : t.bubbleTheirs}`}>{message.body}</div>
                <p className={`mt-1 px-1 text-[10px] text-zinc-700 ${mine ? 'text-right' : ''}`}>
                  {new Date(message.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className={t.inputRow}>
        {variant === 'booking' ? (
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder={placeholder}
            className={t.input}
          />
        ) : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            rows={1}
            maxLength={4000}
            placeholder={placeholder}
            className={t.input}
          />
        )}
        <button onClick={submit} disabled={!body.trim() || send.isPending} aria-label="Send message" className={t.sendBtn}>
          {variant === 'project' ? <Send size={15} /> : 'Send'}
        </button>
      </div>
    </div>
  );
}
