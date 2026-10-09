// apps/api/src/lib/seedCredentials.ts
//
// Decides which password a seed or demo script may give an account.
//
// The repository is public, so any password written in it is a published
// password. The built-in demo passwords may therefore only ever reach a
// database on this machine that is plainly a disposable test or dev_test
// database (the same rule `npm run dev:local` and the integration runner use).
// Anywhere else the password must come from the environment, must not be one of
// the published defaults, and must be long enough not to be guessed.
//
// NODE_ENV is deliberately not consulted: production runs NODE_ENV=staging, so
// a NODE_ENV check let the published defaults into production once.

export const MIN_SEED_PASSWORD_LENGTH = 12;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const STANDALONE_TEST_SEGMENT = /(^|[_-])test([_-]|$)/i;

/** True only for a database on this machine whose name has a standalone "test" segment. */
export function isLocalTestDatabaseUrl(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return false;
  let url: URL;
  try { url = new URL(databaseUrl); } catch { return false; }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') return false;
  if (!LOCAL_HOSTS.has(url.hostname.toLowerCase())) return false;
  // A `host=` query parameter overrides the URL host for libpq and Prisma.
  const hostOverride = url.searchParams.get('host');
  if (hostOverride && !LOCAL_HOSTS.has(hostOverride.toLowerCase())) return false;
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  return STANDALONE_TEST_SEGMENT.test(database);
}

export interface SeedPasswordRequest {
  /** Environment variable that may supply the password, such as SEED_ADMIN_PASSWORD. */
  name: string;
  env: Record<string, string | undefined>;
  /** Built-in password for a local test database, or undefined when there is none. */
  localFallback?: string;
  /** Every built-in demo password; none of them is accepted outside a local test database. */
  knownDefaults: readonly string[];
}

/**
 * Returns the password to use, or throws. On a local test database the
 * environment wins and the built-in fallback fills the gap. Anywhere else the
 * environment must supply a password of at least MIN_SEED_PASSWORD_LENGTH
 * characters that is not one of the published defaults.
 */
export function resolveSeedPassword({ name, env, localFallback, knownDefaults }: SeedPasswordRequest): string {
  const configured = env[name];
  if (isLocalTestDatabaseUrl(env.DATABASE_URL)) {
    if (configured) return configured;
    if (localFallback !== undefined) return localFallback;
    throw new Error(`${name} is required`);
  }
  if (!configured) {
    throw new Error(`${name} is required: built-in demo passwords are used only on a local test database (npm run dev:local)`);
  }
  if (knownDefaults.includes(configured)) {
    throw new Error(`${name} is a published demo password and may not be used outside a local test database`);
  }
  if (configured.length < MIN_SEED_PASSWORD_LENGTH) {
    throw new Error(`${name} must be at least ${MIN_SEED_PASSWORD_LENGTH} characters outside a local test database`);
  }
  return configured;
}

/** Throws unless DATABASE_URL is a local test database. */
export function assertLocalTestDatabase(env: Record<string, string | undefined>, what: string): void {
  if (!isLocalTestDatabaseUrl(env.DATABASE_URL)) {
    throw new Error(`${what} runs only against a local test database (localhost, name with a standalone "test" segment, such as npm run dev:local's oiano_dev_test)`);
  }
}
