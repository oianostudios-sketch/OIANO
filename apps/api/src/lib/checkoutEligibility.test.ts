import assert from 'node:assert/strict';
import test from 'node:test';
import type { BookingStatus, PaymentStatus } from '@prisma/client';
import { checkoutEligibility, planCheckout } from './checkoutEligibility';

const UNSETTLED: Array<PaymentStatus | null> = [null, 'UNPAID', 'PROCESSING', 'FAILED'];

test('checkoutEligibility', async (t) => {
  await t.test('a cancelled or no-show booking cannot be paid for', () => {
    for (const status of ['CANCELLED', 'NO_SHOW'] as BookingStatus[]) {
      for (const payment of UNSETTLED) {
        const verdict = checkoutEligibility(status, payment);
        assert.equal(!verdict.ok && verdict.status, 409, `${status} with payment ${payment} must be refused`);
      }
    }
  });

  await t.test('a paid booking is refused, with the status code it has always had', () => {
    assert.deepEqual(checkoutEligibility('CONFIRMED', 'PAID'), { ok: false, status: 400, message: 'Booking is already paid' });
  });

  // Starting checkout used to reset a refunded payment to PROCESSING, erasing the refund.
  await t.test('a refunded payment cannot be restarted', () => {
    for (const payment of ['REFUNDED', 'PARTIALLY_REFUNDED'] as PaymentStatus[]) {
      const verdict = checkoutEligibility('CONFIRMED', payment);
      assert.equal(!verdict.ok && verdict.status, 409, payment);
    }
  });

  await t.test('a live, unpaid booking can be paid for, including after its session', () => {
    for (const status of ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] as BookingStatus[]) {
      for (const payment of UNSETTLED) {
        assert.deepEqual(checkoutEligibility(status, payment), { ok: true }, `${status} with payment ${payment}`);
      }
    }
  });
});

test('planCheckout', async (t) => {
  await t.test('opens a session when there is none', () => {
    assert.equal(planCheckout(null, 5000), 'CREATE');
  });

  await t.test('hands back an open session instead of opening a second payable one', () => {
    assert.equal(planCheckout({ status: 'open', amountTotal: 5000 }, 5000), 'REUSE');
  });

  await t.test('replaces an open session whose amount no longer matches', () => {
    assert.equal(planCheckout({ status: 'open', amountTotal: 4000 }, 5000), 'REPLACE');
  });

  await t.test('never starts a second checkout while a completed one settles', () => {
    assert.equal(planCheckout({ status: 'complete', amountTotal: 5000 }, 5000), 'IN_FLIGHT');
  });

  await t.test('starts again once a session has expired', () => {
    assert.equal(planCheckout({ status: 'expired', amountTotal: 5000 }, 5000), 'CREATE');
    assert.equal(planCheckout({ status: null, amountTotal: null }, 5000), 'CREATE');
  });
});
