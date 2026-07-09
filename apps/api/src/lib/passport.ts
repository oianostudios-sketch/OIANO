// apps/api/src/lib/passport.ts
import { prisma } from './prisma';

export async function generatePassportCode(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code: string;
  let exists = true;

  do {
    const suffix = Array.from({ length: 4 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join('');
    code = `OIANO-${suffix}`;
    const found = await prisma.artistPassport.findUnique({ where: { passport_code: code } });
    exists = !!found;
  } while (exists);

  return code;
}
