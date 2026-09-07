import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionAction, totalWaiting, type NextAction, type SessionForAction } from './creatorContext';

const NOW = new Date('2026-09-07T12:00:00Z');
const at = (minutesFromNow: number) => new Date(NOW.getTime() + minutesFromNow * 60_000);

function booking(overrides: Partial<SessionForAction> = {}): SessionForAction {
  return {
    id: 'bk1',
    starts_at: at(60),
    ends_at: at(180),
    status: 'CONFIRMED',
    studio: { name: 'Dreamz Music Lab' },
    room: { name: 'Room A' },
    ...overrides,
  };
}

test('sessionAction', async (t) => {
  await t.test('has nothing to say without a session', () => {
    assert.equal(sessionAction(null, NOW), null);
  });

  // The regression: a start-time filter made a running session vanish at exactly
  // the moment it began, which is when it matters most.
  await t.test('reports a session that has already started', () => {
    const action = sessionAction(booking({ starts_at: at(-20), ends_at: at(100) }), NOW);
    assert.equal(action?.kind, 'SESSION_UNDERWAY');
    assert.equal(action?.href, '/bookings/bk1');
    // Points at when it ends, not when it started.
    assert.equal(action?.at, at(100).toISOString());
  });

  await t.test('stops reporting a session once it is over', () => {
    assert.equal(sessionAction(booking({ starts_at: at(-300), ends_at: at(-120) }), NOW), null);
  });

  await t.test('a session underway outranks its own confirmed status', () => {
    for (const status of ['PENDING', 'CONFIRMED', 'IN_PROGRESS']) {
      const action = sessionAction(booking({ status, starts_at: at(-5), ends_at: at(55) }), NOW);
      assert.equal(action?.kind, 'SESSION_UNDERWAY', `status ${status}`);
    }
  });

  // The copy defect: an unconfirmed booking was told to "confirm you're coming",
  // naming an action the artist cannot take and hiding that nobody has agreed.
  await t.test('says the studio has not confirmed, and asks nothing of the artist', () => {
    const action = sessionAction(booking({ status: 'PENDING' }), NOW);
    assert.equal(action?.kind, 'SESSION_AWAITING_STUDIO');
    assert.match(action!.title, /hasn't confirmed/);
    assert.match(action!.detail, /^Starts in \d+ hours\./);
    assert.doesNotMatch(`${action!.title} ${action!.detail}`, /confirm you're coming/i);
  });

  await t.test('a pending session is reported however far off it is', () => {
    // It is not urgent, but it is unresolved, and silence reads as agreement.
    const action = sessionAction(booking({ status: 'PENDING', starts_at: at(60 * 24 * 9), ends_at: at(60 * 24 * 9 + 120) }), NOW);
    assert.equal(action?.kind, 'SESSION_AWAITING_STUDIO');
  });

  await t.test('a confirmed session earns attention only inside its window', () => {
    assert.equal(sessionAction(booking({ starts_at: at(60 * 10), ends_at: at(60 * 12) }), NOW)?.kind, 'SESSION_IMMINENT');
    assert.equal(sessionAction(booking({ starts_at: at(60 * 40), ends_at: at(60 * 42) }), NOW), null);
  });

  await t.test('names where the session is', () => {
    const action = sessionAction(booking({ starts_at: at(-10), ends_at: at(50) }), NOW);
    assert.match(action!.detail, /Dreamz Music Lab/);
    assert.match(action!.detail, /Room A/);
  });

  await t.test('survives a session with no studio or room named', () => {
    const action = sessionAction(booking({ studio: null, room: null, starts_at: at(-10), ends_at: at(50) }), NOW);
    assert.equal(action?.kind, 'SESSION_UNDERWAY');
    assert.equal(action?.detail, 'Studio.');
  });
});

test('totalWaiting', async (t) => {
  const item = (kind: string, count?: number): NextAction =>
    ({ kind: kind as NextAction['kind'], title: '', detail: '', href: '/', ...(count === undefined ? {} : { count }) });

  await t.test('counts nothing when nothing waits', () => {
    assert.equal(totalWaiting([]), 0);
  });

  // The defect this exists for: attention holds one entry per kind, so its
  // length is a count of categories. Reporting that as things waiting on you
  // describes a number that does not exist.
  await t.test('counts items, not categories', () => {
    const attention = [item('BALANCE_DUE', 3), item('DELIVERABLE_AWAITING_REVIEW', 4), item('CREDIT_AWAITING_RESPONSE', 2)];
    assert.equal(attention.length, 3);
    assert.equal(totalWaiting(attention), 9);
  });

  await t.test('treats an entry with no count as one thing', () => {
    assert.equal(totalWaiting([item('SESSION_IMMINENT'), item('RIGHTS_DECISION_PENDING', 5)]), 6);
  });
});
