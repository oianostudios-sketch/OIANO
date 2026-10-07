// apps/api/src/lib/weave/repair.ts
//
// Booking completion syncs the Weave but only logs a sync that fails, so it never
// fails the request that recorded the completion. A booking whose sync failed (a
// database hiccup, a timeout, a restart mid-request) stayed out of its artist and
// studio's connection until a later booking between the same pair re-synced it,
// and without one, for good. This finds completed bookings with no Weave evidence
// and runs the same sync for each, so a missed sync heals on the next run.
//
// Nothing here counts anything: syncConnectionFromBooking derives the count and
// dates from the evidence, so repairing a booking is the sync completion missed.
import { prisma } from '../prisma';
import { syncConnectionFromBooking } from './sync';

export interface WeaveRepairResult {
  // false when another run, in this process or another instance, held the lock.
  ran: boolean;
  found: number;
  repaired: number;
  failed: number;
}

export async function repairMissedWeaveSyncs({ limit = 50 }: { limit?: number } = {}): Promise<WeaveRepairResult> {
  // One run at a time across every instance. The lock is held by a transaction,
  // so it is released when the run ends or its connection drops, and it works
  // through a transaction-mode pooler. The syncs run on their own connections;
  // each locks its connection row, so this only saves duplicate work.
  return prisma.$transaction(async (tx) => {
    const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtext('oiano:weave-repair')) AS locked
    `;
    if (!locked) return { ran: false, found: 0, repaired: 0, failed: 0 };

    // Oldest first, bounded, so a large backlog drains over several runs.
    const missed = await prisma.booking.findMany({
      where: { status: 'COMPLETED', weave_evidence: { none: {} } },
      select: { id: true },
      orderBy: [{ starts_at: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    let repaired = 0;
    let failed = 0;
    for (const booking of missed) {
      try {
        await syncConnectionFromBooking(booking.id);
        repaired += 1;
      } catch (e: any) {
        failed += 1;
        console.error(`[weave] repair of booking ${booking.id} failed:`, e?.message);
      }
    }
    return { ran: true, found: missed.length, repaired, failed };
  }, { maxWait: 10_000, timeout: 10 * 60_000 });
}

const REPAIR_INTERVAL_MS = 10 * 60_000;
let scheduled = false;

// Runs the repair a minute after start and every ten minutes after. Skipped under
// NODE_ENV=test, which tests and `dev:local` run with; tests call the repair directly.
export function scheduleWeaveRepair() {
  if (scheduled || process.env.NODE_ENV === 'test') return;
  scheduled = true;
  const run = () => {
    repairMissedWeaveSyncs()
      .then((result) => {
        if (result.found > 0) console.log('[weave] repair run', result);
      })
      .catch((e: any) => console.error('[weave] repair run failed:', e?.message));
  };
  setTimeout(run, 60_000).unref();
  setInterval(run, REPAIR_INTERVAL_MS).unref();
}
