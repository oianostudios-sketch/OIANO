import type { BookingStatus, Prisma } from '@prisma/client';
import { AppError } from './errors';
import type { prisma } from './prisma';

type Db = Prisma.TransactionClient | typeof prisma;

// Which status a booking may move to next, stated once (A02).
//
// The status route wrote whatever it was sent, so a completed booking could be
// reopened as pending, and every repeated COMPLETED re-ran the completion effects:
// another session.completed event, another circle sync. Four writers — the status
// route, the completion screen, file delivery and the Stripe webhook — each decided
// for themselves what was legal, and they disagreed.
//
// COMPLETED, CANCELLED and NO_SHOW are closed. That is not new policy: engineer
// assignment and the completion screen already refused to act on those three.
// Every move a dashboard offers today is in this table, so no button a studio can
// press is taken away.
const NEXT: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'COMPLETED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export const CLOSED_BOOKING_STATUSES: readonly BookingStatus[] = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

export type TransitionVerdict = 'APPLY' | 'UNCHANGED' | 'ILLEGAL';

export function judgeBookingTransition(from: BookingStatus, to: BookingStatus): TransitionVerdict {
  if (from === to) return 'UNCHANGED';
  return NEXT[from].includes(to) ? 'APPLY' : 'ILLEGAL';
}

export type TransitionResult =
  | { outcome: 'APPLIED'; from: BookingStatus; to: BookingStatus }
  | { outcome: 'UNCHANGED'; from: BookingStatus; to: BookingStatus }
  | { outcome: 'SKIPPED'; from: BookingStatus; to: BookingStatus }
  | { outcome: 'ILLEGAL'; from: BookingStatus; to: BookingStatus }
  | { outcome: 'NOT_FOUND'; to: BookingStatus }
  | { outcome: 'CONFLICT'; to: BookingStatus };

export type AcceptedTransition = Extract<TransitionResult, { outcome: 'APPLIED' | 'UNCHANGED' | 'SKIPPED' }>;

export interface TransitionInput {
  bookingId: string;
  to: BookingStatus;
  /** Scope to a studio; a booking outside it is NOT_FOUND. */
  studioId?: string;
  /**
   * A caller's own, narrower rule. Delivery completes only a session that was
   * confirmed or under way; the webhook confirms only a pending booking. Anything
   * else is SKIPPED: not an error, just not this caller's move to make.
   */
  onlyFrom?: readonly BookingStatus[];
}

/**
 * Moves a booking to `to` if, and only if, the move is legal from the status the
 * booking holds at the moment of writing.
 *
 * The write is conditional on the status that was read, so two requests racing to
 * complete one booking cannot both win: the one that loses finds the booking already
 * COMPLETED and gets UNCHANGED. Callers run side effects only for APPLIED.
 */
export async function transitionBookingStatus(db: Db, input: TransitionInput): Promise<TransitionResult> {
  const { bookingId, to, studioId, onlyFrom } = input;

  // Two passes. If another writer moves the booking between our read and our
  // write, judge the move again against what is actually there now.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await db.booking.findFirst({
      where: { id: bookingId, ...(studioId ? { studio_id: studioId } : {}) },
      select: { status: true },
    });
    if (!current) return { outcome: 'NOT_FOUND', to };

    const from = current.status;
    if (from === to) return { outcome: 'UNCHANGED', from, to };
    if (onlyFrom && !onlyFrom.includes(from)) return { outcome: 'SKIPPED', from, to };
    if (judgeBookingTransition(from, to) === 'ILLEGAL') return { outcome: 'ILLEGAL', from, to };

    const claimed = await db.booking.updateMany({ where: { id: bookingId, status: from }, data: { status: to } });
    if (claimed.count === 1) return { outcome: 'APPLIED', from, to };
  }
  return { outcome: 'CONFLICT', to };
}

function label(status: BookingStatus) {
  return status.toLowerCase().replace('_', ' ');
}

/** For routes: turns a refused move into the error to return, and passes the rest through. */
export function requireTransition(result: TransitionResult): AcceptedTransition {
  switch (result.outcome) {
    case 'NOT_FOUND':
      throw new AppError('Booking not found', 404);
    case 'ILLEGAL':
      throw new AppError(`This booking is ${label(result.from)} and cannot become ${label(result.to)}`, 409);
    case 'CONFLICT':
      throw new AppError('This booking changed while it was being updated. Refresh and try again.', 409);
    default:
      return result;
  }
}
