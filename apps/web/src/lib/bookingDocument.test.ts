import { describe, expect, it } from 'vitest';
import { bookingDocumentLabels } from './bookingDocument';

describe('bookingDocumentLabels', () => {
  it('identifies an unpaid cash booking as an amount due at the studio, not a receipt', () => {
    expect(bookingDocumentLabels({
      walletEnabled: false,
      paymentStatus: 'UNPAID',
      paymentProvider: 'cash',
    })).toEqual({
      title: 'STUDIO BOOKING SUMMARY',
      reference: 'Booking',
      party: 'Session for',
      payment: 'DUE AT STUDIO',
    });
  });

  it('identifies a staff-recorded cash payment as paid at the studio', () => {
    expect(bookingDocumentLabels({
      walletEnabled: false,
      paymentStatus: 'PAID',
      paymentProvider: 'cash',
    }).payment).toBe('PAID AT STUDIO');
  });

  it('preserves the receipt labels for the wallet-enabled flow', () => {
    expect(bookingDocumentLabels({
      walletEnabled: true,
      paymentStatus: 'UNPAID',
      paymentProvider: 'stripe',
    })).toEqual({
      title: 'STUDIO RECEIPT',
      reference: 'Receipt',
      party: 'Billed to',
      payment: 'UNPAID',
    });
  });
});
