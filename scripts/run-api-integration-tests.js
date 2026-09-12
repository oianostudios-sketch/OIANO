const { spawnSync } = require('node:child_process');

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

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: require('node:path').resolve(__dirname, '..'),
    env,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}

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
]);
