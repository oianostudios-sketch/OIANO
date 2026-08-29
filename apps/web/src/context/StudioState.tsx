/**
 * StudioState — global context that tracks whether a session is currently live.
 * Updates body.session-live class and CSS custom properties in real time.
 * Drives the state-driven color temperature system.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store';
import { api } from '../lib/api';

// ── Sun arc — OIANO's mark is a sun, so the ambient light itself should trace
// a real day: dim ember before dawn, warming through morning gold, peaking
// bright at midday, deepening through afternoon, flaring amber at dusk, then
// fading back down. Stops are (hour, rgb, intensity); computeSunArc lerps
// between the two bracketing the current time so it drifts smoothly rather
// than jumping. Independent of session-live, which still wins as the
// "something is happening right now" signal — this is just the backdrop.
const SUN_ARC_STOPS: { h: number; rgb: [number, number, number]; intensity: number }[] = [
  { h: 0,    rgb: [58, 46, 34],    intensity: 0.35 },
  { h: 5,    rgb: [88, 66, 42],    intensity: 0.45 },
  { h: 6.5,  rgb: [232, 130, 58],  intensity: 0.75 },
  { h: 9,    rgb: [240, 196, 104], intensity: 1.0  },
  { h: 13,   rgb: [255, 233, 184], intensity: 1.25 },
  { h: 16,   rgb: [226, 165, 66],  intensity: 1.0  },
  { h: 18.5, rgb: [217, 114, 46],  intensity: 0.85 },
  { h: 21,   rgb: [90, 62, 38],    intensity: 0.5  },
  { h: 24,   rgb: [58, 46, 34],    intensity: 0.35 },
];

function computeSunArc(date: Date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  let i = 0;
  while (i < SUN_ARC_STOPS.length - 1 && SUN_ARC_STOPS[i + 1].h < hour) i++;
  const a = SUN_ARC_STOPS[i];
  const b = SUN_ARC_STOPS[Math.min(i + 1, SUN_ARC_STOPS.length - 1)];
  const span = b.h - a.h || 1;
  const t = Math.min(1, Math.max(0, (hour - a.h) / span));
  const rgb = a.rgb.map((v, idx) => Math.round(v + (b.rgb[idx] - v) * t)) as [number, number, number];
  const intensity = a.intensity + (b.intensity - a.intensity) * t;
  return { color: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`, intensity: Number(intensity.toFixed(2)) };
}

interface StudioStateValue {
  studioName: string;
  isLive: boolean;
  activeSession: any | null;
  todaySessions: any[];
  roomStatus: { name: string; busy: boolean; use: string }[];
  tickerText: string;
}

const Ctx = createContext<StudioStateValue>({
  studioName: 'OIANO Studio Network',
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

  const { data: studio } = useQuery({
    queryKey: ['studio'],
    queryFn: async () => (await api.get('/studio/current')).data,
    enabled: !!token,
    staleTime: 5 * 60_000,
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

  // Drive the ambient sun-arc CSS vars (see computeSunArc above) — recomputed
  // on the same 60s tick as everything else here, applied to :root so any
  // stylesheet (global ambient glow, PulseDashboard's own corner glow) can
  // read it without each page wiring up its own clock.
  const sunArc = useMemo(() => computeSunArc(new Date(now)), [now]);
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--sun-arc-color', sunArc.color);
    root.setProperty('--sun-arc-intensity', String(sunArc.intensity));
    // Pre-scaled opacity bands, computed here rather than via calc(var())
    // in the stylesheet — calc() combined with var() on pseudo-element
    // opacity doesn't reliably re-resolve on custom-property change in
    // every engine, plain var() substitution does.
    root.setProperty('--sun-arc-glow-a',   (0.03 * sunArc.intensity).toFixed(3));
    root.setProperty('--sun-arc-glow-b',   (0.055 * sunArc.intensity).toFixed(3));
    root.setProperty('--sun-arc-wash-op',  (0.05 * sunArc.intensity).toFixed(3));
  }, [sunArc]);

  // Apply body class for global CSS variable switch
  useEffect(() => {
    if (isLive) {
      document.body.classList.add('session-live');
    } else {
      document.body.classList.remove('session-live');
    }
    return () => { document.body.classList.remove('session-live'); };
  }, [isLive]);

  const roomStatus: StudioStateValue['roomStatus'] = useMemo(() => {
    const occupied = new Set(
      todaySessions
        .filter((s) => {
          if (!s.starts_at || !s.ends_at) return false;
          return new Date(s.starts_at).getTime() <= now + 30 * 60_000 &&
            now <= new Date(s.ends_at).getTime();
        })
        .map((s) => s.room?.name)
    );
    return (studio?.rooms ?? []).map((room: any) => ({
      name: room.name,
      use: room.description ?? 'Studio room',
      busy: occupied.has(room.name),
    }));
  }, [studio?.rooms, todaySessions, now]);

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
    return `${liveStr}   ·   ${rooms}   ·   ${nextStr}   ·   ${(studio?.name ?? 'OIANO STUDIO NETWORK').toUpperCase()}`;
  }, [roomStatus, todaySessions, activeSession, now, studio?.name]);

  const value = useMemo(() => ({
    studioName: studio?.name ?? 'OIANO Studio Network', isLive, activeSession, todaySessions, roomStatus, tickerText,
  }), [studio?.name, isLive, activeSession, todaySessions, roomStatus, tickerText]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStudioState = () => useContext(Ctx);
