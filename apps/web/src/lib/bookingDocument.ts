type BookingDocumentLabelsOptions = {
  walletEnabled: boolean;
  paymentStatus?: string | null;
  paymentProvider?: string | null;
};

export function bookingDocumentLabels({
  walletEnabled,
  paymentStatus,
  paymentProvider,
}: BookingDocumentLabelsOptions) {
  if (walletEnabled) {
    return {
      title: 'STUDIO RECEIPT',
      reference: 'Receipt',
      party: 'Billed to',
      payment: paymentStatus ?? 'UNPAID',
    };
  }

  const isStudioCash = paymentProvider === 'cash';
  return {
    title: 'STUDIO BOOKING SUMMARY',
    reference: 'Booking',
    party: 'Session for',
    payment: isStudioCash && paymentStatus === 'UNPAID'
      ? 'DUE AT STUDIO'
      : isStudioCash && paymentStatus === 'PAID'
        ? 'PAID AT STUDIO'
        : paymentStatus ?? 'UNPAID',
  };
}
