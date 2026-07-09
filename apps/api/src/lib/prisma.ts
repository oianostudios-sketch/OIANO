// apps/api/src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Append connection pool settings to DATABASE_URL if not already present.
// Raises the pool limit (default 9) so parallel routes (e.g. pulse) don't
// exhaust it, and gives each connection attempt a generous timeout.
function buildDbUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '20');
    if (!u.searchParams.has('pool_timeout'))     u.searchParams.set('pool_timeout', '20');
    return u.toString();
  } catch {
    return url; // malformed URL — return as-is, Prisma will surface the error
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: { db: { url: buildDbUrl() } },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Auto-reconnect on Neon idle-timeout disconnects (ProcessInterrupts).
// Scoped to known Prisma/Neon messages to avoid swallowing unrelated rejections.
prisma.$on('error' as never, (e: any) => {
  const msg = e?.message ?? String(e);
  if (msg.includes('ProcessInterrupts') || msg.includes('terminating connection')) {
    console.warn('[prisma] Neon dropped connection — will reconnect on next request.');
  }
});
