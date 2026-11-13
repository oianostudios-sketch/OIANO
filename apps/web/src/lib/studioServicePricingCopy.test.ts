import { describe, expect, it } from 'vitest';
import { studioServicePricingCopy } from './studioServicePricingCopy';

describe('studioServicePricingCopy', () => {
  it('explains direct studio settlement for hourly pilot services', () => {
    expect(studioServicePricingCopy({ unit: 'hour', walletEnabled: false })).toBe(
      'A booking uses the price for each hour booked. During the pilot, artists pay the studio directly; OIANO does not collect this payment. The upper figure is shown to artists for work that varies and is never charged.',
    );
  });

  it('explains direct studio settlement for per-session pilot services', () => {
    expect(studioServicePricingCopy({ unit: 'session', walletEnabled: false })).toContain(
      'A booking uses the price once.',
    );
    expect(studioServicePricingCopy({ unit: 'session', walletEnabled: false })).toContain(
      'artists pay the studio directly',
    );
  });

  it('keeps wallet collection language when wallet booking is enabled', () => {
    const copy = studioServicePricingCopy({ unit: 'hour', walletEnabled: true });
    expect(copy).toContain('Credits are deducted when the artist books.');
    expect(copy).not.toContain('OIANO does not collect');
  });
});
