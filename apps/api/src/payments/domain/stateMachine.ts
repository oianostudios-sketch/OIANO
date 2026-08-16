import { OianoPaymentStatus } from '@prisma/client';
import { AppError } from '../../lib/errors';

const transitions: Record<OianoPaymentStatus, OianoPaymentStatus[]> = {
  CREATED:['REQUIRES_ACTION','PROCESSING','CANCELLED','FAILED'], REQUIRES_ACTION:['PROCESSING','AUTHORIZED','SUCCEEDED','FAILED','CANCELLED'],
  PROCESSING:['REQUIRES_ACTION','AUTHORIZED','SUCCEEDED','FAILED','CANCELLED'], AUTHORIZED:['SUCCEEDED','CANCELLED','FAILED'],
  SUCCEEDED:['PARTIALLY_REFUNDED','REFUNDED','DISPUTED'], FAILED:[], CANCELLED:[], PARTIALLY_REFUNDED:['PARTIALLY_REFUNDED','REFUNDED','DISPUTED'], REFUNDED:['DISPUTED'], DISPUTED:[],
};
export function assertPaymentTransition(from: OianoPaymentStatus, to: OianoPaymentStatus) {
  if (from === to) return;
  if (!transitions[from].includes(to)) throw new AppError('INVALID_PAYMENT_STATE', 409);
}
