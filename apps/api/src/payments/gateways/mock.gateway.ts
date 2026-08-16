import crypto from 'crypto';
import { AppError } from '../../lib/errors';
import { PaymentGateway } from '../domain/types';

export class MockPaymentGateway implements PaymentGateway {
  readonly name = 'mock';
  async createPayment(input: Parameters<PaymentGateway['createPayment']>[0]) {
    const providerPaymentId = `mock_${crypto.createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 20)}`;
    return { provider:this.name, providerPaymentId, status:'REQUIRES_ACTION' as const, checkoutUrl:`${input.returnUrl}${input.returnUrl.includes('?')?'&':'?'}mock_payment=${providerPaymentId}` };
  }
  async getPaymentStatus() { return 'REQUIRES_ACTION' as const; }
  async refundPayment(input: Parameters<PaymentGateway['refundPayment']>[0]) {
    return {providerRefundId:`mock_re_${crypto.createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0,20)}`,status:'SUCCEEDED' as const};
  }
  async verifyWebhook(payload: any, headers: Record<string, string | string[] | undefined>) {
    const raw = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload ?? {}));
    const secret = process.env.PAYMENTS_WEBHOOK_SECRET ?? 'local-mock-webhook-secret';
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const signature = headers['x-oiano-mock-signature'];
    if (typeof signature !== 'string' || signature.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new AppError('WEBHOOK_INVALID', 400);
    }
    let event: any;
    try { event = Buffer.isBuffer(payload) ? JSON.parse(raw.toString('utf8')) : payload; }
    catch { throw new AppError('WEBHOOK_INVALID', 400); }
    if (!event?.id || !event?.providerPaymentId || !event?.status) throw new AppError('WEBHOOK_INVALID', 400);
    return { provider:this.name, providerEventId:String(event.id), providerPaymentId:String(event.providerPaymentId), status:event.status, payloadHash:crypto.createHash('sha256').update(raw).digest('hex') };
  }
}
