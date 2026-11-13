import { describe, expect, it } from 'vitest';
import { bookingPaymentCopy } from './bookingPaymentCopy';

describe('bookingPaymentCopy', () => {
  it('describes an unpaid cash booking as due at the studio', () => {
    expect(bookingPaymentCopy({
      walletEnabled: false,
      provider: 'cash',
      status: 'UNPAID',
    })).toEqual({
      section: 'Studio settlement',
      amount: 'Session total',
      status: 'Settlement status',
      value: 'Due at studio',
    });
  });

  it('describes partial and completed cash settlements without implying OIANO collected them', () => {
    expect(bookingPaymentCopy({ walletEnabled: false, provider: 'cash', status: 'PARTIAL' }).value)
      .toBe('Partially paid at studio');
    expect(bookingPaymentCopy({ walletEnabled: false, provider: 'cash', status: 'PAID' }).value)
      .toBe('Paid at studio');
  });

  it('retains payment terminology for other provider and wallet-enabled flows', () => {
    expect(bookingPaymentCopy({ walletEnabled: true, provider: 'cash', status: 'UNPAID' })).toEqual({
      section: 'Payment',
      amount: 'Total',
      status: 'Payment status',
      value: 'UNPAID',
    });
    expect(bookingPaymentCopy({ walletEnabled: false, provider: 'stripe', status: 'PAID' }).value)
      .toBe('PAID');
  });
});
