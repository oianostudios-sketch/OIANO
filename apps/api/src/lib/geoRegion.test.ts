import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveRegionFromTimezone } from '@oiano/shared';

test('derives continent and city from a standard two-segment IANA timezone', () => {
  assert.deepEqual(deriveRegionFromTimezone('Africa/Freetown'), { continent: 'Africa', city: 'Freetown', label: 'Freetown, Africa' });
});

test('replaces underscores in multi-word city names', () => {
  assert.deepEqual(deriveRegionFromTimezone('America/New_York'), { continent: 'America', city: 'New York', label: 'New York, America' });
});

test('uses the last segment as city for three-part timezone ids', () => {
  assert.deepEqual(deriveRegionFromTimezone('America/Argentina/Buenos_Aires'), { continent: 'America', city: 'Buenos Aires', label: 'Buenos Aires, America' });
});

test('does not crash on a bare timezone id with no slash, even though the label reads oddly', () => {
  const result = deriveRegionFromTimezone('UTC');
  assert.equal(result.continent, 'UTC');
  assert.equal(result.city, 'UTC');
});
