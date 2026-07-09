/**
 * One-off: renumber existing passport codes to OIA-{mint_letter}{seq},
 * ordered by issued_at ascending — so low numbers reflect real signup
 * order, not the luck of when this script happens to run.
 *
 * Run once, after the mint_letter/passport_seq migration:
 *   node apps/api/scripts/backfill-passport-codes.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const STUDIO_SLUG = 'dreamz-music-lab';

async function main() {
  const studio = await prisma.studio.findUnique({ where: { slug: STUDIO_SLUG } });
  if (!studio) throw new Error(`Studio '${STUDIO_SLUG}' not found`);

  const [artistPassports, producerPassports] = await Promise.all([
    prisma.artistPassport.findMany({ orderBy: { issued_at: 'asc' } }),
    prisma.producerPassport.findMany({ orderBy: { issued_at: 'asc' } }),
  ]);

  const all = [
    ...artistPassports.map(p => ({ ...p, kind: 'artist' })),
    ...producerPassports.map(p => ({ ...p, kind: 'producer' })),
  ].sort((a, b) => a.issued_at.getTime() - b.issued_at.getTime());

  let seq = 0;
  for (const p of all) {
    seq += 1;
    const code = `OIA-${studio.mint_letter}${String(seq).padStart(4, '0')}`;
    if (p.kind === 'artist') {
      await prisma.artistPassport.update({ where: { id: p.id }, data: { passport_code: code } });
    } else {
      await prisma.producerPassport.update({ where: { id: p.id }, data: { passport_code: code } });
    }
    console.log(`${p.kind.padEnd(8)} ${p.id}  ->  ${code}`);
  }

  await prisma.studio.update({ where: { id: studio.id }, data: { passport_seq: seq } });
  console.log(`\nDone. ${seq} passports renumbered. Studio.passport_seq set to ${seq}.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
