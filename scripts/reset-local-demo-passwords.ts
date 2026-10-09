import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { assertLocalTestDatabase } from '../apps/api/src/lib/seedCredentials';
import { LOCAL_DEMO_PASSWORDS } from '../prisma/local-demo-passwords';

// Puts the published demo passwords back, so it runs only against a local test
// database such as npm run dev:local's oiano_dev_test, whatever NODE_ENV says.
assertLocalTestDatabase(process.env, 'Demo credential reset');
const prisma = new PrismaClient();
const accounts = [
  ['demo@artist.com', LOCAL_DEMO_PASSWORDS.SEED_ARTIST_PASSWORD],
  ['producer@dreamzmusiclab.com', LOCAL_DEMO_PASSWORDS.SEED_PRODUCER_PASSWORD],
  ['engineer@dreamzmusiclab.com', LOCAL_DEMO_PASSWORDS.SEED_ENGINEER_PASSWORD],
  ['admin@dreamzmusiclab.com', LOCAL_DEMO_PASSWORDS.SEED_ADMIN_PASSWORD],
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
