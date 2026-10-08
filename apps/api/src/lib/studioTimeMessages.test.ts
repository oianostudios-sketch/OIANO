// What the API sends people states a session on the studio's clock, with the zone
// named. The emails and the "tomorrow" in a creator's next action used to read the
// server's own zone, so an Auckland session on the morning of 15 October read as
// 14 October from a server anywhere west of it. The server here is put in Los
// Angeles so the old behaviour shows whatever zone the host itself is in.
process.env.TZ = 'America/Los_Angeles';

import assert from 'node:assert/strict';
import test from 'node:test';
import { studioWhenLabel } from './studioClock';
import { sessionAction } from './creatorContext';
import {
  bookingCancelledEmail, bookingConfirmedEmail, receiptEmail, sessionCompleteEmail,
} from '../services/email.service';

const ZONE = 'Pacific/Auckland';
// 20:00Z on 14 October 2030 is 09:00 on Tuesday 15 October in Auckland (NZDT, UTC+13).
const STARTS = '2030-10-14T20:00:00.000Z';
const ENDS = '2030-10-14T22:00:00.000Z';
const args = {
  to: 'artist@example.test', artistName: 'Ari', service: 'Recording', room: 'Room A',
  startsAt: STARTS, endsAt: ENDS, bookingId: 'b0000000-0000-0000-0000-000000000000', timeZone: ZONE, totalUsd: 120,
};

test('studioWhenLabel names the studio day, wall clock and zone', () => {
  assert.equal(studioWhenLabel(new Date(STARTS), ZONE), 'Tue, Oct 15, 09:00 (Pacific/Auckland)');
  assert.equal(studioWhenLabel(new Date(STARTS), ZONE, new Date(ENDS)), 'Tue, Oct 15, 09:00–11:00 (Pacific/Auckland)');
});

test('booking emails state the session on the studio clock', async (t) => {
  await t.test('confirmation', () => {
    const { subject, html } = bookingConfirmedEmail(args);
    assert.equal(subject, 'Session confirmed — Tue, Oct 15');
    assert.ok(html.includes('<p style="font-size:13px;color:#333;margin:0;">Tue, Oct 15, 09:00–11:00 (Pacific/Auckland)</p>'), html);
  });

  await t.test('completion', () => {
    const { subject, html } = sessionCompleteEmail(args);
    assert.equal(subject, 'Session complete — Recording');
    assert.ok(html.includes('>Recording · Tue, Oct 15, 09:00 (Pacific/Auckland)</p>'), html);
  });

  await t.test('cancellation', () => {
    const { subject, html } = bookingCancelledEmail(args);
    assert.equal(subject, 'Booking cancelled — Recording on Tue, Oct 15');
    assert.ok(html.includes('>Recording · Tue, Oct 15, 09:00 (Pacific/Auckland) has been cancelled.</p>'), html);
  });

  await t.test('receipt', () => {
    const { html } = receiptEmail({
      id: args.bookingId, starts_at: new Date(STARTS), ends_at: new Date(ENDS), total_usd: 120,
      studio: { name: 'Zone Studio', timezone: ZONE }, artist: { name: 'Ari' }, service: { name: 'Recording' },
    }, new Date('2030-10-14T20:30:00Z'));
    assert.ok(html.includes('>Tuesday, October 15, 2030</p>'), 'the session day is the studio day');
    assert.ok(html.includes('>09:00 → 11:00 Pacific/Auckland (2.0h)</p>'), 'the session times are the studio clock, zone named');
    // When the receipt was issued is an event, not an appointment: a UTC date, labelled.
    assert.ok(html.includes('>2030-10-14 UTC</p>'), 'the issue date is UTC and says so');
  });
});

test('"tomorrow" is the studio\'s tomorrow', () => {
  // 23:00 on 15 October in Auckland; the session is at 11:00 on the 16th there,
  // which is the same afternoon in Los Angeles and the same day in UTC.
  const now = new Date('2030-10-15T10:00:00Z');
  const action = sessionAction({
    id: 'bk1', status: 'CONFIRMED', starts_at: new Date('2030-10-15T22:00:00Z'), ends_at: new Date('2030-10-16T00:00:00Z'),
    studio: { name: 'Zone Studio', timezone: ZONE }, room: null,
  }, now);
  assert.equal(action?.title, 'Your session is tomorrow');
});
