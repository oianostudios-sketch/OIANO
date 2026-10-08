// apps/api/src/lib/weave/repair.ts
//
// Booking completion syncs the Weave but only logs a sync that fails, so it never
// fails the request that recorded the completion. A booking whose sync failed (a
// database hiccup, a timeout, a restart mid-request) stayed out of its artist and
// studio's connection until a later booking between the same pair re-synced it,
// and without one, for good. This finds recently completed bookings with no Weave
// evidence and runs the same sync for each, so a missed sync heals on the next run.
//
// Nothing here counts anything: syncConnectionFromBooking derives the count and
// dates from the evidence, so repairing a booking is the sync completion missed.
//
// It is a repair, not a backfill. Bookings completed before the Weave existed have
// no evidence either, and syncing those is prisma/backfill-weave.ts, run by the
// owner's decision. So by default only bookings completed within the last seven
// days are considered.
import { prisma } from '../prisma';
import { syncConnectionFromBooking } from './sync';

export const REPAIR_WINDOW_MS = 7 * 86_400_000;
const FAILED_RETRY_AFTER_MS = 60 * 60_000;

export interface WeaveRepairResult {
  // false when another run, in this process or another instance, held the lock.
  ran: boolean;
  found: number;
  repaired: number;
  failed: number;
}

// Bookings whose repair failed in this process, with when. A booking that fails
// every time would otherwise stay at the front of the oldest-first queue, and
// `limit` of them would keep every newer missed booking from being reached. Each
// is skipped for an hour, then tried again. Kept in memory: a restart retries all.
const failedAt = new Map<string, number>();

// `since` bounds when the booking became COMPLETED. Booking has no completion
// timestamp, so this is updated_at: every completion path writes the status through
// Prisma, which sets it. A later edit of a completed booking also moves it, which
// can bring an old booking back into the window; that is a single booking, not
// the history. `since: null` removes the bound, for a deliberate manual run.
export async function repairMissedWeaveSyncs({
  limit = 50,
  since = new Date(Date.now() - REPAIR_WINDOW_MS),
}: { limit?: number; since?: Date | null } = {}): Promise<WeaveRepairResult> {
  // One run at a time across every instance. The lock is held by a transaction,
  // so it is released when the run ends or its connection drops, and it works
  // through a transaction-mode pooler. The syncs run on their own connections;
  // each locks its connection row, so this only saves duplicate work.
  return prisma.$transaction(async (tx) => {
    const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtext('oiano:weave-repair')) AS locked
    `;
    if (!locked) return { ran: false, found: 0, repaired: 0, failed: 0 };

    const now = Date.now();
    for (const [id, at] of failedAt) if (now - at >= FAILED_RETRY_AFTER_MS) failedAt.delete(id);

    // Oldest first, bounded, so a large backlog drains over several runs.
    const missed = await prisma.booking.findMany({
      where: {
        status: 'COMPLETED',
        weave_evidence: { none: {} },
        ...(since ? { updated_at: { gte: since } } : {}),
        ...(failedAt.size > 0 ? { id: { notIn: [...failedAt.keys()] } } : {}),
      },
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
        failedAt.set(booking.id, Date.now());
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
