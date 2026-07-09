import { useEffect, useRef, useState, useCallback } from 'react';

const API      = import.meta.env.VITE_API_URL    ?? '';
const WS_URL   = import.meta.env.VITE_WS_URL     ?? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/clock`;
const POLL_MS  = 30_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionStatus = 'active' | 'ending_soon' | 'overtime' | 'idle';
export type SessionPhase = 'setup' | 'recording' | 'break' | 'review' | 'wrap_up';
export type ClockEventType = 'clock_update' | 'phase_change' | 'milestone_update' | 'overtime' | 'idle';

export interface SessionArc {
  startAngle: number;
  endAngle: number;
  status: SessionStatus;
  minutesRemaining: number;
}

export interface RhythmArc {
  startAngle: number;
  endAngle: number;
  energy: number;
  type: 'peak' | 'upcoming' | 'low';
}

export interface ClockData {
  currentTime: string;
  sessionStatus: SessionStatus;
  eventType: ClockEventType;
  activeSession: {
    id: string;
    artistName: string;
    room: string;
    projectId: string | null;
    projectTitle: string | null;
    phase: SessionPhase;
    phaseLabel: string;
    overtimeStatus: string;
    overtimeLoggedMinutes: number;
    minutesRemaining: number;
    minutesElapsed: number;
    minutesTotal: number;
    scheduledAt: string;
    endsAt: string;
    estimatedEndTime: string | null;
    recommendedBreakAt: string | null;
    contributors: Array<{ id: string; name: string; role: string }>;
  } | null;
  outerRing: SessionArc[];
  innerRing: RhythmArc[];
  phaseRing: Array<{
    phase: SessionPhase;
    label: string;
    startAngle: number;
    endAngle: number;
    active: boolean;
  }>;
  milestone: {
    id: string;
    title: string;
    type: string;
    status: string;
    dueAt: string | null;
    minutesRemaining: number | null;
  } | null;
  upcomingDeliverables: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    dueAt: string | null;
  }>;
  prediction: {
    estimatedEndTime: string | null;
    recommendedBreakAt: string | null;
    remainingWorkloadMinutes: number;
    workloadRisk: 'low' | 'medium' | 'high';
  };
  studioLoad: number;
  bestRecordingWindows: number[];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useClockData(): {
  data: ClockData | null;
  loading: boolean;
  error: string | null;
  lastEvent: ClockEventType | null;
  markActivity: (sessionId: string) => Promise<void>;
  setPhase: (sessionId: string, phase: SessionPhase) => Promise<void>;
  logOvertime: (sessionId: string, minutes: number, status?: 'pending_approval' | 'approved' | 'logged') => Promise<void>;
} {
  const [data, setData]     = useState<ClockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<ClockEventType | null>(null);
  const wsRef               = useRef<WebSocket | null>(null);
  const pollRef             = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRest = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/studio-clock`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ClockData = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[Clock] REST fetch failed:', msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    fetchRest();
    pollRef.current = setInterval(fetchRest, POLL_MS);
  }, [fetchRest]);

  useEffect(() => {
    let didCleanup = false;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      const connectTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.warn('[Clock] WS connect timeout — falling back to REST polling');
          ws.close();
          if (!didCleanup) startPolling();
        }
      }, 3_000);

      ws.onopen = () => {
        clearTimeout(connectTimeout);
        setLoading(false);
        console.log('[Clock] WebSocket connected');
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.data) {
            setLastEvent(msg.type);
            setData(msg.data);
            setError(null);
            setLoading(false);
          }
        } catch {
          console.error('[Clock] WS message parse error');
        }
      };

      ws.onerror = () => {
        clearTimeout(connectTimeout);
        console.warn('[Clock] WS error — falling back to REST polling');
        if (!didCleanup) startPolling();
      };

      ws.onclose = () => {
        wsRef.current = null;
      };
    } catch {
      startPolling();
    }

    return () => {
      didCleanup = true;
      wsRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [startPolling]);

  const markActivity = useCallback(async (sessionId: string) => {
    await fetch(`${API}/api/studio-clock/sessions/${sessionId}/activity`, { method: 'POST' });
    await fetchRest();
  }, [fetchRest]);

  const setPhase = useCallback(async (sessionId: string, phase: SessionPhase) => {
    await fetch(`${API}/api/studio-clock/sessions/${sessionId}/phase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase }),
    });
    await fetchRest();
  }, [fetchRest]);

  const logOvertime = useCallback(async (
    sessionId: string,
    minutes: number,
    status: 'pending_approval' | 'approved' | 'logged' = 'pending_approval'
  ) => {
    await fetch(`${API}/api/studio-clock/sessions/${sessionId}/overtime`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes, status }),
    });
    await fetchRest();
  }, [fetchRest]);

  return { data, loading, error, lastEvent, markActivity, setPhase, logOvertime };
}
