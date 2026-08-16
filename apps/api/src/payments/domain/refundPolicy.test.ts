import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRefundActor, calculateRefundOutcome } from './refundPolicy';

test('partial and full refunds produce the correct payment state', () => {
  assert.deepEqual(calculateRefundOutcome({ paymentAmountMinor: 10_000n, succeededRefundsMinor: 0n, requestedAmountMinor: 2_500n }), {
    totalRefundedMinor: 2_500n, paymentStatus: 'PARTIALLY_REFUNDED',
  });
  assert.deepEqual(calculateRefundOutcome({ paymentAmountMinor: 10_000n, succeededRefundsMinor: 2_500n, requestedAmountMinor: 7_500n }), {
    totalRefundedMinor: 10_000n, paymentStatus: 'REFUNDED',
  });
});

test('refund amount cannot be zero, negative, or exceed the remaining payment', () => {
  for (const requestedAmountMinor of [0n, -1n, 7_501n]) {
    assert.throws(
      () => calculateRefundOutcome({ paymentAmountMinor: 10_000n, succeededRefundsMinor: 2_500n, requestedAmountMinor }),
      (error: any) => error?.message === 'REFUND_EXCEEDS_PAYMENT' && error?.statusCode === 400,
    );
  }
});

test('refund authorization is limited to Oiano admin or the owning studio', () => {
  assert.doesNotThrow(() => assertRefundActor({ actorRole: 'OIANO_ADMIN', paymentStudioId: 'studio-1' }));
  assert.doesNotThrow(() => assertRefundActor({ actorRole: 'STUDIO_ADMIN', paymentStudioId: 'studio-1', actorStudioId: 'studio-1' }));
  assert.throws(() => assertRefundActor({ actorRole: 'STUDIO_ADMIN', paymentStudioId: 'studio-1', actorStudioId: 'studio-2' }));
  for (const actorRole of ['ARTIST', 'ENGINEER', 'PRODUCER', 'UNKNOWN']) {
    assert.throws(() => assertRefundActor({ actorRole, paymentStudioId: 'studio-1' }), (error: any) => error?.statusCode === 403);
  }
});
