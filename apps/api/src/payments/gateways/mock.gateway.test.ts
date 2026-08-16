import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { MockPaymentGateway } from './mock.gateway';

const secret = 'webhook-test-secret';
const payload = Buffer.from('{"id":"evt_1","providerPaymentId":"mock_1","status":"SUCCEEDED"}');

async function withSecret(run: () => Promise<void>) {
  const previous = process.env.PAYMENTS_WEBHOOK_SECRET;
  process.env.PAYMENTS_WEBHOOK_SECRET = secret;
  try { await run(); }
  finally {
    if (previous === undefined) delete process.env.PAYMENTS_WEBHOOK_SECRET;
    else process.env.PAYMENTS_WEBHOOK_SECRET = previous;
  }
}

test('mock webhook verifies the exact raw request bytes', async () => withSecret(async () => {
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const event = await new MockPaymentGateway().verifyWebhook(payload, { 'x-oiano-mock-signature': signature });
  assert.equal(event.providerEventId, 'evt_1');
  assert.equal(event.status, 'SUCCEEDED');
  assert.equal(event.payloadHash, crypto.createHash('sha256').update(payload).digest('hex'));
}));

test('mock webhook rejects an invalid signature', async () => withSecret(async () => {
  await assert.rejects(
    new MockPaymentGateway().verifyWebhook(payload, { 'x-oiano-mock-signature': '0'.repeat(64) }),
    (error: any) => error?.message === 'WEBHOOK_INVALID' && error?.statusCode === 400,
  );
}));

test('mock webhook rejects malformed signed JSON', async () => withSecret(async () => {
  const malformed = Buffer.from('{broken');
  const signature = crypto.createHmac('sha256', secret).update(malformed).digest('hex');
  await assert.rejects(
    new MockPaymentGateway().verifyWebhook(malformed, { 'x-oiano-mock-signature': signature }),
    (error: any) => error?.message === 'WEBHOOK_INVALID',
  );
}));

test('mock refund IDs are stable for retries and isolated by idempotency key', async () => {
  const gateway = new MockPaymentGateway();
  const base = { providerPaymentId: 'mock_payment_1', amountMinor: 500n, currency: 'EUR', reason: 'Test refund' };
  const first = await gateway.refundPayment({ ...base, idempotencyKey: 'refund-key-1' });
  const retry = await gateway.refundPayment({ ...base, idempotencyKey: 'refund-key-1' });
  const different = await gateway.refundPayment({ ...base, idempotencyKey: 'refund-key-2' });
  assert.equal(first.providerRefundId, retry.providerRefundId);
  assert.notEqual(first.providerRefundId, different.providerRefundId);
});
