export type UserRole = 'ARTIST' | 'PRODUCER' | 'STUDIO_ADMIN' | 'ENGINEER' | 'OIANO_ADMIN';
export type AccountFamily = 'ARTIST' | 'STUDIO' | 'CREATIVE_PROFESSIONAL' | 'OIANO_PLATFORM';

export interface AccountProfile {
  family: AccountFamily;
  label: string;
  eyebrow: string;
  purpose: string;
  homePath: string;
  access: 'OPEN' | 'VERIFIED' | 'INVITE_ONLY';
}

export const ACCOUNT_PROFILES: Record<AccountFamily, AccountProfile> = {
  ARTIST: {
    family: 'ARTIST', label: 'Artist', eyebrow: 'Create and grow',
    purpose: 'Discover studios, build projects and grow a verified professional record.',
    homePath: '/dashboard', access: 'OPEN',
  },
  STUDIO: {
    family: 'STUDIO', label: 'Studio', eyebrow: 'Operate and connect',
    purpose: 'Run rooms, teams, bookings, finance and the studio’s creator network.',
    homePath: '/dashboard', access: 'VERIFIED',
  },
  CREATIVE_PROFESSIONAL: {
    family: 'CREATIVE_PROFESSIONAL', label: 'Creative professional', eyebrow: 'Contribute and be credited',
    purpose: 'Produce, engineer, write, perform and build a portable contribution history.',
    homePath: '/dashboard', access: 'OPEN',
  },
  OIANO_PLATFORM: {
    family: 'OIANO_PLATFORM', label: 'OIANO Platform', eyebrow: 'Protect and govern',
    purpose: 'Maintain network health, trust, access, finance and platform governance.',
    homePath: '/maintenance', access: 'INVITE_ONLY',
  },
};

export function accountFamilyForRole(role?: UserRole | null): AccountFamily {
  if (role === 'STUDIO_ADMIN') return 'STUDIO';
  if (role === 'PRODUCER' || role === 'ENGINEER') return 'CREATIVE_PROFESSIONAL';
  if (role === 'OIANO_ADMIN') return 'OIANO_PLATFORM';
  return 'ARTIST';
}

export function accountProfileForRole(role?: UserRole | null): AccountProfile {
  return ACCOUNT_PROFILES[accountFamilyForRole(role)];
}

export function homePathForRole(role?: UserRole | null): string {
  if (role === 'STUDIO_ADMIN') return '/admin';
  if (role === 'OIANO_ADMIN') return '/maintenance';
  return ACCOUNT_PROFILES[accountFamilyForRole(role)].homePath;
}

export const CREATIVE_PROJECT_ROLES = [
  'Producer', 'Engineer', 'Songwriter', 'Musician', 'Composer',
  'Vocalist', 'Mix engineer', 'Mastering engineer', 'Other collaborator',
] as const;
