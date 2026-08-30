import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

if (process.env.NODE_ENV === 'production') throw new Error('Demo credential reset is disabled in production');
const prisma = new PrismaClient();
const accounts = [
  ['demo@artist.com', 'artist123'],
  ['producer@dreamzmusiclab.com', 'producer123'],
  ['engineer@dreamzmusiclab.com', 'engineer123'],
  ['admin@dreamzmusiclab.com', 'admin123'],
  // maintenance@oiano.com intentionally omitted: once SEED_OIANO_ADMIN_EMAIL
  // points the platform-admin identity at a real address (see prisma/seed.ts),
  // this script must never reset that account back to the demo password.
] as const;

async function main() {
  for (const [email, password] of accounts) {
    const result = await prisma.user.updateMany({ where: { email }, data: { password_hash: await bcrypt.hash(password, 10), auth_version: { increment: 1 } } });
    if (result.count !== 1) throw new Error(`Demo account missing: ${email}`);
  }
  console.log(`Reset ${accounts.length} local demo account passwords without modifying profiles or business data.`);
}
main().finally(() => prisma.$disconnect());
