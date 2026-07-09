// apps/api/src/lib/passport.ts
import { prisma } from './prisma';
import { DEFAULT_STUDIO_SLUG } from '@oiano/shared';

// Passport codes are minted, not rolled: OIA-{studio mint letter}{4-digit
// sequence}, e.g. OIA-Z0001. The sequence lives on Studio and is incremented
// atomically per row, so this is unique by construction — no collision
// check needed, unlike the old random-string scheme. Shared across every
// role (artist, producer, ...) at a studio, since the code identifies mint
// order, not role.
export async function generatePassportCode(): Promise<string> {
  const studio = await prisma.studio.update({
    where: { slug: DEFAULT_STUDIO_SLUG },
    data: { passport_seq: { increment: 1 } },
  });
  return `OIA-${studio.mint_letter}${String(studio.passport_seq).padStart(4, '0')}`;
}
