import { BookingStatus, STATUS_DOT_TAILWIND, STATUS_LABEL, STATUS_TAILWIND } from '../lib/bookingStatus';

/** Drop-in booking-status pill — the shared replacement for AUD-002's 10
 * independently-authored status-color maps. Use this directly wherever a
 * page just needs to show a status label; pages that need the raw
 * color/label data for a non-pill treatment (calendar blocks, chart accents)
 * should import from lib/bookingStatus instead. */
export default function StatusBadge({ status, withDot = false, className = '' }: { status: string; withDot?: boolean; className?: string }) {
  const key = status as BookingStatus;
  const classes = STATUS_TAILWIND[key] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700';
  const dot = STATUS_DOT_TAILWIND[key] ?? 'bg-zinc-500';
  const label = STATUS_LABEL[key] ?? status;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-mono uppercase tracking-wide ${classes} ${className}`}>
      {withDot && <i className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {label}
    </span>
  );
}
