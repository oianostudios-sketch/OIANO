import { describe, expect, it } from 'vitest';
import { bookingRequestLabel } from './bookingCopy';

describe('bookingRequestLabel', () => {
  it('does not imply studio credit is used while the wallet is frozen', () => {
    expect(bookingRequestLabel({
      pending: false,
      repeatEnabled: false,
      repeatWeeks: 4,
      total: 240,
      walletEnabled: false,
    })).toBe('Request this session →');
  });

  it('retains the studio-credit amount when wallet booking is enabled', () => {
    expect(bookingRequestLabel({
      pending: false,
      repeatEnabled: true,
      repeatWeeks: 4,
      total: 960,
      walletEnabled: true,
    })).toBe('Request 4 sessions · $960.00 studio credit →');
  });

  it('shows pending status without suggesting a payment action', () => {
    expect(bookingRequestLabel({
      pending: true,
      repeatEnabled: false,
      repeatWeeks: 4,
      total: 240,
      walletEnabled: false,
    })).toBe('Securing your session…');
  });
});
