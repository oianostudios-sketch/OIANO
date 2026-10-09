import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLocalTestDatabase, isLocalTestDatabaseUrl, resolveSeedPassword } from './seedCredentials';

// The published defaults, as prisma/local-demo-passwords.ts lists them.
const knownDefaults = ['admin123', 'artist123', 'engineer123', 'producer123', 'maintenance123', 'ecosystem123'];
const localDev = 'postgresql://postgres@127.0.0.1:55432/oiano_dev_test';
const hosted = 'postgresql://app@db.example.com:5432/oiano';
const request = (env: Record<string, string | undefined>) => ({
  name: 'SEED_ADMIN_PASSWORD', env, localFallback: 'admin123', knownDefaults,
});

test('only a database on this machine with a standalone "test" segment counts as local', () => {
  for (const url of [
    localDev,
    'postgresql://postgres@localhost:55432/oiano_integration_20261009_test',
    'postgres://postgres@[::1]:5432/test',
    'postgresql://postgres@127.0.0.1/oiano-test-db',
  ]) assert.equal(isLocalTestDatabaseUrl(url), true, url);
  for (const url of [
    undefined,
    '',
    'not a url',
    hosted,
    'postgresql://postgres@db.example.com:5432/oiano_dev_test',
    'postgresql://postgres@127.0.0.1:55432/oiano',
    'postgresql://postgres@127.0.0.1:55432/oiano_testing',
    'postgresql://postgres@127.0.0.1:55432/latest',
    'postgresql://postgres@127.0.0.1:55432/oiano_dev_test?host=db.example.com',
    'mysql://root@localhost/oiano_test',
  ]) assert.equal(isLocalTestDatabaseUrl(url), false, String(url));
});

test('a non-local database with no seed password set is refused', () => {
  assert.throws(() => resolveSeedPassword(request({ DATABASE_URL: hosted })), /SEED_ADMIN_PASSWORD is required/);
});

test('no DATABASE_URL at all is treated as non-local, whatever NODE_ENV says', () => {
  assert.throws(() => resolveSeedPassword(request({ NODE_ENV: 'staging' })), /is required/);
  assert.throws(() => resolveSeedPassword(request({ NODE_ENV: 'development', DATABASE_URL: hosted })), /is required/);
});

test('a published default is refused outside a local test database, even when set explicitly', () => {
  for (const password of knownDefaults) {
    assert.throws(
      () => resolveSeedPassword(request({ DATABASE_URL: hosted, SEED_ADMIN_PASSWORD: password })),
      /published demo password/,
      password,
    );
  }
});

test('a short password is refused outside a local test database', () => {
  assert.throws(
    () => resolveSeedPassword(request({ DATABASE_URL: hosted, SEED_ADMIN_PASSWORD: 'short-pass1' })),
    /at least 12 characters/,
  );
});

test('a strong supplied password is used outside a local test database', () => {
  assert.equal(
    resolveSeedPassword(request({ DATABASE_URL: hosted, SEED_ADMIN_PASSWORD: 'a-strong-generated-value' })),
    'a-strong-generated-value',
  );
});

test('a local test database gets the built-in password, or the one set in the environment', () => {
  assert.equal(resolveSeedPassword(request({ DATABASE_URL: localDev })), 'admin123');
  assert.equal(resolveSeedPassword(request({ DATABASE_URL: localDev, SEED_ADMIN_PASSWORD: 'other' })), 'other');
});

test('a script with no built-in password still needs one set on a local test database', () => {
  assert.throws(
    () => resolveSeedPassword({ name: 'SEED_PRODUCER_PASSWORD', env: { DATABASE_URL: localDev }, knownDefaults }),
    /SEED_PRODUCER_PASSWORD is required/,
  );
});

test('the demo password reset refuses anything but a local test database', () => {
  assert.throws(() => assertLocalTestDatabase({ DATABASE_URL: hosted }, 'Demo credential reset'), /only against a local test database/);
  assert.throws(() => assertLocalTestDatabase({}, 'Demo credential reset'), /only against a local test database/);
  assert.doesNotThrow(() => assertLocalTestDatabase({ DATABASE_URL: localDev }, 'Demo credential reset'));
});
