import assert from 'node:assert/strict';
import test from 'node:test';
import { liveSession, minutesIntoStudioDay, studioDate, studioDateBounds, studioDayBounds } from './studioClock';

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

test('a named date is that calendar day in the studio zone, not in UTC (C29)', () => {
  const auckland = studioDateBounds('2026-10-06', 'Pacific/Auckland');
  assert.equal(auckland.start.toISOString(), '2026-10-05T11:00:00.000Z');
  assert.equal(auckland.end.toISOString(), '2026-10-06T11:00:00.000Z');

  const losAngeles = studioDateBounds('2026-11-01', 'America/Los_Angeles');
  assert.equal(losAngeles.start.toISOString(), '2026-11-01T07:00:00.000Z');
  assert.equal(losAngeles.end.toISOString(), '2026-11-02T08:00:00.000Z', 'the clocks go back: a 25-hour day');

  const monthEnd = studioDateBounds('2026-12-31', 'Pacific/Auckland');
  assert.equal(monthEnd.end.toISOString(), '2026-12-31T11:00:00.000Z', 'the next day rolls into the new year');
});

test("the studio's date can differ from the UTC date", () => {
  assert.equal(studioDate(at('2026-10-05T20:00:00Z'), 'Pacific/Auckland'), '2026-10-06');
  assert.equal(studioDate(at('2026-10-06T03:00:00Z'), 'America/Los_Angeles'), '2026-10-05');
  assert.equal(studioDate(at('2026-10-06T03:00:00Z'), 'UTC'), '2026-10-06');
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
