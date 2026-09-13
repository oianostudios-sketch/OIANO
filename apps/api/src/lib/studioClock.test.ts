import assert from 'node:assert/strict';
import test from 'node:test';
import { liveSession, minutesIntoStudioDay, studioDayBounds } from './studioClock';

const at = (iso: string) => new Date(iso);

test("a studio's day runs from its own midnight to the next (A09)", () => {
  const nicosia = studioDayBounds(at('2026-09-14T21:30:00Z'), 'Asia/Nicosia');
  assert.equal(nicosia.start.toISOString(), '2026-09-14T21:00:00.000Z', 'already the 15th in Nicosia');
  assert.equal(nicosia.end.toISOString(), '2026-09-15T21:00:00.000Z');

  const newYork = studioDayBounds(at('2026-09-14T02:00:00Z'), 'America/New_York');
  assert.equal(newYork.start.toISOString(), '2026-09-13T04:00:00.000Z', 'still the 13th in New York');
  assert.equal(newYork.end.toISOString(), '2026-09-14T04:00:00.000Z');
});

test('the day the clocks go back lasts 25 hours', () => {
  const day = studioDayBounds(at('2026-10-25T12:00:00Z'), 'Asia/Nicosia');
  assert.equal(day.start.toISOString(), '2026-10-24T21:00:00.000Z');
  assert.equal(day.end.toISOString(), '2026-10-25T22:00:00.000Z');
});

test('the day the clocks go forward starts at midnight standard time, even far east of UTC', () => {
  // Auckland moves to daylight time at 02:00 on 27 September 2026, after its
  // midnight but before midnight UTC, so one offset measurement starts the day
  // an hour early.
  const day = studioDayBounds(at('2026-09-27T06:00:00Z'), 'Pacific/Auckland');
  assert.equal(day.start.toISOString(), '2026-09-26T12:00:00.000Z');
  assert.equal(day.end.toISOString(), '2026-09-27T11:00:00.000Z', 'a 23-hour day');
});

test('clock positions are in studio time', () => {
  assert.equal(minutesIntoStudioDay(at('2026-09-14T21:30:00Z'), 'Asia/Nicosia'), 30);
  assert.equal(minutesIntoStudioDay(at('2026-09-14T21:30:00Z'), 'UTC'), 21 * 60 + 30);
});

test('only a confirmed or in-progress session is live, and one in progress past its end is overtime', () => {
  const now = at('2026-09-14T12:00:00Z');
  const session = (status: string, start: string, end: string) => ({ status, starts_at: at(start), ends_at: at(end) });

  assert.equal(liveSession([session('PENDING', '2026-09-14T11:00:00Z', '2026-09-14T13:00:00Z')], now), undefined, 'an unconfirmed session is not running');
  assert.equal(liveSession([session('COMPLETED', '2026-09-14T11:00:00Z', '2026-09-14T13:00:00Z')], now), undefined, 'a completed session is not running');
  assert.equal(liveSession([session('CONFIRMED', '2026-09-14T09:00:00Z', '2026-09-14T11:00:00Z')], now), undefined, 'a confirmed session whose time has passed is not running');
  assert.ok(liveSession([session('CONFIRMED', '2026-09-14T11:00:00Z', '2026-09-14T13:00:00Z')], now));

  const overtime = liveSession([session('IN_PROGRESS', '2026-09-14T09:00:00Z', '2026-09-14T11:00:00Z')], now);
  assert.ok(overtime, 'a session still in progress after its end is running');
  assert.ok(overtime.ends_at < now, 'and it is overtime');
});
