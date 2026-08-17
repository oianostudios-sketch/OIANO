// Single source of truth for booking-status label/color, replacing 10
// independently-authored copies of the same PENDING/CONFIRMED/IN_PROGRESS/
// COMPLETED/CANCELLED/NO_SHOW mapping across the app (AUD-002). Each consumer
// previously picked its own shade of gold/green/red — this consolidates them
// into one canonical palette rather than preserving eight slightly different
// greens. Existing consumers used two different shapes (Tailwind utility
// classes for pill-style badges, or a single hex value for text/dot/calendar
// accents) — both are exported so every call site can migrate without a
// structural rewrite of its own JSX.

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export const BOOKING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

export const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING:     'Pending',
  CONFIRMED:   'Confirmed',
  IN_PROGRESS: 'In progress',
  COMPLETED:   'Completed',
  CANCELLED:   'Cancelled',
  NO_SHOW:     'No-show',
};

// A friendlier artist-facing phrasing for the same statuses (was
// BookingDetailPage-only; centralized since it's genuinely status content).
export const STATUS_MESSAGE: Record<BookingStatus, string> = {
  PENDING:     "Waiting for studio confirmation. You'll be notified once confirmed.",
  CONFIRMED:   'Your session is confirmed. Show up on time and bring your A-game.',
  IN_PROGRESS: "You're in session right now.",
  COMPLETED:   'Session complete. Check your profile for updated session history.',
  CANCELLED:   'This booking was cancelled.',
  NO_SHOW:     'This session was marked as no-show.',
};

// One canonical hex per status, for pages that render status as a text
// color, a dot, or a chart accent rather than a full Tailwind pill.
export const STATUS_HEX: Record<BookingStatus, string> = {
  PENDING:     '#C9A84C', // OIANO gold — already the de facto choice in most files
  CONFIRMED:   '#22c55e',
  IN_PROGRESS: '#3B8BFF',
  COMPLETED:   '#6b7280',
  CANCELLED:   '#ef4444',
  NO_SHOW:     '#f97316', // distinct from CANCELLED — several prior copies conflated the two
};

// Tailwind utility classes for the dark-pill treatment (bg+text+border).
export const STATUS_TAILWIND: Record<BookingStatus, string> = {
  PENDING:     'bg-yellow-900/30 text-yellow-400 border-yellow-900/30',
  CONFIRMED:   'bg-green-900/30 text-green-400 border-green-900/30',
  IN_PROGRESS: 'bg-blue-900/30 text-blue-400 border-blue-900/30',
  COMPLETED:   'bg-zinc-800 text-zinc-400 border-zinc-700',
  CANCELLED:   'bg-red-900/30 text-red-400 border-red-900/30',
  NO_SHOW:     'bg-orange-900/30 text-orange-400 border-orange-900/30',
};

// Small solid-fill dot to pair with the pill (e.g. a status indicator before a label).
export const STATUS_DOT_TAILWIND: Record<BookingStatus, string> = {
  PENDING:     'bg-yellow-400',
  CONFIRMED:   'bg-green-400',
  IN_PROGRESS: 'bg-blue-400',
  COMPLETED:   'bg-zinc-500',
  CANCELLED:   'bg-red-400',
  NO_SHOW:     'bg-orange-400',
};

/** Hex + alpha (0-1) -> "#rrggbbaa" for translucent accents (e.g. calendar event blocks). */
export function hexAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}
