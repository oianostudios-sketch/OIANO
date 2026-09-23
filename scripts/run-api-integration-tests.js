const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const integrationUrl = process.env.INTEGRATION_DATABASE_URL;
if (!integrationUrl) {
  console.error('INTEGRATION_DATABASE_URL is required. Use a disposable database whose name contains "test".');
  process.exit(1);
}

let databaseName;
let schemaName;
try {
  const parsed = new URL(integrationUrl);
  databaseName = parsed.pathname.replace(/^\//, '');
  schemaName = parsed.searchParams.get('schema') || 'public';
} catch {
  console.error('INTEGRATION_DATABASE_URL must be a valid PostgreSQL URL.');
  process.exit(1);
}

if (!/(^|[_-])test([_-]|$)/i.test(databaseName) && !/(^|[_-])test([_-]|$)/i.test(schemaName)) {
  console.error(`Refusing integration tests against database "${databaseName}" schema "${schemaName}"; one must contain a standalone "test" segment.`);
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: integrationUrl,
  JWT_SECRET: process.env.JWT_SECRET || 'integration-only-jwt-secret-change-me',
  MFA_ENCRYPTION_KEY: process.env.MFA_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  STRIPE_ENABLED: 'false',
  OIANO_AI_ENABLED: 'false',
  SENDGRID_API_KEY: '',
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}

// The API imports @oiano/shared, which resolves through that package's "main",
// dist/index.js. dist is gitignored and no install step writes it, so on a fresh
// checkout every test file that imports it failed to load with MODULE_NOT_FOUND;
// only the one file that does not import it ran, and passed, which reads like a
// suite that works. This runner is the one path both CI and
// `npm run test:integration:local` take, so the build belongs here rather than in
// either caller: CI's own "Build shared package" step still runs first and this
// finds its work done. A dist that is present but stale is left alone, exactly as
// `npm run dev:local` leaves it.
function buildSharedPackageIfMissing() {
  if (fs.existsSync(path.join(root, 'packages', 'shared', 'dist', 'index.js'))) return;
  console.log('Building packages/shared, which the API imports as @oiano/shared');
  // npm is a .cmd file on Windows, which Node will not spawn without a shell.
  // Under `npm run`, npm_execpath names npm's own script, so no shell is needed.
  const args = ['run', 'build', '--workspace=packages/shared'];
  if (process.env.npm_execpath) run(process.execPath, [process.env.npm_execpath, ...args]);
  else run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { shell: process.platform === 'win32' });
}

buildSharedPackageIfMissing();
run(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy']);
// Integration files share one database, so they run one at a time. In parallel,
// the Weave backfill test would sync other files' completed bookings while those
// files are still asserting on them.
run('node', [
  '-r', 'ts-node/register/transpile-only', '-r', 'tsconfig-paths/register',
  '--test', '--test-concurrency=1',
  'apps/api/src/integration/platform.integration.test.ts',
  'apps/api/src/integration/architecture.integration.test.ts',
  'apps/api/src/integration/weave-invitations.integration.test.ts',
  'apps/api/src/integration/bookings-payments.integration.test.ts',
  'apps/api/src/integration/stabilization.integration.test.ts',
]);
