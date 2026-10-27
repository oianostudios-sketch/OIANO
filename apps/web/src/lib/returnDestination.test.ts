import { describe, expect, it } from 'vitest';
import { safeReturnDestination } from './returnDestination';

describe('safe internal return destinations', () => {
  it.each([
    '/accept-contribution?token=synthetic%2Btoken%2Fvalue&view=terms#role',
    '/accept-studio-invite?token=synthetic-token',
    '/book?studio_id=chosen-studio',
    '/contributions',
  ])('preserves the complete internal URL %s', (path) => {
    expect(safeReturnDestination(path)).toBe(path);
  });

  it.each([
    null, '', 'https://example.test', '//example.test', '/\\example.test',
    '\\\\example.test', 'javascript:alert(1)', 'contributions', ' /contributions',
    '/\n/example.test', '/\t/example.test', '/path\r', '/path\u0000',
    '/.//example.test', '/%2e//example.test',
  ])('rejects unsafe or absent destinations %j', (path) => {
    expect(safeReturnDestination(path)).toBeNull();
  });
});
