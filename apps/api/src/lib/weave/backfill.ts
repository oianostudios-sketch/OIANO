// apps/api/src/lib/weave/backfill.ts
//
// The Weave backfill, as a function that can be run twice in one process.
//
// It used to live only inside prisma/backfill-weave.ts, which ran on import, so
// the property that makes a backfill safe — a second run changes nothing —
// could not be tested without spawning a child process and trusting it to reach
// the same database as the test. The command-line script now calls this.
//
// `db` is the client used for reads. Writes go through syncConnectionFromBooking,
// exactly as live booking completion does: one code path for backfill and live
// sync, not two that can drift apart.
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';
import { ensureNodeExists, syncConnectionFromBooking } from './sync';

export interface WeaveBackfillResult {
  artists: number;
  studios: number;
  completedBookings: number;
}

type ReadClient = Pick<PrismaClient, 'artist' | 'studio' | 'booking'>;

export async function backfillWeave(db: ReadClient = prisma): Promise<WeaveBackfillResult> {
  // Pass 1: a node for every artist and studio, whatever its history. A node's
  // existence must not depend on activity — an artist with no studio
  // relationships is still a full, independent node.
  const [artists, studios] = await Promise.all([
    db.artist.findMany({ select: { id: true } }),
    db.studio.findMany({ select: { id: true } }),
  ]);
  for (const artist of artists) await ensureNodeExists('ARTIST', artist.id);
  for (const studio of studios) await ensureNodeExists('STUDIO', studio.id);

  // Pass 2: a connection and evidence for every completed booking, oldest first.
  const completed = await db.booking.findMany({
    where: { status: 'COMPLETED' },
    select: { id: true },
    orderBy: { starts_at: 'asc' },
  });
  for (const booking of completed) await syncConnectionFromBooking(booking.id);

  return { artists: artists.length, studios: studios.length, completedBookings: completed.length };
}
