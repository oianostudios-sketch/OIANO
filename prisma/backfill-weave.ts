// prisma/backfill-weave.ts
// Run once against any environment adopting the Oiano Weave foundation:
//   npx ts-node -r tsconfig-paths/register prisma/backfill-weave.ts
//
// Two passes, both idempotent (safe to re-run):
//   1. A WeaveNode for every existing Artist and Studio, regardless of
//      booking history — a Node's existence must not depend on activity
//      (the brief's "floating node" principle: an artist with zero studio
//      relationships is still a full, independent Node).
//   2. A RECORDED_AT WeaveConnection + evidence for every historical
//      COMPLETED booking, via the exact same syncConnectionFromBooking()
//      used going forward — one code path for "backfill" and "live sync",
//      not two implementations that can drift apart.
import { PrismaClient } from '@prisma/client';
import { ensureNodeExists, syncConnectionFromBooking } from '../apps/api/src/lib/weave/sync';

const prisma = new PrismaClient();

async function main() {
  console.log('Oiano Weave backfill starting...');

  const [artists, studios] = await Promise.all([
    prisma.artist.findMany({ select: { id: true } }),
    prisma.studio.findMany({ select: { id: true } }),
  ]);
  for (const artist of artists) await ensureNodeExists('ARTIST', artist.id);
  for (const studio of studios) await ensureNodeExists('STUDIO', studio.id);
  console.log(`Nodes ensured: ${artists.length} artists, ${studios.length} studios.`);

  const completedBookings = await prisma.booking.findMany({
    where: { status: 'COMPLETED' },
    select: { id: true },
    orderBy: { starts_at: 'asc' },
  });
  let synced = 0;
  for (const booking of completedBookings) {
    await syncConnectionFromBooking(booking.id);
    synced += 1;
  }
  console.log(`Connections synced from ${synced} completed bookings.`);

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
