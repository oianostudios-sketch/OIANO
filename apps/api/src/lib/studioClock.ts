// apps/api/src/lib/studioClock.ts
// What the studio clock may call live, and where a studio's day begins (A09).
//
// The clock represents operating state and owns nothing. It used to treat any
// scheduled interval as live, a pending or completed booking included; it could
// never report overtime, because a session counted as live only while its end
// was still ahead; and it cut the day at the server's midnight, not the studio's,
// so a session running across midnight dropped off the clock.

interface ClockBooking {
  status: string;
  starts_at: Date;
  ends_at: Date;
}

/**
 * The session running now: a confirmed one within its time, or one still in
 * progress, even past its end, which is overtime. Scheduled is not live.
 */
export function liveSession<T extends ClockBooking>(bookings: T[], now: Date): T | undefined {
  return bookings.find((booking) => booking.starts_at <= now && (
    booking.status === 'IN_PROGRESS' || (booking.status === 'CONFIRMED' && booking.ends_at > now)
  ));
}

function zonedParts(moment: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(moment);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour'), minute: read('minute'), second: read('second') };
}

/** How far ahead of UTC the zone is at a moment, in milliseconds. */
function zoneOffset(moment: Date, timeZone: string): number {
  const local = zonedParts(moment, timeZone);
  const wholeSeconds = Math.floor(moment.getTime() / 1000) * 1000;
  return Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) - wholeSeconds;
}

/** The moment the given local calendar day begins in the zone. */
function startOfLocalDay(year: number, month: number, day: number, timeZone: string): Date {
  const asUtc = Date.UTC(year, month - 1, day);
  // Measured twice, because the offset at the first guess can differ from the
  // offset at midnight itself on a day the clocks change.
  const guess = new Date(asUtc - zoneOffset(new Date(asUtc), timeZone));
  return new Date(asUtc - zoneOffset(guess, timeZone));
}

/**
 * When a named calendar day (YYYY-MM-DD) starts and ends in the studio's zone.
 * A booking belongs to the day when it overlaps [start, end), so a session
 * running across midnight belongs to both days it touches.
 */
export function studioDateBounds(date: string, timeZone: string): { start: Date; end: Date } {
  const [year, month, day] = date.split('-').map(Number);
  return {
    start: startOfLocalDay(year, month, day, timeZone),
    end: startOfLocalDay(year, month, day + 1, timeZone),
  };
}

/** The studio's calendar date at a moment, as YYYY-MM-DD. */
export function studioDate(moment: Date, timeZone: string): string {
  const local = zonedParts(moment, timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(local.year).padStart(4, '0')}-${pad(local.month)}-${pad(local.day)}`;
}

/** The calendar date (YYYY-MM-DD) a number of days from another; dates have no zone. */
export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** When the studio's current day starts and ends, as instants. */
export function studioDayBounds(now: Date, timeZone: string): { start: Date; end: Date } {
  return studioDateBounds(studioDate(now, timeZone), timeZone);
}

/** Minutes past the studio's midnight at a moment. */
export function minutesIntoStudioDay(moment: Date, timeZone: string): number {
  const local = zonedParts(moment, timeZone);
  return local.hour * 60 + local.minute;
}
