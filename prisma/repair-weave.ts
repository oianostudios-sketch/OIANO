// prisma/repair-weave.ts
// Syncs completed bookings whose Weave sync was missed, as the API does every ten
// minutes, for a manual run:
//   npm run db:repair-weave --workspace=apps/api [-- <limit>]
// Idempotent. The logic lives in apps/api/src/lib/weave/repair.ts.
import { prisma } from '../apps/api/src/lib/prisma';
import { repairMissedWeaveSyncs } from '../apps/api/src/lib/weave/repair';

async function main() {
  const limit = process.argv[2] ? Number(process.argv[2]) : 500;
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`limit must be a positive integer, got ${process.argv[2]}`);
  const result = await repairMissedWeaveSyncs({ limit });
  if (!result.ran) console.log('Another Weave repair is running; nothing done.');
  else console.log(`Weave repair: ${result.found} missed, ${result.repaired} repaired, ${result.failed} failed.`);
  if (result.failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('Weave repair failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
