// prisma/backfill-identity.ts
// Canonical migration steps 1 and 2: Person and CreativeProfile.
//   npx ts-node -r tsconfig-paths/register prisma/backfill-identity.ts            backfill, then verify
//   npx ts-node -r tsconfig-paths/register prisma/backfill-identity.ts --verify   verify only, writes nothing
//
// Run after migration 20261005120000_identity_person_profile is applied. Idempotent: a
// second run creates nothing. The logic and its tests live in
// apps/api/src/lib/identity/backfill.ts; this file is only the command-line entry point.
// Exits non-zero if any legacy identity fails to resolve.
import { PrismaClient } from '@prisma/client';
import { backfillIdentity, identityParity } from '../apps/api/src/lib/identity/backfill';

const prisma = new PrismaClient();

async function main() {
  const verifyOnly = process.argv.includes('--verify');
  if (!verifyOnly) {
    console.log('Identity backfill starting...');
    const result = await backfillIdentity(prisma);
    console.log(`Created ${result.personsCreated} persons and ${result.profilesCreated} creative profiles.`);
  }
  const parity = await identityParity(prisma);
  const c = parity.counts;
  console.log(`users=${c.users} persons=${c.persons} artists=${c.artists} producers=${c.producers} engineers=${c.engineers} creative_profiles=${c.profiles}`);
  if (parity.mismatches.length) {
    console.error(`Parity: ${parity.mismatches.length} mismatch(es)`);
    for (const line of parity.mismatches.slice(0, 50)) console.error(`  ${line}`);
    process.exitCode = 1;
  } else {
    console.log('Parity: every legacy identity resolves.');
  }
}

main()
  .catch((e) => {
    console.error('Identity backfill failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
