import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store';
import { useToast } from '../components/Toast';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

/**
 * Opens a persistent SSE connection to /api/notifications/stream.
 * Reconnects with exponential backoff. On events:
 *   - booking_updated  -> invalidate queries + toast if status is notable
 *   - session_delivered -> invalidate + toast
 *   - wallet_updated   -> invalidate wallet + me queries + toast
 */
export function useSSE() {
  const { token } = useAuthStore();
  const qc = useQueryClient();
  const toast = useToast();
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(1000);

  useEffect(() => {
    if (!token) return;
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      if (esRef.current) esRef.current.close();

      let ticket: string;
      try {
        const response = await fetch(`${API}/api/notifications/stream-ticket`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Unable to authorize notification stream');
        ({ ticket } = await response.json());
      } catch {
        if (!disposed) retryTimer = setTimeout(connect, Math.min(retryRef.current, 30_000));
        retryRef.current = Math.min(retryRef.current * 2, 30_000);
        return;
      }
      if (disposed) return;

      const es = new EventSource(`${API}/api/notifications/stream?ticket=${encodeURIComponent(ticket)}`);
      esRef.current = es;

      es.onopen = () => {
        retryRef.current = 1000; // reset backoff on success
      };

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);

          // ── booking_updated ────────────────────────────────────────────────
          if (event.type === 'booking_updated') {
            qc.invalidateQueries({ queryKey: ['bookings'] });
            qc.invalidateQueries({ queryKey: ['all-bookings'] });
            qc.invalidateQueries({ queryKey: ['analytics'] });
            qc.invalidateQueries({ queryKey: ['availability'] });
            // Maintenance console (OIANO_ADMIN) — a booking status change is
            // exactly what its live-session/needs-action counts represent.
            // Without this it only ever finds out on its next 15-60s poll.
            qc.invalidateQueries({ queryKey: ['maintenance-summary'] });
            qc.invalidateQueries({ queryKey: ['maintenance-studios'] });
            qc.invalidateQueries({ queryKey: ['maintenance-bookings'] });
            if (event.bookingId) {
              qc.invalidateQueries({ queryKey: ['booking', event.bookingId] });
            }

            // Toast the status change so the artist knows without refreshing
            switch (event.status) {
              case 'CONFIRMED':
                toast.success('Your session is confirmed — see you in the studio.');
                break;
              case 'CANCELLED':
                toast.error('A booking was cancelled. Check your sessions for details.');
                break;
              case 'COMPLETED':
                toast.info('Session marked complete. Check your profile for the update.');
                break;
              case 'NO_SHOW':
                toast.error('A session was marked as no-show.');
                break;
              default:
                break;
            }
          }

          // ── session_delivered ──────────────────────────────────────────────
          else if (event.type === 'session_delivered') {
            if (event.bookingId) {
              qc.invalidateQueries({ queryKey: ['booking', event.bookingId] });
            }
            qc.invalidateQueries({ queryKey: ['bookings'] });
            toast.info('Your session files are ready — open the booking to download.');
          }

          // ── wallet_updated ─────────────────────────────────────────────────
          else if (event.type === 'wallet_updated') {
            qc.invalidateQueries({ queryKey: ['wallet'] });
            qc.invalidateQueries({ queryKey: ['me'] });
            qc.invalidateQueries({ queryKey: ['analytics'] });
            if (typeof event.newBalance === 'number') {
              toast.info(`Wallet updated — new balance $${Number(event.newBalance).toFixed(2)}`);
            }
          }

          // ── new_message ────────────────────────────────────────────────────
          else if (event.type === 'new_message') {
            if (event.bookingId) {
              qc.invalidateQueries({ queryKey: ['booking', event.bookingId] });
              qc.invalidateQueries({ queryKey: ['booking-messages', event.bookingId] });
            }
            if (event.senderName) {
              toast.info(`New message from ${event.senderName}`);
            }
          }

          // ── notification (persisted to DB) ────────────────────────────────
          if (event.type === 'notification') {
            qc.invalidateQueries({ queryKey: ['notifications'] });
            const priority=event.notif?.payload?.priority;
            const message=event.notif?.title;
            if(message){
              if(priority==='CRITICAL'||priority==='HIGH')toast.error(message);
              else toast.info(message);
            }
          }

          // ── studio_announcement ────────────────────────────────────────────
          else if (event.type === 'studio_announcement') {
            qc.invalidateQueries({ queryKey: ['studio-announcement'] });
            if (event.announcement?.title) {
              toast.info(`📢 ${event.announcement.title}`);
            }
          }

          // ── activity (generic bridge from the server-side activity-event
          // bus — see apps/api/src/services/sseActivityBridge.ts) ───────────
          else if (event.type === 'activity') {
            qc.invalidateQueries({ queryKey: ['network-metrics'] });
            qc.invalidateQueries({ queryKey: ['network-orbit'] });
            qc.invalidateQueries({ queryKey: ['artist-activity'] });
          }

          // ── Dispatch to window so inline components can react ──────────────
          window.dispatchEvent(new CustomEvent('sse', { detail: event }));

        } catch { /* malformed event -- ignore */ }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        // Exponential backoff: 1s -> 2s -> 4s -> 8s, cap 30s
        const delay = Math.min(retryRef.current, 30_000);
        retryRef.current = delay * 2;
        if (!disposed) retryTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [token]);
}
