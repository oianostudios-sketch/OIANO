import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

// ── ConnectPage ───────────────────────────────────────────────────────────────
// Slide-over style artist-to-artist message thread.
// Route: /connect/:artistId  (artistId = the OTHER artist)
// On first load → POST /api/connect to get/create connection
// Then polls GET /api/connect/:id for messages
// ─────────────────────────────────────────────────────────────────────────────

export default function ConnectPage() {
  const { artistId } = useParams<{ artistId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [connectionId, setConnectionId] = useState<string | null>(null);

  // ── Fetch the other artist's profile ─────────────────────────────────────
  const { data: otherArtist } = useQuery({
    queryKey: ['artist', artistId],
    queryFn: async () => (await api.get(`/artists/${artistId}`)).data,
    enabled: !!artistId,
  });

  // ── Initiate / get connection ─────────────────────────────────────────────
  useEffect(() => {
    if (!artistId) return;
    api.post('/connect', { artist_id: artistId })
      .then(r => setConnectionId(r.data.id))
      .catch(() => {});
  }, [artistId]);

  // ── Load thread ───────────────────────────────────────────────────────────
  const { data: thread } = useQuery({
    queryKey: ['connect-thread', connectionId],
    queryFn: async () => (await api.get(`/connect/${connectionId}`)).data,
    enabled: !!connectionId,
    refetchInterval: 5_000,
  });

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread?.messages?.length]);

  // ── SSE: invalidate on new_message for this connection ───────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const event = (e as CustomEvent).detail;
      if (event.type === 'new_message' && event.context === 'connect' && event.connectionId === connectionId) {
        qc.invalidateQueries({ queryKey: ['connect-thread', connectionId] });
      }
    };
    window.addEventListener('sse', handler);
    return () => window.removeEventListener('sse', handler);
  }, [connectionId, qc]);

  // ── Send message ──────────────────────────────────────────────────────────
  const send = useMutation({
    mutationFn: () => api.post(`/connect/${connectionId}/messages`, { body: draft }),
    onSuccess: () => {
      setDraft('');
      qc.invalidateQueries({ queryKey: ['connect-thread', connectionId] });
    },
  });

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim() && connectionId) send.mutate();
    }
  };

  // ── My artist id from thread ──────────────────────────────────────────────
  const myArtistId = thread
    ? (thread.initiator?.user_id === user?.id ? thread.initiator?.id : thread.recipient?.id)
    : null;

  const other = thread?.initiator?.id === myArtistId ? thread?.recipient : thread?.initiator;
  const displayName = otherArtist?.alias ?? otherArtist?.name ?? other?.alias ?? other?.name ?? 'Artist';
  const status = thread?.status ?? 'PENDING';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18, padding: '0 4px', lineHeight: 1 }}>←</button>

        {otherArtist?.avatar_url ? (
          <img src={otherArtist.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }} />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#888' }}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{displayName}</p>
          <p style={{ margin: 0, fontSize: 11, color: '#555', fontFamily: 'JetBrains Mono, monospace' }}>
            {status === 'ACCEPTED' ? '● connected' : status === 'PENDING' ? '○ pending' : '✕ declined'}
          </p>
        </div>

        {otherArtist && (
          <Link to={`/artists/${artistId}`} style={{ fontSize: 11, color: '#555', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px' }}>
            View passport
          </Link>
        )}
      </div>

      {/* Thread */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!thread && (
          <div style={{ textAlign: 'center', color: '#444', fontSize: 13, marginTop: 60 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🤝</div>
            <p style={{ margin: 0 }}>Starting a new connection with <strong style={{ color: '#888' }}>{displayName}</strong></p>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#333' }}>Send a message to introduce yourself.</p>
          </div>
        )}

        {thread?.messages?.length === 0 && (
          <div style={{ textAlign: 'center', color: '#444', fontSize: 13, marginTop: 60 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
            <p style={{ margin: 0 }}>No messages yet. Say something.</p>
          </div>
        )}

        {thread?.messages?.map((msg: any) => {
          const isMe = msg.sender_id === myArtistId;
          return (
            <div key={msg.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '72%',
                padding: '10px 14px',
                borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: isMe ? 'rgba(201,168,76,0.12)' : 'var(--surface)',
                border: `1px solid ${isMe ? 'rgba(201,168,76,0.2)' : 'var(--border)'}`,
              }}>
                <p style={{ margin: 0, fontSize: 13, color: isMe ? '#E2C97E' : '#ccc', lineHeight: 1.5 }}>{msg.body}</p>
                <p style={{ margin: '4px 0 0', fontSize: 10, color: '#444', textAlign: isMe ? 'right' : 'left', fontFamily: 'JetBrains Mono, monospace' }}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', background: 'var(--surface)', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKey}
          placeholder={`Message ${displayName}…`}
          rows={1}
          style={{
            flex: 1,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 13,
            color: '#fff',
            resize: 'none',
            outline: 'none',
            fontFamily: 'DM Sans, sans-serif',
            lineHeight: 1.4,
          }}
        />
        <button
          onClick={() => { if (draft.trim() && connectionId) send.mutate(); }}
          disabled={!draft.trim() || !connectionId || send.isPending}
          style={{
            background: draft.trim() ? '#C9A84C' : 'var(--muted)',
            border: 'none',
            borderRadius: 10,
            width: 40,
            height: 40,
            cursor: draft.trim() ? 'pointer' : 'not-allowed',
            color: draft.trim() ? '#000' : '#444',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s',
            flexShrink: 0,
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
