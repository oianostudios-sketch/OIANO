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

/** The studio's wall-clock time at a moment, as HH:MM on a 24-hour clock. */
export function studioTime(moment: Date, timeZone: string): string {
  const local = zonedParts(moment, timeZone);
  return `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The instant at which the studio's wall clock reads a local date and time.
 * `month` is 1-based, and an out-of-range day rolls over as Date.UTC rolls it.
 *
 * Twice a year a wall-clock time does not name exactly one instant. Both cases
 * resolve the way Temporal's 'compatible' disambiguation does:
 * - a time inside the spring-forward gap (01:30 in London on the last Sunday of
 *   March) does not exist, so it moves forward by the length of the gap, read
 *   with the offset in force before the change (01:30 becomes 02:30 BST);
 * - a time in the fall-back overlap (01:30 in London on the last Sunday of
 *   October) happens twice, and the earlier one, before the clocks go back, wins.
 */
export function studioLocalToInstant(
  local: { year: number; month: number; day: number; hour: number; minute: number; second?: number; millisecond?: number },
  timeZone: string,
): Date {
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second ?? 0, local.millisecond ?? 0);
  // The zone's offsets a day either side; no zone changes its clocks twice in two days.
  const offsetBefore = zoneOffset(new Date(asUtc - DAY_MS), timeZone);
  const offsetAfter = zoneOffset(new Date(asUtc + DAY_MS), timeZone);
  const wanted = zonedParts(new Date(asUtc), 'UTC');
  const readsAsWanted = (moment: Date) => {
    const seen = zonedParts(moment, timeZone);
    return seen.year === wanted.year && seen.month === wanted.month && seen.day === wanted.day
      && seen.hour === wanted.hour && seen.minute === wanted.minute && seen.second === wanted.second;
  };
  const candidates = [asUtc - offsetBefore, asUtc - offsetAfter]
    .map((ms) => new Date(ms))
    .filter(readsAsWanted)
    .sort((a, b) => a.getTime() - b.getTime());
  // No candidate reads as wanted only inside the gap: keep the earlier offset.
  return candidates[0] ?? new Date(asUtc - offsetBefore);
}

/**
 * A session repeated weekly at the same studio-local time. Each occurrence is
 * the first one's local date plus 7 × i days at the same local start and end
 * times, converted to an instant on its own date, so an 18:00 session stays at
 * 18:00 on both sides of a clock change. Duration is kept in wall-clock terms:
 * a session that ends the next local day ends the next local day every week.
 * The first occurrence is returned exactly as given.
 */
export function weeklyOccurrences(startsAt: Date, endsAt: Date, weeks: number, timeZone: string): { starts_at: Date; ends_at: Date }[] {
  const start = zonedParts(startsAt, timeZone);
  const end = zonedParts(endsAt, timeZone);
  const endDayOffset = Math.round((Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(start.year, start.month - 1, start.day)) / DAY_MS);
  return Array.from({ length: weeks }, (_, i) => i === 0
    ? { starts_at: new Date(startsAt), ends_at: new Date(endsAt) }
    : {
      starts_at: studioLocalToInstant({ ...start, day: start.day + 7 * i, millisecond: startsAt.getUTCMilliseconds() }, timeZone),
      ends_at: studioLocalToInstant({ ...end, year: start.year, month: start.month, day: start.day + 7 * i + endDayOffset, millisecond: endsAt.getUTCMilliseconds() }, timeZone),
    });
}
