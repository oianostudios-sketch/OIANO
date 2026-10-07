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

/** The wall-clock time (HH:MM, 24-hour) at a moment in the studio's zone, or the browser's. */
export function studioClock(moment: Date, tz?: string): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  if (!tz) return `${pad(moment.getHours())}:${pad(moment.getMinutes())}`;
  const local = zonedParts(moment, tz);
  return `${pad(local.hour)}:${pad(local.minute)}`;
}

/**
 * A Date whose local fields (getHours, getDate, ...) read the studio's wall clock
 * at that moment. For grids that lay sessions out with local-date arithmetic:
 * the result names a different instant, so it is for layout only, never for
 * sending back to the API.
 */
export function studioWallClock(moment: Date, tz?: string): Date {
  if (!tz) return new Date(moment.getTime());
  const local = zonedParts(moment, tz);
  return new Date(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
}

/** Minutes since midnight at the studio, for placing a session on the studio's day. */
export function studioMinutes(moment: Date, tz?: string): number {
  if (!tz) return moment.getHours() * 60 + moment.getMinutes();
  const local = zonedParts(moment, tz);
  return local.hour * 60 + local.minute;
}

/** The zone's short name at that instant ("EST", "GMT+1"). */
export function zoneName(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(iso));
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? tz;
}

function viewerZone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; }
}

/**
 * The studio zone's short name, but only for a viewer whose own clock reads
 * differently at that instant: an artist booking from elsewhere needs to know
 * whose 2 PM it is, someone in the studio's zone does not. '' without a zone.
 */
export function studioZoneLabel(iso: string, tz?: string, viewerTz: string | undefined = viewerZone()): string {
  if (!tz) return '';
  if (viewerTz) {
    const moment = new Date(iso);
    if (zoneOffset(moment, tz) === zoneOffset(moment, viewerTz)) return '';
  }
  return zoneName(iso, tz);
}

/** A studio-anchored time, labelled with the studio's zone when the viewer is elsewhere. */
export function fmtStudioTime(iso: string, tz?: string, viewerTz: string | undefined = viewerZone()): string {
  const label = studioZoneLabel(iso, tz, viewerTz);
  return label ? `${fmtTime(iso, tz)} ${label}` : fmtTime(iso, tz);
}

/** A session's span at the studio ("02:00 PM – 05:30 PM EST"), labelled once at the end. */
export function fmtStudioRange(startIso: string, endIso: string, tz?: string, separator = ' – ', viewerTz: string | undefined = viewerZone()): string {
  const label = studioZoneLabel(startIso, tz, viewerTz);
  const span = `${fmtTime(startIso, tz)}${separator}${fmtTime(endIso, tz)}`;
  return label ? `${span} ${label}` : span;
}

export function fmtCurrency(amount: number | string, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}
