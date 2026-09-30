import assert from 'node:assert/strict';
import test from 'node:test';
import { byOverlapThenCompletedWork } from './discoveryRanking';

test('discovery breaks a tie in shared taste by completed work, never by profile completeness (C18)', () => {
  const polished = { id: 'polished', overlap_score: 3, profile_strength: 100 };
  const working = { id: 'working', overlap_score: 3, profile_strength: 10 };
  const closer = { id: 'closer', overlap_score: 5, profile_strength: 0 };
  const ranked = byOverlapThenCompletedWork([polished, working, closer], new Map([['working', 12], ['polished', 1]]));
  assert.deepEqual(ranked.map((a) => a.id), ['closer', 'working', 'polished']);
});

test('an artist with no completed sessions ranks after one with any', () => {
  const ranked = byOverlapThenCompletedWork(
    [{ id: 'new', overlap_score: 0 }, { id: 'booked', overlap_score: 0 }],
    new Map([['booked', 1]]),
  );
  assert.deepEqual(ranked.map((a) => a.id), ['booked', 'new']);
});
