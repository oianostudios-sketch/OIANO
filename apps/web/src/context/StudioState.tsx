/**
 * StudioState — global context that tracks whether a session is currently live.
 * Updates body.session-live class and CSS custom properties in real time.
 * Drives the state-driven color temperature system.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store';
import { api } from '../lib/api';

interface StudioStateValue {
  isLive: boolean;
  activeSession: any | null;
  todaySessions: any[];
  roomStatus: { name: string; busy: boolean; use: string }[];
  tickerText: string;
}

const Ctx = createContext<StudioStateValue>({
  isLive: false,
  activeSession: null,
  todaySessions: [],
  roomStatus: [],
  tickerText: '',
});

export function StudioStateProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  const [now, setNow] = useState(Date.now());

  // Refresh every 60s so active-session detection stays current
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { data: bookings = [] } = useQuery({
    queryKey: ['all-bookings-state'],
    queryFn: async () => (await api.get('/bookings', { params: { limit: 100 } })).data,
    enabled: !!token,
    refetchInterval: 120_000,
    select: (d) => (Array.isArray(d) ? d : d?.data ?? []),
  });

  const todaySessions = useMemo(() => {
    const today = new Date().toDateString();
    return (bookings as any[]).filter((b) => {
      if (!b.starts_at) return false;
      return new Date(b.starts_at).toDateString() === today &&
        !['CANCELLED', 'NO_SHOW'].includes(b.status ?? '');
    });
  }, [bookings]);

  const activeSession = useMemo(() => {
    return (bookings as any[]).find((b) => {
      if (!b.starts_at || !b.ends_at) return false;
      return new Date(b.starts_at).getTime() <= now && now <= new Date(b.ends_at).getTime();
    }) ?? null;
  }, [bookings, now]);

  const isLive = !!activeSession;

  // Apply body class for global CSS variable switch
  useEffect(() => {
    if (isLive) {
      document.body.classList.add('session-live');
    } else {
      document.body.classList.remove('session-live');
    }
    return () => { document.body.classList.remove('session-live'); };
  }, [isLive]);

  const roomStatus = useMemo(() => {
    const occupied = new Set(
      todaySessions
        .filter((s) => {
          if (!s.starts_at || !s.ends_at) return false;
          return new Date(s.starts_at).getTime() <= now + 30 * 60_000 &&
            now <= new Date(s.ends_at).getTime();
        })
        .map((s) => s.room?.name)
    );
    return [
      { name: 'Studio A',    use: 'Main tracking',   busy: occupied.has('Studio A') },
      { name: 'Studio B',    use: 'Production suite', busy: occupied.has('Studio B') },
      { name: 'Vocal Booth', use: 'Isolation booth',  busy: occupied.has('Vocal Booth') },
    ];
  }, [todaySessions, now]);

  // Build ticker text
  const tickerText = useMemo(() => {
    const rooms = roomStatus.map(r => `${r.name.toUpperCase()} · ${r.busy ? 'IN USE' : 'OPEN'}`).join('   ·   ');
    const next = todaySessions.find(s => new Date(s.starts_at).getTime() > now);
    const nextStr = next
      ? `NEXT SESSION ${new Date(next.starts_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · ${next.artist?.name ?? 'Artist'}`
      : 'NO FURTHER SESSIONS TODAY';
    const liveStr = activeSession
      ? `● LIVE · ${activeSession.artist?.name ?? 'Session'} · ${activeSession.room?.name ?? 'Studio'}`
      : 'STUDIO ONLINE';
    return `${liveStr}   ·   ${rooms}   ·   ${nextStr}   ·   DREAMZ MUSIC LAB`;
  }, [roomStatus, todaySessions, activeSession, now]);

  const value = useMemo(() => ({
    isLive, activeSession, todaySessions, roomStatus, tickerText,
  }), [isLive, activeSession, todaySessions, roomStatus, tickerText]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStudioState = () => useContext(Ctx);
