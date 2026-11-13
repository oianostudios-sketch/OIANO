type ExistingCashPayment = {
  status: string;
  provider_ref: string | null;
  payment_intent_id: string | null;
} | null;

export type CashPaymentEligibility =
  | { eligible: true }
  | { eligible: false; reason: 'cancelled' | 'no-show' | 'already-paid' | 'other-payment-state' | 'no-amount' };

export function cashPaymentEligibility(
  bookingStatus: string,
  totalUsd: number,
  payment: ExistingCashPayment,
): CashPaymentEligibility {
  if (bookingStatus === 'CANCELLED') return { eligible: false, reason: 'cancelled' };
  if (bookingStatus === 'NO_SHOW') return { eligible: false, reason: 'no-show' };
  if (payment?.status === 'PAID') return { eligible: false, reason: 'already-paid' };
  if (payment && (
    payment.status !== 'UNPAID' ||
    payment.provider_ref !== null ||
    payment.payment_intent_id !== null
  )) {
    return { eligible: false, reason: 'other-payment-state' };
  }
  if (!Number.isFinite(totalUsd) || totalUsd <= 0) return { eligible: false, reason: 'no-amount' };
  return { eligible: true };
}
