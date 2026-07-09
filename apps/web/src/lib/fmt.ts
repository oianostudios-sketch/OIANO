/**
 * Formatting utilities — all timezone-aware.
 * Pass tz from studio.timezone (e.g. "America/New_York").
 * Falls back to browser local if tz is undefined.
 */

export function fmtTime(iso: string, tz?: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  });
}

export function fmtDate(iso: string, tz?: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  });
}

export function fmtDateShort(iso: string, tz?: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: tz,
  });
}

export function fmtDateLong(iso: string, tz?: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: tz,
  });
}

export function fmtDuration(startsAt: string, endsAt: string): string {
  const mins = (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000;
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function fmtCurrency(amount: number | string, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}
