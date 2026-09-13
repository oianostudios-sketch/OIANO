import type { BookingStatus, PaymentStatus } from '@prisma/client';

// Whether a booking may be paid for, and what to do with a checkout already open
// for it (A03).
//
// Checkout used to refuse only a PAID payment. A cancelled booking could still be
// paid for; starting checkout on a refunded payment reset it to PROCESSING and
// erased the refund; and every request opened a new Stripe session while the last
// one could still be open, so two open sessions for one booking could both be paid.

export type CheckoutEligibility =
  | { ok: true }
  | { ok: false; status: 400 | 409; message: string };

export function checkoutEligibility(bookingStatus: BookingStatus, paymentStatus: PaymentStatus | null): CheckoutEligibility {
  if (bookingStatus === 'CANCELLED') {
    return { ok: false, status: 409, message: 'This booking is cancelled and cannot be paid for' };
  }
  if (bookingStatus === 'NO_SHOW') {
    return { ok: false, status: 409, message: 'This booking is marked no-show and cannot be paid for' };
  }
  // 400 rather than 409, because that is what this check has always returned.
  if (paymentStatus === 'PAID') return { ok: false, status: 400, message: 'Booking is already paid' };
  if (paymentStatus === 'REFUNDED' || paymentStatus === 'PARTIALLY_REFUNDED') {
    return { ok: false, status: 409, message: 'This booking has been refunded. Contact the studio to book again.' };
  }
  return { ok: true };
}

/** A previous Checkout Session for the same booking, as Stripe reports it. */
export interface PreviousCheckout {
  status: 'open' | 'complete' | 'expired' | null;
  amountTotal: number | null;
}

export type CheckoutPlan = 'REUSE' | 'REPLACE' | 'CREATE' | 'IN_FLIGHT';

/**
 * One payable session per booking.
 * - An open session for the right amount is handed back instead of opening another.
 * - An open session for a different amount is expired, then replaced.
 * - A completed session means the money is on its way through the webhook, so a
 *   second checkout must not start.
 * - An expired session, or none, means a new one.
 */
export function planCheckout(previous: PreviousCheckout | null, expectedAmount: number): CheckoutPlan {
  if (!previous) return 'CREATE';
  if (previous.status === 'complete') return 'IN_FLIGHT';
  if (previous.status === 'open') return previous.amountTotal === expectedAmount ? 'REUSE' : 'REPLACE';
  return 'CREATE';
}
