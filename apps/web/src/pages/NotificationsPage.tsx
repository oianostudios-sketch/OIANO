// apps/web/src/pages/NotificationsPage.tsx
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

interface ConnectArtist {
  id: string;
  name: string;
  alias: string | null;
  avatar_url: string | null;
  user_id: string;
}

interface Connection {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  created_at: string;
  initiator: ConnectArtist;
  recipient: ConnectArtist;
  messages: Array<{ id: string; body: string; created_at: string; sender_id: string }>;
}

const TYPE_ICON: Record<string, string> = {
  booking_confirmed:   '✓',
  booking_cancelled:   '✕',
  booking_completed:   '◆',
  booking_in_progress: '▶',
  booking_no_show:     '!',
  session_delivered:   '↓',
  wallet_updated:      '$',
  new_message:         '✉',
  notification:        '●',
};

const TYPE_COLOR: Record<string, string> = {
  booking_confirmed:   '#1D9E75',
  booking_cancelled:   '#ef4444',
  booking_completed:   '#888',
  booking_in_progress: '#3B8BFF',
  booking_no_show:     '#E8823A',
  session_delivered:   '#C9A84C',
  wallet_updated:      '#C9A84C',
  new_message:         '#8B5CF6',
};

function ago(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function notifLink(notif: Notif): string | null {
  const p = notif.payload as any;
  if (p?.booking_id) return `/bookings/${p.booking_id}`;
  return null;
}

function Avatar({ src, name, size = 38 }: { src?: string | null; name: string; size?: number }) {
  if (src) return (
    <img src={src} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '1px solid #1e1e1e', flexShrink: 0 }} />
  );
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#1e1e1e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.37, color: '#555', fontWeight: 600, flexShrink: 0 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function NotificationsPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isArtist = user?.role === 'ARTIST';
  const [tab, setTab] = useState<'notifications' | 'messages'>('notifications');

  const { data: notifs = [], isLoading: nLoading } = useQuery<Notif[]>({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get('/notifications')).data,
  });

  const { data: connections = [], isLoading: cLoading } = useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: async () => (await api.get('/connect')).data,
    enabled: isArtist,
    refetchInterval: 15_000,
  });

  const markRead = useMutation({
    mutationFn: () => api.patch('/notifications/read'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => { markRead.mutate(); }, []);

  const backTo = user?.role === 'STUDIO_ADMIN' ? '/admin' : '/dashboard';
  const unread = notifs.filter(n => !n.read_at).length;

  // For each connection, find the "other" artist using user_id matching
  function otherArtist(conn: Connection): ConnectArtist {
    return conn.initiator.user_id === user?.id ? conn.recipient : conn.initiator;
  }

  const pendingConns = connections.filter(c => c.status === 'PENDING' && c.initiator.user_id !== user?.id);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#f5f5f5', fontFamily: 'DM Sans, sans-serif' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid #1e1e1e', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 10 }}>
        <button onClick={() => navigate(backTo)}
          style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14, padding: 0 }}>
          ← Back
        </button>
        <h1 style={{ margin: 0, fontFamily: 'Playfair Display, serif', fontSize: 20, color: '#C9A84C', fontWeight: 600 }}>
          Inbox
        </h1>
        {unread > 0 && tab === 'notifications' && (
          <span style={{ fontSize: 11, color: '#555', marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace' }}>
            {unread} unread
          </span>
        )}
      </header>

      {/* Tabs — only show for artists */}
      {isArtist && (
        <div style={{ display: 'flex', borderBottom: '1px solid #1a1a1a', background: '#0a0a0a', position: 'sticky', top: 57, zIndex: 9 }}>
          {(['notifications', 'messages'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, background: 'none', border: 'none', padding: '12px 16px',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                color: tab === t ? '#C9A84C' : '#555',
                borderBottom: `2px solid ${tab === t ? '#C9A84C' : 'transparent'}`,
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {t === 'notifications' ? 'Notifications' : 'Messages'}
              {t === 'notifications' && unread > 0 && (
                <span style={{ background: '#C9A84C', color: '#000', borderRadius: 8, fontSize: 9, fontWeight: 700, padding: '1px 5px', fontFamily: 'monospace' }}>{unread}</span>
              )}
              {t === 'messages' && pendingConns.length > 0 && (
                <span style={{ background: '#8B5CF6', color: '#fff', borderRadius: 8, fontSize: 9, fontWeight: 700, padding: '1px 5px', fontFamily: 'monospace' }}>{pendingConns.length}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 100px' }}>

        {/* ── Notifications tab ── */}
        {tab === 'notifications' && (
          <>
            {nLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{ height: 72, borderRadius: 12, background: '#141414', animation: 'pulse 1.5s ease infinite', animationDelay: `${i*0.1}s` }} />
                ))}
              </div>
            )}
            {!nLoading && notifs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🔔</div>
                <p style={{ color: '#555', fontSize: 15, margin: '0 0 8px' }}>No notifications yet.</p>
                <p style={{ color: '#333', fontSize: 13 }}>Book a session and you'll hear from us here.</p>
                {isArtist && (
                  <Link to="/book" style={{ display: 'inline-block', marginTop: 20, padding: '10px 24px', background: '#C9A84C', color: '#000', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
                    Book a session →
                  </Link>
                )}
              </div>
            )}
            {!nLoading && notifs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {notifs.map((notif, i) => {
                  const link = notifLink(notif);
                  const isUnread = !notif.read_at;
                  const color = TYPE_COLOR[notif.type] ?? '#666';
                  const icon = TYPE_ICON[notif.type] ?? '●';
                  const inner = (
                    <div style={{
                      display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px',
                      background: isUnread ? 'rgba(201,168,76,0.03)' : 'transparent',
                      borderRadius: 12, border: `1px solid ${isUnread ? 'rgba(201,168,76,0.08)' : '#141414'}`,
                      cursor: link ? 'pointer' : 'default', transition: 'background 0.15s',
                      animation: `fade-in 0.3s ease both`, animationDelay: `${i * 0.04}s`,
                    }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color, fontWeight: 700, marginTop: 2 }}>
                        {icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: isUnread ? 600 : 400, color: isUnread ? '#f0ede8' : '#ccc', lineHeight: 1.3 }}>{notif.title}</p>
                          <span style={{ fontSize: 10, color: '#444', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0, paddingTop: 2 }}>{ago(notif.created_at)}</span>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666', lineHeight: 1.5 }}>{notif.body}</p>
                        {link && <p style={{ margin: '6px 0 0', fontSize: 11, color, fontFamily: 'JetBrains Mono, monospace' }}>View →</p>}
                      </div>
                      {isUnread && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#C9A84C', flexShrink: 0, marginTop: 6 }} />}
                    </div>
                  );
                  return link ? (
                    <Link key={notif.id} to={link} style={{ textDecoration: 'none' }}>{inner}</Link>
                  ) : (
                    <div key={notif.id}>{inner}</div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Messages tab (artist only) ── */}
        {tab === 'messages' && isArtist && (
          <>
            {cLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ height: 72, borderRadius: 12, background: '#141414', animation: 'pulse 1.5s ease infinite', animationDelay: `${i*0.1}s` }} />
                ))}
              </div>
            )}
            {!cLoading && connections.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>💬</div>
                <p style={{ color: '#555', fontSize: 15, margin: '0 0 8px' }}>No messages yet.</p>
                <p style={{ color: '#333', fontSize: 13 }}>Discover artists and start connecting.</p>
                <Link to="/discover" style={{ display: 'inline-block', marginTop: 20, padding: '10px 24px', background: '#C9A84C', color: '#000', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
                  Discover artists →
                </Link>
              </div>
            )}
            {!cLoading && connections.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {connections.map((conn, i) => {
                  const other = otherArtist(conn);
                  const displayName = other.alias ?? other.name;
                  const lastMsg = conn.messages[0];
                  const isPending = conn.status === 'PENDING';
                  const isIncoming = isPending && conn.initiator.user_id !== user?.id;

                  return (
                    <Link key={conn.id} to={`/connect/${other.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                        background: isIncoming ? 'rgba(139,92,246,0.04)' : 'transparent',
                        borderRadius: 12,
                        border: `1px solid ${isIncoming ? 'rgba(139,92,246,0.15)' : '#141414'}`,
                        transition: 'background 0.15s',
                        animation: `fade-in 0.3s ease both`, animationDelay: `${i * 0.05}s`,
                      }}>
                        <Avatar src={other.avatar_url} name={displayName} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#e8e4de', lineHeight: 1.2 }}>{displayName}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              {isPending && (
                                <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', padding: '2px 6px', borderRadius: 4, background: isIncoming ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)', color: isIncoming ? '#8B5CF6' : '#444', letterSpacing: '0.05em' }}>
                                  {isIncoming ? 'NEW' : 'PENDING'}
                                </span>
                              )}
                              {lastMsg && (
                                <span style={{ fontSize: 10, color: '#444', fontFamily: 'JetBrains Mono, monospace' }}>{ago(lastMsg.created_at)}</span>
                              )}
                            </div>
                          </div>
                          <p style={{ margin: '3px 0 0', fontSize: 13, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                            {lastMsg ? lastMsg.body : (isIncoming ? 'Wants to connect with you' : 'No messages yet')}
                          </p>
                        </div>
                        <span style={{ color: '#333', fontSize: 16, flexShrink: 0 }}>›</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      <style>{`
        @keyframes fade-in { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
      `}</style>
    </div>
  );
}
