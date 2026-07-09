import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

interface Message {
  id: string;
  body: string;
  created_at: string;
  sender: {
    id: string;
    role: string;
    artist?: { name: string; alias: string | null } | null;
  };
}

export default function BookingMessageThread({ bookingId }: { bookingId: string }) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ['booking-messages', bookingId],
    queryFn: async () => (await api.get(`/bookings/${bookingId}/messages`)).data,
  });

  const send = useMutation({
    mutationFn: (body: string) => api.post(`/bookings/${bookingId}/messages`, { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking-messages', bookingId] });
      setText('');
    },
  });

  // Live refresh on SSE booking_message events
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const d = e.detail;
      if (d?.type === 'booking_message' && d?.booking_id === bookingId) {
        qc.invalidateQueries({ queryKey: ['booking-messages', bookingId] });
      }
    };
    window.addEventListener('sse', handler as EventListener);
    return () => window.removeEventListener('sse', handler as EventListener);
  }, [bookingId, qc]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function senderName(msg: Message) {
    if (msg.sender.artist?.alias) return msg.sender.artist.alias;
    if (msg.sender.artist?.name) return msg.sender.artist.name;
    return msg.sender.role === 'STUDIO_ADMIN' ? 'Studio' : 'Engineer';
  }

  const isMe = (msg: Message) => msg.sender.id === user?.id;

  return (
    <div className="bg-studio-surface border border-studio-border rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-studio-border flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-dome animate-pulse" />
        <p className="label-mono">Session thread</p>
        <span className="ml-auto text-zinc-600 text-xs">{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Message list */}
      <div className="max-h-72 overflow-y-auto px-5 py-4 space-y-3">
        {isLoading && (
          <p className="text-zinc-600 text-xs text-center py-4">Loading thread…</p>
        )}
        {!isLoading && messages.length === 0 && (
          <div className="text-center py-6">
            <p className="text-zinc-500 text-sm">No messages yet.</p>
            <p className="text-zinc-700 text-xs mt-1">Start the conversation — reference tracks, session goals, anything.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2.5 ${isMe(msg) ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
              isMe(msg) ? 'bg-dome/20 text-dome' : 'bg-studio-muted text-zinc-400'
            }`}>
              {senderName(msg).charAt(0).toUpperCase()}
            </div>
            <div className={`max-w-[75%] ${isMe(msg) ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
              <span className="text-zinc-600 text-[10px] font-mono px-1">
                {isMe(msg) ? 'You' : senderName(msg)}
              </span>
              <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                isMe(msg)
                  ? 'bg-dome/10 border border-dome/20 text-white rounded-tr-sm'
                  : 'bg-studio-muted border border-studio-border text-zinc-300 rounded-tl-sm'
              }`}>
                {msg.body}
              </div>
              <span className="text-zinc-700 text-[10px] px-1">
                {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-studio-border px-4 py-3 flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && text.trim()) {
              e.preventDefault();
              send.mutate(text.trim());
            }
          }}
          placeholder="Reference tracks, goals, questions…"
          className="flex-1 bg-studio-muted border border-studio-border text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-dome transition-colors"
        />
        <button
          onClick={() => text.trim() && send.mutate(text.trim())}
          disabled={send.isPending || !text.trim()}
          className="bg-dome text-black font-semibold text-xs px-4 py-2 rounded-lg hover:bg-dome-light transition-colors disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
