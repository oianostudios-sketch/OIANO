import assert from 'node:assert/strict';
import test from 'node:test';
import { cashPaymentEligibility } from './cashPaymentEligibility';

const unpaid = { status: 'UNPAID', provider_ref: null, payment_intent_id: null };

test('cashPaymentEligibility', async (t) => {
  await t.test('allows a positive unpaid booking without an in-flight checkout', () => {
    assert.deepEqual(cashPaymentEligibility('PENDING', 50, unpaid), { eligible: true });
    assert.deepEqual(cashPaymentEligibility('CONFIRMED', 50, null), { eligible: true });
  });

  await t.test('refuses bookings that cannot be recorded as studio cash', () => {
    assert.deepEqual(cashPaymentEligibility('CANCELLED', 50, unpaid), { eligible: false, reason: 'cancelled' });
    assert.deepEqual(cashPaymentEligibility('NO_SHOW', 50, unpaid), { eligible: false, reason: 'no-show' });
    assert.deepEqual(cashPaymentEligibility('CONFIRMED', 50, { ...unpaid, status: 'PAID' }), { eligible: false, reason: 'already-paid' });
    assert.deepEqual(cashPaymentEligibility('CONFIRMED', 50, { ...unpaid, status: 'PROCESSING' }), { eligible: false, reason: 'other-payment-state' });
    assert.deepEqual(cashPaymentEligibility('CONFIRMED', 50, { ...unpaid, provider_ref: 'checkout-session' }), { eligible: false, reason: 'other-payment-state' });
    assert.deepEqual(cashPaymentEligibility('CONFIRMED', 50, { ...unpaid, payment_intent_id: 'payment-intent' }), { eligible: false, reason: 'other-payment-state' });
    assert.deepEqual(cashPaymentEligibility('CONFIRMED', 0, null), { eligible: false, reason: 'no-amount' });
  });
});
