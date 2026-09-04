import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_PROFILES,
  accountFamilyForRole,
  accountProfileForRole,
  homePathForRole,
  type UserRole,
} from './accountArchitecture';

const ROLES: UserRole[] = ['ARTIST', 'PRODUCER', 'STUDIO_ADMIN', 'ENGINEER', 'OIANO_ADMIN'];

describe('account family', () => {
  it('maps each role to its family', () => {
    expect(accountFamilyForRole('ARTIST')).toBe('ARTIST');
    expect(accountFamilyForRole('STUDIO_ADMIN')).toBe('STUDIO');
    expect(accountFamilyForRole('OIANO_ADMIN')).toBe('OIANO_PLATFORM');
  });

  // Producer and Engineer are different roles but one account family: both
  // contribute to work they don't own. Collapsing that distinction here is
  // deliberate, so pin it down.
  it('treats producers and engineers as one creative-professional family', () => {
    expect(accountFamilyForRole('PRODUCER')).toBe('CREATIVE_PROFESSIONAL');
    expect(accountFamilyForRole('ENGINEER')).toBe('CREATIVE_PROFESSIONAL');
  });

  it('falls back to artist for an absent role rather than throwing', () => {
    expect(accountFamilyForRole(undefined)).toBe('ARTIST');
    expect(accountFamilyForRole(null)).toBe('ARTIST');
  });

  it('resolves a real profile for every role', () => {
    for (const role of ROLES) {
      const profile = accountProfileForRole(role);
      expect(profile).toBeDefined();
      expect(profile.label.length).toBeGreaterThan(0);
      expect(profile.homePath.startsWith('/')).toBe(true);
    }
  });
});

describe('home path', () => {
  // Operators land on their console, not the shared dashboard. These two
  // deliberately diverge from their family's homePath — without a test that
  // reads as a bug and invites an unhelpful "fix".
  it('sends operators to their own console', () => {
    expect(homePathForRole('STUDIO_ADMIN')).toBe('/admin');
    expect(homePathForRole('OIANO_ADMIN')).toBe('/maintenance');
    expect(ACCOUNT_PROFILES.STUDIO.homePath).toBe('/dashboard');
  });

  it('sends creatives to the shared dashboard', () => {
    expect(homePathForRole('ARTIST')).toBe('/dashboard');
    expect(homePathForRole('PRODUCER')).toBe('/dashboard');
    expect(homePathForRole('ENGINEER')).toBe('/dashboard');
  });

  it('always returns a routable path, even with no role', () => {
    for (const role of [...ROLES, undefined, null]) {
      expect(homePathForRole(role)).toMatch(/^\//);
    }
  });
});

describe('account profiles', () => {
  it('keys every profile to its own family', () => {
    for (const [family, profile] of Object.entries(ACCOUNT_PROFILES)) {
      expect(profile.family).toBe(family);
    }
  });

  // Platform governance is invite-only and the studio side is verified; only
  // the two creator families are open sign-up. A silent change here would
  // widen who can create an account.
  it('keeps platform and studio access gated', () => {
    expect(ACCOUNT_PROFILES.OIANO_PLATFORM.access).toBe('INVITE_ONLY');
    expect(ACCOUNT_PROFILES.STUDIO.access).toBe('VERIFIED');
    expect(ACCOUNT_PROFILES.ARTIST.access).toBe('OPEN');
    expect(ACCOUNT_PROFILES.CREATIVE_PROFESSIONAL.access).toBe('OPEN');
  });
});
