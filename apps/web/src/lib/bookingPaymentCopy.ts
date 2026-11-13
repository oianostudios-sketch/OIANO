type BookingPaymentCopyOptions = {
  walletEnabled: boolean;
  provider?: string | null;
  status?: string | null;
};

export function bookingPaymentCopy({ walletEnabled, provider, status }: BookingPaymentCopyOptions) {
  if (!walletEnabled && provider === 'cash') {
    const settlementStatus = status === 'PAID'
      ? 'Paid at studio'
      : status === 'PARTIAL'
        ? 'Partially paid at studio'
        : status === 'UNPAID' || !status
          ? 'Due at studio'
          : status;

    return {
      section: 'Studio settlement',
      amount: 'Session total',
      status: 'Settlement status',
      value: settlementStatus,
    };
  }

  return {
    section: 'Payment',
    amount: 'Total',
    status: 'Payment status',
    value: status ?? 'UNPAID',
  };
}
