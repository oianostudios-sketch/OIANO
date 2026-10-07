// apps/api/src/lib/roomSchedule.ts
//
// One room, one session at a time. The database holds this with an exclusion constraint
// (bookings_room_time_no_overlap); the check here answers a clash with a clear 409 before
// the write, inside the transaction that makes it.
//
// The room's row is locked first, so two requests for the same room take turns. Callers
// that also lock a booking lock it before the room, and the room before an engineer.
import { Prisma } from '@prisma/client';

export type TimeSlot = { startsAt: Date; endsAt: Date };

// The first live booking in the room that overlaps any of the slots, or null.
export async function findRoomClash(tx: Prisma.TransactionClient, input: {
  roomId: string;
  slots: TimeSlot[];
  exceptBookingId?: string;
}) {
  await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${input.roomId} FOR UPDATE`;
  // Two sessions overlap when each starts before the other ends; one sitting wholly inside
  // the other overlaps too, and one ending as the other starts does not. A cancelled or
  // no-show session holds no time.
  return tx.booking.findFirst({
    where: {
      room_id: input.roomId,
      ...(input.exceptBookingId && { id: { not: input.exceptBookingId } }),
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      OR: input.slots.map((slot) => ({ starts_at: { lt: slot.endsAt }, ends_at: { gt: slot.startsAt } })),
    },
    select: { id: true, starts_at: true },
  });
}

// A write the room's exclusion constraint refused (Postgres 23P01), or the deadlock two
// such writes can end in (40P01). Prisma 5.22 reports both as unknown request errors;
// P2004 and P2034 are its own codes for the same failures, P2034 also for a serializable
// transaction that lost to another.
export function isRoomClash(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return ['P2004', 'P2034'].includes(error.code);
  return error instanceof Prisma.PrismaClientUnknownRequestError && /\b(23P01|40P01)\b/.test(error.message);
}
