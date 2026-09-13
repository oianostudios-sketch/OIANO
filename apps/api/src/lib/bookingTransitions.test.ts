import assert from 'node:assert/strict';
import test from 'node:test';
import type { BookingStatus } from '@prisma/client';
import {
  CLOSED_BOOKING_STATUSES, judgeBookingTransition, requireTransition, transitionBookingStatus,
} from './bookingTransitions';

const STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

// Stands in for the two queries the helper makes, with the conditional-write
// behaviour Postgres gives updateMany. `interfere` plays another request that
// writes between our read and our write; it returns the status that request set.
function bookingStore(
  initial: BookingStatus,
  options: { studioId?: string; interfere?: () => BookingStatus | undefined } = {},
) {
  const row = { status: initial, studio_id: options.studioId ?? 'studio-a' };
  const ourWrites: BookingStatus[] = [];
  const db = {
    booking: {
      findFirst: async ({ where }: { where: { id: string; studio_id?: string } }) =>
        (where.studio_id && where.studio_id !== row.studio_id ? null : { status: row.status }),
      updateMany: async ({ where, data }: { where: { id: string; status?: BookingStatus }; data: { status: BookingStatus } }) => {
        const concurrent = options.interfere?.();
        if (concurrent) row.status = concurrent;
        if (where.status !== undefined && where.status !== row.status) return { count: 0 };
        row.status = data.status;
        ourWrites.push(data.status);
        return { count: 1 };
      },
    },
  };
  return { db: db as any, row, ourWrites };
}

const once = (status: BookingStatus) => {
  let done = false;
  return () => {
    if (done) return undefined;
    done = true;
    return status;
  };
};

test('judgeBookingTransition', async (t) => {
  await t.test('a closed booking has nowhere to go', () => {
    for (const from of CLOSED_BOOKING_STATUSES) {
      for (const to of STATUSES.filter((status) => status !== from)) {
        assert.equal(judgeBookingTransition(from, to), 'ILLEGAL', `${from} must not become ${to}`);
      }
    }
  });

  // Every move a dashboard offers today: Pulse, the runsheet, the admin dashboard,
  // the calendar and the completion screen. Fixing A02 must not take one away.
  await t.test('every move a studio can make today is still allowed', () => {
    const offered: Array<[BookingStatus, BookingStatus]> = [
      ['PENDING', 'CONFIRMED'], ['PENDING', 'CANCELLED'], ['PENDING', 'COMPLETED'],
      ['CONFIRMED', 'IN_PROGRESS'], ['CONFIRMED', 'COMPLETED'], ['CONFIRMED', 'CANCELLED'], ['CONFIRMED', 'NO_SHOW'],
      ['IN_PROGRESS', 'COMPLETED'],
    ];
    for (const [from, to] of offered) assert.equal(judgeBookingTransition(from, to), 'APPLY', `${from} -> ${to}`);
  });

  await t.test('nothing moves backwards', () => {
    const backwards: Array<[BookingStatus, BookingStatus]> = [
      ['CONFIRMED', 'PENDING'], ['IN_PROGRESS', 'CONFIRMED'], ['IN_PROGRESS', 'PENDING'],
    ];
    for (const [from, to] of backwards) assert.equal(judgeBookingTransition(from, to), 'ILLEGAL', `${from} -> ${to}`);
  });

  await t.test('asking for the status a booking already has is unchanged, not illegal', () => {
    for (const status of STATUSES) assert.equal(judgeBookingTransition(status, status), 'UNCHANGED');
  });
});

test('transitionBookingStatus', async (t) => {
  await t.test('applies a legal move exactly once', async () => {
    const store = bookingStore('CONFIRMED');
    const result = await transitionBookingStatus(store.db, { bookingId: 'b', to: 'COMPLETED' });
    assert.equal(result.outcome, 'APPLIED');
    assert.deepEqual(store.ourWrites, ['COMPLETED']);
  });

  await t.test('refuses to reopen a completed booking and writes nothing', async () => {
    const store = bookingStore('COMPLETED');
    const result = await transitionBookingStatus(store.db, { bookingId: 'b', to: 'PENDING' });
    assert.equal(result.outcome, 'ILLEGAL');
    assert.deepEqual(store.ourWrites, []);
    assert.equal(store.row.status, 'COMPLETED');
  });

  // The race behind "completing twice": two requests read CONFIRMED, one completes
  // the booking, and the other must find it done rather than complete it again.
  await t.test('a request that loses a race to the same status gets UNCHANGED and writes nothing', async () => {
    const store = bookingStore('CONFIRMED', { interfere: once('COMPLETED') });
    const result = await transitionBookingStatus(store.db, { bookingId: 'b', to: 'COMPLETED' });
    assert.equal(result.outcome, 'UNCHANGED');
    assert.deepEqual(store.ourWrites, []);
  });

  await t.test('a request that loses a race is judged again against what is there now', async () => {
    const store = bookingStore('PENDING', { interfere: once('CANCELLED') });
    const result = await transitionBookingStatus(store.db, { bookingId: 'b', to: 'COMPLETED' });
    assert.equal(result.outcome, 'ILLEGAL', 'a booking cancelled meanwhile cannot then be completed');
    assert.equal(store.row.status, 'CANCELLED');
  });

  await t.test('gives up with CONFLICT instead of retrying for ever', async () => {
    let flip = false;
    const store = bookingStore('CONFIRMED', {
      interfere: () => {
        flip = !flip;
        return flip ? 'IN_PROGRESS' : 'CONFIRMED';
      },
    });
    const result = await transitionBookingStatus(store.db, { bookingId: 'b', to: 'COMPLETED' });
    assert.equal(result.outcome, 'CONFLICT');
    assert.deepEqual(store.ourWrites, []);
  });

  await t.test("a caller's narrower rule skips the move without writing or erroring", async () => {
    const store = bookingStore('PENDING');
    const result = await transitionBookingStatus(store.db, {
      bookingId: 'b', to: 'COMPLETED', onlyFrom: ['CONFIRMED', 'IN_PROGRESS'],
    });
    assert.equal(result.outcome, 'SKIPPED');
    assert.deepEqual(store.ourWrites, []);
  });

  await t.test("a booking outside the caller's studio is not found", async () => {
    const store = bookingStore('CONFIRMED', { studioId: 'studio-a' });
    const result = await transitionBookingStatus(store.db, { bookingId: 'b', to: 'COMPLETED', studioId: 'studio-b' });
    assert.equal(result.outcome, 'NOT_FOUND');
    assert.deepEqual(store.ourWrites, []);
  });
});

test('requireTransition', async (t) => {
  await t.test('passes through what a route may act on', () => {
    assert.equal(requireTransition({ outcome: 'APPLIED', from: 'CONFIRMED', to: 'COMPLETED' }).outcome, 'APPLIED');
    assert.equal(requireTransition({ outcome: 'UNCHANGED', from: 'COMPLETED', to: 'COMPLETED' }).outcome, 'UNCHANGED');
  });

  await t.test('turns a refused move into the right status code', () => {
    const codeOf = (fn: () => unknown) => {
      try {
        fn();
      } catch (err) {
        return (err as { statusCode?: number }).statusCode;
      }
      return undefined;
    };
    assert.equal(codeOf(() => requireTransition({ outcome: 'NOT_FOUND', to: 'CONFIRMED' })), 404);
    assert.equal(codeOf(() => requireTransition({ outcome: 'ILLEGAL', from: 'COMPLETED', to: 'PENDING' })), 409);
    assert.equal(codeOf(() => requireTransition({ outcome: 'CONFLICT', to: 'COMPLETED' })), 409);
  });
});
