// apps/api/src/lib/env.ts
export function validateEnv() {
  if (!process.env.DATABASE_URL)          throw new Error('DATABASE_URL env var is required');
  if (!process.env.JWT_SECRET)            throw new Error('JWT_SECRET env var is required');
  if (!process.env.FRONTEND_URL)          throw new Error('FRONTEND_URL env var is required');
  // Independent from JWT_SECRET so a leaked auth secret doesn't also expose
  // every stored MFA secret -- see lib/totp.ts and SCALE_READINESS_ROADMAP.md
  // Tier 0.6. As security-critical as JWT_SECRET itself, so it's required
  // unconditionally rather than gated behind a feature flag.
  if (!process.env.MFA_ENCRYPTION_KEY)    throw new Error('MFA_ENCRYPTION_KEY env var is required');
  // Stripe -- only required when STRIPE_ENABLED=true so dev can run without keys
  if (process.env.STRIPE_ENABLED === 'true') {
    if (!process.env.STRIPE_SECRET_KEY)     throw new Error('STRIPE_SECRET_KEY env var is required');
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET env var is required');
  }
  // Intelligence layer -- only required when OIANO_AI_ENABLED=true so the app
  // boots and runs normally with the master flag off (or absent)
  if (process.env.OIANO_AI_ENABLED === 'true') {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY env var is required when OIANO_AI_ENABLED=true');
  }

  if (process.env.NODE_ENV === 'production') {
    const violations: string[] = [];
    if (process.env.JWT_SECRET!.length < 32) violations.push('JWT_SECRET must be at least 32 characters');
    if (process.env.MFA_ENCRYPTION_KEY!.length < 32) violations.push('MFA_ENCRYPTION_KEY must be at least 32 characters');

    try {
      const frontend = new URL(process.env.FRONTEND_URL!);
      if (frontend.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(frontend.hostname)) {
        violations.push('FRONTEND_URL must be a public HTTPS origin');
      }
    } catch {
      violations.push('FRONTEND_URL must be a valid URL');
    }

    try {
      const database = new URL(process.env.DATABASE_URL!);
      if (database.searchParams.get('sslmode') !== 'require') violations.push('DATABASE_URL must enforce sslmode=require');
    } catch {
      violations.push('DATABASE_URL must be a valid PostgreSQL URL');
    }

    const operational = [
      'SENTRY_DSN', 'SUPPORT_EMAIL', 'PRIVACY_EMAIL', 'SECURITY_EMAIL',
      'OPERATIONS_ON_CALL', 'BACKUP_OUTPUT_DIR', 'BACKUP_RESTORE_TESTED_AT',
      'LEGAL_ENTITY_NAME', 'LEGAL_ENTITY_ADDRESS', 'GOVERNING_LAW',
    ];
    for (const name of operational) {
      if (!String(process.env[name] ?? '').trim()) violations.push(`${name} is required in production`);
    }

    const restoreDate = Date.parse(process.env.BACKUP_RESTORE_TESTED_AT ?? '');
    if (!Number.isFinite(restoreDate) || Date.now() - restoreDate > 35 * 86_400_000) {
      violations.push('BACKUP_RESTORE_TESTED_AT must record a successful restore within 35 days');
    }
    if (violations.length) throw new Error(`Production environment is not ready: ${violations.join('; ')}`);
  }
}
