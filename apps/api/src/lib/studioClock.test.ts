import assert from 'node:assert/strict';
import test from 'node:test';
import { liveSession, minutesIntoStudioDay, studioDate, studioDateBounds, studioDayBounds, studioLocalToInstant, weeklyOccurrences } from './studioClock';

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

// Weekly series across clock changes. Every expected instant is worked by hand:
// London moves to BST (UTC+1) at 01:00Z on 29 March 2026 and back to GMT at 01:00Z
// on 25 October 2026; New York moves to EDT (UTC-4) on 8 March 2026 and back to
// EST (UTC-5) on 1 November 2026, at 02:00 local each time.
const series = (start: string, end: string, weeks: number, zone: string) =>
  weeklyOccurrences(at(start), at(end), weeks, zone).map((occ) => `${occ.starts_at.toISOString()} ${occ.ends_at.toISOString()}`);

test('a weekly 18:00 session in London stays at 18:00 across both clock changes', () => {
  assert.deepEqual(series('2026-03-19T18:00:00Z', '2026-03-19T20:00:00Z', 4, 'Europe/London'), [
    '2026-03-19T18:00:00.000Z 2026-03-19T20:00:00.000Z', // 18:00 GMT
    '2026-03-26T18:00:00.000Z 2026-03-26T20:00:00.000Z',
    '2026-04-02T17:00:00.000Z 2026-04-02T19:00:00.000Z', // 18:00 BST
    '2026-04-09T17:00:00.000Z 2026-04-09T19:00:00.000Z',
  ]);
  assert.deepEqual(series('2026-10-15T17:00:00Z', '2026-10-15T19:00:00Z', 4, 'Europe/London'), [
    '2026-10-15T17:00:00.000Z 2026-10-15T19:00:00.000Z', // 18:00 BST
    '2026-10-22T17:00:00.000Z 2026-10-22T19:00:00.000Z',
    '2026-10-29T18:00:00.000Z 2026-10-29T20:00:00.000Z', // 18:00 GMT
    '2026-11-05T18:00:00.000Z 2026-11-05T20:00:00.000Z',
  ]);
});

test('a weekly 18:00 session in New York stays at 18:00 across both clock changes', () => {
  assert.deepEqual(series('2026-03-05T23:00:00Z', '2026-03-06T01:00:00Z', 2, 'America/New_York'), [
    '2026-03-05T23:00:00.000Z 2026-03-06T01:00:00.000Z', // 18:00 EST
    '2026-03-12T22:00:00.000Z 2026-03-13T00:00:00.000Z', // 18:00 EDT
  ]);
  assert.deepEqual(series('2026-10-29T22:00:00Z', '2026-10-30T00:00:00Z', 2, 'America/New_York'), [
    '2026-10-29T22:00:00.000Z 2026-10-30T00:00:00.000Z', // 18:00 EDT
    '2026-11-05T23:00:00.000Z 2026-11-06T01:00:00.000Z', // 18:00 EST
  ]);
});

test('an overnight session keeps its wall-clock times even on the night the clocks go back', () => {
  // 22:00 Saturday to 02:00 Sunday in New York: four hours on the clock, five real
  // hours on the night of 31 October.
  assert.deepEqual(series('2026-10-25T02:00:00Z', '2026-10-25T06:00:00Z', 2, 'America/New_York'), [
    '2026-10-25T02:00:00.000Z 2026-10-25T06:00:00.000Z',
    '2026-11-01T02:00:00.000Z 2026-11-01T07:00:00.000Z',
  ]);
});

test('a time in the spring-forward gap moves forward; a repeated time takes the earlier instant', () => {
  const local = (date: string, time: string) => {
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    return { year, month, day, hour, minute };
  };
  assert.equal(studioLocalToInstant(local('2026-03-29', '01:30'), 'Europe/London').toISOString(), '2026-03-29T01:30:00.000Z', '01:30 does not exist; 02:30 BST');
  assert.equal(studioLocalToInstant(local('2026-03-08', '02:30'), 'America/New_York').toISOString(), '2026-03-08T07:30:00.000Z', '02:30 does not exist; 03:30 EDT');
  assert.equal(studioLocalToInstant(local('2026-10-25', '01:30'), 'Europe/London').toISOString(), '2026-10-25T00:30:00.000Z', '01:30 BST, not 01:30 GMT');
  assert.equal(studioLocalToInstant(local('2026-11-01', '01:30'), 'America/New_York').toISOString(), '2026-11-01T05:30:00.000Z', '01:30 EDT, not 01:30 EST');
  assert.equal(studioLocalToInstant(local('2026-07-01', '18:00'), 'Europe/London').toISOString(), '2026-07-01T17:00:00.000Z');

  // A Sunday 01:30 series in London lands in the gap once, then returns to 01:30 BST.
  assert.deepEqual(series('2026-03-22T01:30:00Z', '2026-03-22T03:30:00Z', 3, 'Europe/London'), [
    '2026-03-22T01:30:00.000Z 2026-03-22T03:30:00.000Z',
    '2026-03-29T01:30:00.000Z 2026-03-29T02:30:00.000Z', // 02:30 to 03:30 BST
    '2026-04-05T00:30:00.000Z 2026-04-05T02:30:00.000Z',
  ]);
});
