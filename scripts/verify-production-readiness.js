const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env') });

const required = [
  'DATABASE_URL','JWT_SECRET','MFA_ENCRYPTION_KEY','FRONTEND_URL',
  'SENTRY_DSN','SUPPORT_EMAIL','PRIVACY_EMAIL','SECURITY_EMAIL','OPERATIONS_ON_CALL',
  'BACKUP_OUTPUT_DIR','BACKUP_RESTORE_TESTED_AT','LEGAL_ENTITY_NAME','LEGAL_ENTITY_ADDRESS','GOVERNING_LAW',
];
if (process.env.STRIPE_ENABLED === 'true') required.push('STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET');
const missing = required.filter(name => !String(process.env[name] ?? '').trim());
const weak = [];
for (const name of ['JWT_SECRET','MFA_ENCRYPTION_KEY']) if (String(process.env[name] ?? '').length < 32) weak.push(`${name} must be at least 32 characters`);
try {
  const frontend = new URL(process.env.FRONTEND_URL ?? '');
  if (frontend.protocol !== 'https:' || ['localhost','127.0.0.1'].includes(frontend.hostname)) weak.push('FRONTEND_URL must be a public HTTPS origin');
} catch { weak.push('FRONTEND_URL must be a valid URL'); }
try {
  const database = new URL(process.env.DATABASE_URL ?? '');
  if (database.searchParams.get('sslmode') !== 'require') weak.push('DATABASE_URL must enforce sslmode=require');
} catch { weak.push('DATABASE_URL must be a valid PostgreSQL URL'); }
const restoreDate = Date.parse(process.env.BACKUP_RESTORE_TESTED_AT ?? '');
if (!Number.isFinite(restoreDate) || Date.now() - restoreDate > 35 * 86400000) weak.push('BACKUP_RESTORE_TESTED_AT must record a successful restore within 35 days');
if (missing.length || weak.length) {
  console.error(JSON.stringify({ ready: false, missing, violations: weak }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ready: true, checked_at: new Date().toISOString(), controls: required.length }, null, 2));
