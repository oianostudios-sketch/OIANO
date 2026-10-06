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

function zonedParts(moment: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(moment);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour'), minute: read('minute'), second: read('second') };
}

function zoneOffset(moment: Date, timeZone: string): number {
  const local = zonedParts(moment, timeZone);
  const wholeSeconds = Math.floor(moment.getTime() / 1000) * 1000;
  return Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) - wholeSeconds;
}

/**
 * The instant a wall-clock time (date YYYY-MM-DD, time HH:MM, "24:00" allowed)
 * names at the studio, as an ISO string. The same conversion the API's studio
 * clock uses for the studio's day (C29); the browser's own zone is used only
 * when no studio zone is known.
 */
export function studioTimeToIso(date: string, time: string, tz?: string): string {
  if (!tz) return new Date(`${date}T${time}:00`).toISOString();
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Measured twice: the offset at the first guess can differ on a day the clocks change.
  const guess = new Date(asUtc - zoneOffset(new Date(asUtc), tz));
  return new Date(asUtc - zoneOffset(guess, tz)).toISOString();
}

/** The calendar date (YYYY-MM-DD) at a moment in the studio's zone, or the browser's. */
export function studioDate(moment: Date, tz?: string): string {
  if (!tz) {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
  }
  const local = zonedParts(moment, tz);
  return `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
}

export function fmtCurrency(amount: number | string, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}
