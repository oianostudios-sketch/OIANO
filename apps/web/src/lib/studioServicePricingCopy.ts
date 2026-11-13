export function studioServicePricingCopy({
  unit,
  walletEnabled,
}: {
  unit: string;
  walletEnabled: boolean;
}): string {
  const price = `the price${unit === 'hour' ? ' for each hour booked' : ' once'}`;
  const collection = walletEnabled
    ? 'Credits are deducted when the artist books.'
    : 'During the pilot, artists pay the studio directly; OIANO does not collect this payment.';
  return `A booking uses ${price}. ${collection} The upper figure is shown to artists for work that varies and is never charged.`;
}
