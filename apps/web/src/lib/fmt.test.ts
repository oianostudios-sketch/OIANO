import { describe, expect, it } from 'vitest';
import { fmtCurrency, fmtDateShort, fmtDuration, fmtTime } from './fmt';

// A studio in New York and an artist in Berlin must read the same session as
// the same wall-clock time in the studio's zone, so the timezone argument is
// the part worth pinning down. Assertions use explicit zones rather than the
// machine's local one, so these don't pass or fail based on where they run.
const SESSION_START = '2026-03-15T18:00:00.000Z';
const SESSION_END = '2026-03-15T21:30:00.000Z';

// Intl separates the time from AM/PM with a narrow no-break space (U+202F) on
// some ICU versions and an ordinary space on others, so the exact glyph tracks
// the Node build rather than anything this app does — it differs between a
// local Node 24 and CI's Node 20. Normalise every space-like character: the
// behaviour under test is the timezone shift, not ICU's spacing convention.
const spaces = (value: string) => value.replace(/[\s  ]+/g, ' ');

describe('time formatting', () => {
  it('renders the time in the studio timezone, not the viewer local zone', () => {
    expect(spaces(fmtTime(SESSION_START, 'UTC'))).toBe('06:00 PM');
    expect(spaces(fmtTime(SESSION_START, 'America/New_York'))).toBe('02:00 PM');
    expect(spaces(fmtTime(SESSION_START, 'Asia/Tokyo'))).toBe('03:00 AM');
  });

  it('renders the date in the studio timezone', () => {
    // Late UTC on the 15th is already the 16th in Tokyo — a session can belong
    // to a different calendar day depending on the zone.
    expect(fmtDateShort('2026-03-15T23:00:00.000Z', 'UTC')).toBe('Mar 15');
    expect(fmtDateShort('2026-03-15T23:00:00.000Z', 'Asia/Tokyo')).toBe('Mar 16');
  });
});

describe('duration', () => {
  it('shows minutes under an hour', () => {
    expect(fmtDuration(SESSION_START, '2026-03-15T18:45:00.000Z')).toBe('45m');
  });

  it('drops the minutes on a whole number of hours', () => {
    expect(fmtDuration(SESSION_START, '2026-03-15T20:00:00.000Z')).toBe('2h');
  });

  it('shows hours and minutes together', () => {
    expect(fmtDuration(SESSION_START, SESSION_END)).toBe('3h 30m');
  });

  it('is independent of timezone — a duration is an elapsed span', () => {
    expect(fmtDuration('2026-03-15T18:00:00+02:00', '2026-03-15T20:00:00+02:00')).toBe('2h');
  });
});

describe('currency', () => {
  it('formats whole amounts without stray decimals', () => {
    expect(fmtCurrency(150)).toBe('$150');
  });

  it('keeps real cents', () => {
    expect(fmtCurrency(150.5)).toBe('$150.5');
    expect(fmtCurrency(150.75)).toBe('$150.75');
  });

  // Prisma Decimal columns arrive over JSON as strings; formatting must not
  // depend on the caller having already coerced them.
  it('accepts a numeric string as well as a number', () => {
    expect(fmtCurrency('150')).toBe(fmtCurrency(150));
  });

  it('renders zero as an amount rather than blank', () => {
    expect(fmtCurrency(0)).toBe('$0');
  });
});
