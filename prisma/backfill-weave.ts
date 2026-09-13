// prisma/backfill-weave.ts
// Run once against any environment adopting the Oiano Weave foundation:
//   npx ts-node -r tsconfig-paths/register prisma/backfill-weave.ts
//
// Idempotent, so safe to re-run, and a run also corrects every synced
// connection's count and dates from its evidence (A08). The logic lives in
// apps/api/src/lib/weave/backfill.ts, where its idempotency is tested; this file
// is only the command-line entry point.
//
//   1. A WeaveNode for every existing Artist and Studio, regardless of booking
//      history (the "floating node" principle).
//   2. A RECORDED_AT WeaveConnection and evidence for every historical COMPLETED
//      booking, via the same syncConnectionFromBooking() used going forward.
import { PrismaClient } from '@prisma/client';
import { backfillWeave } from '../apps/api/src/lib/weave/backfill';

const prisma = new PrismaClient();

async function main() {
  console.log('Oiano Weave backfill starting...');

  const result = await backfillWeave(prisma);
  console.log(`Nodes ensured: ${result.artists} artists, ${result.studios} studios.`);
  console.log(`Connections synced from ${result.completedBookings} completed bookings.`);

  const [nodeCount, connectionCount, evidenceCount] = await Promise.all([
    prisma.weaveNode.count(),
    prisma.weaveConnection.count(),
    prisma.weaveEvidence.count(),
  ]);
  console.log(`Done. weave_nodes=${nodeCount} weave_connections=${connectionCount} weave_connection_evidence=${evidenceCount}`);
}

main()
  .catch((e) => {
    console.error('Weave backfill failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
