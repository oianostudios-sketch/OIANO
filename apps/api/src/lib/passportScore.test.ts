import assert from 'node:assert/strict';
import test from 'node:test';
import { portfolioBreakdown, portfolioScore } from './passportScore';

const newcomer = { name: 'Ama', passport: {}, releases: [], projects: [], bookings: [] };

test('a new profile scores its name, its account and its tools', () => {
  assert.equal(portfolioScore(newcomer), 11);
});

test('a delivered project counts once, as delivered, even while still marked active (A06)', () => {
  const artist = { ...newcomer, projects: [{ is_active: true, phase: 'DELIVERED' }] };
  assert.equal(portfolioBreakdown(artist).find((part) => part.label === 'Projects')?.earned, 5);
  assert.equal(portfolioScore(artist), 16, 'the stored score agrees with the breakdown the artist reads');
});

test('the score is the total of the breakdown, capped at 100', () => {
  const complete = {
    name: 'Ama', alias: 'AMA', avatar_url: 'https://example.test/a.webp', bio: 'Singer', status: 'AVAILABLE_FOR_BOOKING',
    passport: {
      location: 'Accra', passport_code: 'OIA-TEST', collaboration_interests: ['features'],
      social_links: { instagram: 'a', tiktok: 'b', youtube: 'c', spotify: 'd', website: 'e' },
      creative_dna: { genres: ['afrobeats'], vocal_type: 'alto', energy_profile: 'warm', key_themes: ['home'], influences: ['a'], languages: ['en'] },
    },
    releases: [{}, {}, {}, {}],
    projects: [{ is_active: true, phase: 'MIXING' }, { is_active: false, phase: 'DELIVERED' }],
    bookings: [{ starts_at: '2026-09-01T10:00:00Z', ends_at: '2026-09-01T12:00:00Z' }],
  };
  const total = portfolioBreakdown(complete).reduce((sum, part) => sum + part.earned, 0);
  assert.equal(total, 100);
  assert.equal(portfolioScore(complete), 100);
  assert.equal(portfolioScore({ ...complete, releases: [] }), 80);
});
