import { describe, expect, it } from 'vitest';
import {
  BOOKING_STATUSES,
  STATUS_DOT_TAILWIND,
  STATUS_HEX,
  STATUS_LABEL,
  STATUS_MESSAGE,
  STATUS_TAILWIND,
  hexAlpha,
} from './bookingStatus';

// This module exists because ten independently-authored copies of the same
// mapping had drifted apart (AUD-002). The point of these tests is to stop it
// happening again: every map must stay complete, and the statuses that were
// previously conflated must stay distinct.
const MAPS = { STATUS_LABEL, STATUS_MESSAGE, STATUS_HEX, STATUS_TAILWIND, STATUS_DOT_TAILWIND };

describe('booking status maps', () => {
  it('covers all six statuses in every map, with no extras', () => {
    for (const [name, map] of Object.entries(MAPS)) {
      expect(Object.keys(map).sort(), `${name} keys`).toEqual([...BOOKING_STATUSES].sort());
    }
  });

  it('has a non-empty value for every status in every map', () => {
    for (const [name, map] of Object.entries(MAPS)) {
      for (const status of BOOKING_STATUSES) {
        expect(String((map as Record<string, string>)[status]).trim(), `${name}.${status}`).not.toBe('');
      }
    }
  });

  it('gives every status its own colour', () => {
    const hexes = BOOKING_STATUSES.map((status) => STATUS_HEX[status]);
    expect(new Set(hexes).size).toBe(BOOKING_STATUSES.length);
  });

  // Called out in the source: several of the old copies rendered NO_SHOW and
  // CANCELLED identically, which hides an operator-relevant difference — a
  // no-show is billable behaviour, a cancellation usually isn't.
  it('keeps NO_SHOW visually distinct from CANCELLED', () => {
    expect(STATUS_HEX.NO_SHOW).not.toBe(STATUS_HEX.CANCELLED);
    expect(STATUS_TAILWIND.NO_SHOW).not.toBe(STATUS_TAILWIND.CANCELLED);
    expect(STATUS_DOT_TAILWIND.NO_SHOW).not.toBe(STATUS_DOT_TAILWIND.CANCELLED);
    expect(STATUS_LABEL.NO_SHOW).not.toBe(STATUS_LABEL.CANCELLED);
  });

  it('uses real hex colours', () => {
    for (const status of BOOKING_STATUSES) {
      expect(STATUS_HEX[status], status).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe('hexAlpha', () => {
  it('appends a two-digit alpha channel', () => {
    expect(hexAlpha('#C9A84C', 1)).toBe('#C9A84Cff');
    expect(hexAlpha('#C9A84C', 0)).toBe('#C9A84C00');
  });

  it('pads single-digit alpha so the result stays 8 digits', () => {
    // 0.02 * 255 rounds to 5 -> "05", not "5", which would corrupt the colour.
    expect(hexAlpha('#000000', 0.02)).toBe('#00000005');
    expect(hexAlpha('#000000', 0.02)).toHaveLength(9);
  });

  it('clamps out-of-range alpha instead of producing invalid colour', () => {
    expect(hexAlpha('#C9A84C', 5)).toBe('#C9A84Cff');
    expect(hexAlpha('#C9A84C', -3)).toBe('#C9A84C00');
  });

  it('produces a parseable colour for every status', () => {
    for (const status of BOOKING_STATUSES) {
      expect(hexAlpha(STATUS_HEX[status], 0.5)).toMatch(/^#[0-9a-fA-F]{8}$/);
    }
  });
});
