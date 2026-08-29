import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export default function NotificationBell() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: notifs = [] } = useQuery<Notif[]>({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get('/notifications')).data,
    enabled: !!user,
    refetchInterval: 60_000,
  });

  // One-shot "it just landed" burst — distinct from the continuous unread-count
  // pulse below, which just means "something is unread" regardless of timing.
  const [burst, setBurst] = useState(false);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-fetch when SSE fires a notification or booking event
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const t = e.detail?.type;
      if (t === 'notification' || t === 'booking_updated' || t === 'session_delivered') {
        qc.invalidateQueries({ queryKey: ['notifications'] });
        setBurst(true);
        if (burstTimer.current) clearTimeout(burstTimer.current);
        burstTimer.current = setTimeout(() => setBurst(false), 700);
      }
    };
    window.addEventListener('sse', handler as EventListener);
    return () => {
      window.removeEventListener('sse', handler as EventListener);
      if (burstTimer.current) clearTimeout(burstTimer.current);
    };
  }, [qc]);

  const unread = notifs.filter((n) => !n.read_at).length;
  const label = unread > 0 ? `Notifications (${unread} unread)` : 'Notifications';

  return (
    <button
      onClick={() => navigate('/communications?view=priority')}
      className={`relative text-zinc-500 hover:text-white transition-colors p-1${burst ? ' bell-burst' : ''}`}
      aria-label={label}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-gold rounded-full text-black text-[9px] font-bold flex items-center justify-center notif-badge-pulse">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}
