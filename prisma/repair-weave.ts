// prisma/repair-weave.ts
// Syncs completed bookings whose Weave sync was missed, as the API does every ten
// minutes, for a manual run:
//   npm run db:repair-weave --workspace=apps/api [-- <limit>] [--days=N | --all]
// By default only bookings completed in the last 7 days, as the scheduled run.
// --days=N looks further back; --all has no bound, which amounts to the backfill
// (prisma/backfill-weave.ts) and is the owner's call for production.
// Idempotent. The logic lives in apps/api/src/lib/weave/repair.ts.
import { prisma } from '../apps/api/src/lib/prisma';
import { REPAIR_WINDOW_MS, repairMissedWeaveSyncs } from '../apps/api/src/lib/weave/repair';

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const daysArg = args.find((a) => a.startsWith('--days='));
  const limitArg = args.find((a) => !a.startsWith('--'));

  const limit = limitArg ? Number(limitArg) : 500;
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`limit must be a positive integer, got ${limitArg}`);
  const days = daysArg ? Number(daysArg.slice('--days='.length)) : REPAIR_WINDOW_MS / 86_400_000;
  if (!(days > 0)) throw new Error(`--days must be a positive number, got ${daysArg}`);
  if (all && daysArg) throw new Error('use --days=N or --all, not both');
  const since = all ? null : new Date(Date.now() - days * 86_400_000);

  const result = await repairMissedWeaveSyncs({ limit, since });
  const scope = since ? `completed since ${since.toISOString()}` : 'completed at any time';
  if (!result.ran) console.log('Another Weave repair is running; nothing done.');
  else console.log(`Weave repair (${scope}): ${result.found} missed, ${result.repaired} repaired, ${result.failed} failed.`);
  if (result.failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('Weave repair failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
