/**
 * ArtistStatusToggle — one-tap booking-availability badge, visible on every
 * screen for ARTIST users (mirrors StudioPulseWidget's always-mounted pattern).
 * Emits status.changed server-side, debounced so rapid taps don't spam the Clock.
 */
import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

type Status = 'AVAILABLE_FOR_BOOKING' | 'IN_SESSION' | 'UNAVAILABLE';

const STATUS_CYCLE: Status[] = ['AVAILABLE_FOR_BOOKING', 'IN_SESSION', 'UNAVAILABLE'];

const STATUS_META: Record<Status, { label: string; dotClass: string }> = {
  AVAILABLE_FOR_BOOKING: { label: 'AVAILABLE',   dotClass: 'ast-dot-available' },
  IN_SESSION:            { label: 'IN SESSION',  dotClass: 'ast-dot-in-session' },
  UNAVAILABLE:           { label: 'UNAVAILABLE', dotClass: 'ast-dot-unavailable' },
};

const DEBOUNCE_MS = 2500;

export default function ArtistStatusToggle() {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);

  const [status, setStatus] = useState<Status>(
    (user?.artist?.status as Status) ?? 'AVAILABLE_FOR_BOOKING',
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (user?.role !== 'ARTIST' || !user.artist) return null;

  function handleTap() {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(status) + 1) % STATUS_CYCLE.length];
    setStatus(next);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      api.patch('/artists/me/status', { status: next })
        .then(() => {
          const current = useAuthStore.getState();
          if (current.user && current.token) {
            setAuth(current.token, {
              ...current.user,
              artist: { ...current.user.artist!, status: next },
            });
          }
        })
        .catch((e) => console.error('[status] update failed:', e?.response?.data?.error ?? e?.message));
    }, DEBOUNCE_MS);
  }

  const meta = STATUS_META[status];

  return (
    <div
      className="artist-status-toggle"
      onClick={handleTap}
      title="Tap to change your booking availability"
    >
      <span className={`ast-dot ${meta.dotClass}`} />
      <span className="ast-label">{meta.label}</span>
    </div>
  );
}
