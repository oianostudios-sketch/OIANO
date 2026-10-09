// prisma/local-demo-passwords.ts
//
// The demo passwords for the local dev database only. This repository is
// public, so these are published values: apps/api/src/lib/seedCredentials.ts
// lets them reach a database only when DATABASE_URL is a local test database
// (npm run dev:local's oiano_dev_test), and rejects them everywhere else.
// `npm run security:secrets` fails if any of them appears outside this file and
// tests.

export const LOCAL_DEMO_PASSWORDS = {
  SEED_ADMIN_PASSWORD: 'admin123',
  SEED_ARTIST_PASSWORD: 'artist123',
  SEED_ENGINEER_PASSWORD: 'engineer123',
  SEED_PRODUCER_PASSWORD: 'producer123',
  SEED_OIANO_ADMIN_PASSWORD: 'maintenance123',
  SEED_ECOSYSTEM_PASSWORD: 'ecosystem123',
} as const;

export const KNOWN_DEMO_PASSWORDS: readonly string[] = Object.values(LOCAL_DEMO_PASSWORDS);
