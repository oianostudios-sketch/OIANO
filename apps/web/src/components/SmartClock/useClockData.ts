import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../../store/auth.store';

const API      = import.meta.env.VITE_API_URL    ?? '';
// The clock is served over REST and polled. An optional WebSocket client used to
// sit here for an endpoint that was never built: nothing on the API accepts a
// WebSocket and VITE_WS_URL was never configured, so it was removed rather than
// kept as a second transport to maintain.
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
  markActivity: (sessionId: string) => Promise<void>;
  setPhase: (sessionId: string, phase: SessionPhase) => Promise<void>;
  logOvertime: (sessionId: string, minutes: number, status?: 'pending_approval' | 'approved' | 'logged') => Promise<void>;
} {
  const token = useAuthStore((state) => state.token);
  const [data, setData]     = useState<ClockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const pollRef             = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRest = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/studio-clock`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
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
  }, [token]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    fetchRest();
    pollRef.current = setInterval(fetchRest, POLL_MS);
  }, [fetchRest]);

  useEffect(() => {
    startPolling();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [startPolling]);

  const markActivity = useCallback(async (sessionId: string) => {
    await fetch(`${API}/api/studio-clock/sessions/${sessionId}/activity`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    await fetchRest();
  }, [fetchRest, token]);

  const setPhase = useCallback(async (sessionId: string, phase: SessionPhase) => {
    await fetch(`${API}/api/studio-clock/sessions/${sessionId}/phase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ phase }),
    });
    await fetchRest();
  }, [fetchRest, token]);

  const logOvertime = useCallback(async (
    sessionId: string,
    minutes: number,
    status: 'pending_approval' | 'approved' | 'logged' = 'pending_approval'
  ) => {
    await fetch(`${API}/api/studio-clock/sessions/${sessionId}/overtime`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ minutes, status }),
    });
    await fetchRest();
  }, [fetchRest, token]);

  return { data, loading, error, markActivity, setPhase, logOvertime };
}
