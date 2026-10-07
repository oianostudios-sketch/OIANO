// apps/api/src/lib/engineerSchedule.ts
//
// One engineer, one session at a time (C28). The database keeps a room to one booking
// at a time with an exclusion constraint; nothing did the same for the person engineering
// it, so staff could put one engineer on two sessions that overlap. A constraint needs a
// migration, so until one lands the rule is held here, inside the transaction that writes
// the assignment or the new time.
//
// The engineer's row is locked first, so two requests that would each place the engineer
// on an overlapping session take turns, and the second sees the first. Callers lock the
// booking row before calling, in the same order everywhere (booking, then engineer).
import type { Prisma } from '@prisma/client';
import { AppError } from './errors';

export async function assertEngineerFree(tx: Prisma.TransactionClient, input: {
  engineerId: string;
  startsAt: Date;
  endsAt: Date;
  exceptBookingId: string;
}) {
  await tx.$queryRaw`SELECT id FROM engineers WHERE id = ${input.engineerId} FOR UPDATE`;
  // Two sessions overlap when each starts before the other ends; one sitting wholly inside
  // the other overlaps too. A cancelled or no-show session holds no time.
  const clash = await tx.booking.findFirst({
    where: {
      engineer_id: input.engineerId,
      id: { not: input.exceptBookingId },
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      starts_at: { lt: input.endsAt },
      ends_at: { gt: input.startsAt },
    },
    select: { id: true },
  });
  if (clash) throw new AppError('This engineer is already on another session at that time', 409);
}
