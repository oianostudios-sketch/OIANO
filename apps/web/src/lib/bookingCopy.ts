export function bookingRequestLabel({
  pending,
  repeatEnabled,
  repeatWeeks,
  total,
  walletEnabled,
}: {
  pending: boolean;
  repeatEnabled: boolean;
  repeatWeeks: number;
  total: number;
  walletEnabled: boolean;
}): string {
  if (pending) return 'Securing your session…';

  const sessionCount = repeatEnabled ? repeatWeeks : 1;
  const sessionLabel = sessionCount === 1 ? 'this session' : `${sessionCount} sessions`;
  const walletLabel = walletEnabled ? ` · $${total.toFixed(2)} studio credit` : '';
  return `Request ${sessionLabel}${walletLabel} →`;
}
