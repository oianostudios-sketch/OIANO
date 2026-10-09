const assert = require('node:assert/strict');
const test = require('node:test');
const { scanContent } = require('./check-repository-secrets');

// Built at run time so this file never holds a hash literal of its own.
// The 53 characters are a synthetic salt and digest, not a hash of any password.
const plantedHash = ['$2b', '10', 'S'.repeat(22) + 'd./9'.repeat(7) + 'abc'].join('$');

test('a bcrypt hash in a tracked file fails the scan', () => {
  assert.deepEqual(scanContent('scripts/seed.sql', `insert into users values ('${plantedHash}');`), ['bcrypt password hash']);
  for (const variant of ['$2a', '$2y']) {
    assert.deepEqual(scanContent('docs/notes.md', plantedHash.split('$2b').join(variant)), ['bcrypt password hash']);
  }
});

test('a bcrypt hash is caught even in a test file', () => {
  assert.deepEqual(scanContent('apps/api/src/lib/auth.test.ts', plantedHash), ['bcrypt password hash']);
});

test('a built-in demo password outside its local-only home fails the scan', () => {
  assert.deepEqual(scanContent('docs/setup.md', 'log in with admin@example.com / admin123'), ['demo password']);
  assert.deepEqual(scanContent('scripts/reset.ts', "['demo@artist.com', 'artist123']"), ['demo password']);
  assert.deepEqual(scanContent('prisma/seed.ts', "seedPassword('maintenance123')"), ['demo password']);
});

test('the demo passwords are allowed in their local-only home and in tests', () => {
  assert.deepEqual(scanContent('prisma/local-demo-passwords.ts', "SEED_ADMIN_PASSWORD: 'admin123'"), []);
  assert.deepEqual(scanContent('apps/api/src/lib/seedCredentials.test.ts', "'producer123'"), []);
});

test('ordinary text passes', () => {
  assert.deepEqual(scanContent('docs/setup.md', 'admin1234 and $2b$ alone are not credentials'), []);
});
