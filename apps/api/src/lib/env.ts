// apps/api/src/lib/env.ts
export function validateEnv() {
  if (!process.env.DATABASE_URL)          throw new Error('DATABASE_URL env var is required');
  if (!process.env.JWT_SECRET)            throw new Error('JWT_SECRET env var is required');
  if (!process.env.FRONTEND_URL)          throw new Error('FRONTEND_URL env var is required');
  // Stripe -- only required when STRIPE_ENABLED=true so dev can run without keys
  if (process.env.STRIPE_ENABLED === 'true') {
    if (!process.env.STRIPE_SECRET_KEY)     throw new Error('STRIPE_SECRET_KEY env var is required');
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET env var is required');
  }
}
