import { AppError } from '../../lib/errors';

export function assertRefundActor(input: {
  actorRole: string;
  paymentStudioId: string | null;
  actorStudioId?: string | null;
}) {
  if (input.actorRole === 'OIANO_ADMIN') return;
  if (input.actorRole === 'STUDIO_ADMIN' && input.actorStudioId && input.actorStudioId === input.paymentStudioId) return;
  throw new AppError(input.actorRole === 'STUDIO_ADMIN' ? 'PAYMENT_NOT_FOUND' : 'Forbidden', input.actorRole === 'STUDIO_ADMIN' ? 404 : 403);
}

export function calculateRefundOutcome(input: {
  paymentAmountMinor: bigint;
  succeededRefundsMinor: bigint;
  requestedAmountMinor: bigint;
}) {
  const total = input.succeededRefundsMinor + input.requestedAmountMinor;
  if (input.requestedAmountMinor <= 0n || total > input.paymentAmountMinor) {
    throw new AppError('REFUND_EXCEEDS_PAYMENT', 400);
  }
  return { totalRefundedMinor: total, paymentStatus: total === input.paymentAmountMinor ? 'REFUNDED' as const : 'PARTIALLY_REFUNDED' as const };
}
