// apps/api/src/lib/passport.ts
import { prisma } from './prisma';
import crypto from 'node:crypto';

// OIANO identities belong to the platform, not to the first studio an artist
// happens to use. Mint an opaque platform code and check both passport tables
// so onboarding never mutates or depends on a particular studio tenant.
export async function generatePassportCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = crypto.randomBytes(5).toString('hex').toUpperCase();
    const code = `OIA-${token}`;
    const [artist, producer] = await Promise.all([
      prisma.artistPassport.findUnique({ where: { passport_code: code }, select: { id: true } }),
      prisma.producerPassport.findUnique({ where: { passport_code: code }, select: { id: true } }),
    ]);
    if (!artist && !producer) return code;
  }
  throw new Error('Unable to mint a unique OIANO identity code');
}
