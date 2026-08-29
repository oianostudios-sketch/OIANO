import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingAllocation } from './financialLedger';

test('booking allocation preserves gross value to the cent', () => {
  assert.deepEqual(bookingAllocation(123.45, 1000), { gross: 123.45, platformFee: 12.35, studioNet: 111.1 });
});

test('booking allocation supports a zero-fee studio without inventing revenue', () => {
  assert.deepEqual(bookingAllocation(50, 0), { gross: 50, platformFee: 0, studioNet: 50 });
});
