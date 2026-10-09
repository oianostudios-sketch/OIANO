import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { publishBookingUpdate } from '../../services/liveUpdates';
import { resolveStaffStudio } from '../../middleware/studioScope.middleware';
import { upsertSessionLog } from '../../lib/sessionLog';
import { assertEngineerFree } from '../../lib/engineerSchedule';
import { findRoomClash, isRoomClash } from '../../lib/roomSchedule';
import { evaluateStudioPolicies, policiesAffectedByChanges, type PolicyContract } from '../../lib/studioPolicyEngine';

const RescheduleSchema = z.object({
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  policy_exception_ids: z.array(z.string().uuid()).max(10).optional().default([]),
});

export async function rescheduleBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId as string;
    const data = RescheduleSchema.parse(req.body);
    const newStart = new Date(data.starts_at);
    const newEnd = new Date(data.ends_at);
    if (newStart >= newEnd) throw new AppError('ends_at must be after starts_at', 400);
    if (newStart <= new Date()) throw new AppError('Cannot reschedule to a time in the past', 400);

    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id },
      include: {
        artist: { include: { user: { select: { email: true } } } },
        service: true,
        room: true,
      },
    });
    // Another artist's booking is not found, the same answer as one that does not exist,
    // so a booking id cannot be probed through this route.
    if (!booking || booking.artist?.user_id !== userId) throw new AppError('Booking not found', 404);
    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
      throw new AppError(`Cannot reschedule a ${booking.status} booking`, 409);
    }
    // The price, the payment and its ledger posting were all set for the booked
    // length, and nothing here re-prices, so a reschedule moves the time and keeps
    // the length (owner decision, 2026-09-15).
    if (newEnd.getTime() - newStart.getTime() !== booking.ends_at.getTime() - booking.starts_at.getTime()) {
      throw new AppError('A reschedule keeps the booked length; only the start time can change', 409);
    }

    // Same hard/controlled-boundary check createBooking enforces at creation
    // — without this, a booking made compliant at booking time could be
    // moved to a non-compliant time via reschedule, bypassing the policy
    // engine entirely (it was never consulted on this path before).
    const studio = await prisma.studio.findUnique({ where: { id: booking.studio_id } });
    if (!studio) throw new AppError('Studio not found', 404);

    const now = new Date();
    const activePolicies = await prisma.studioPolicy.findMany({
      where: { studio_id: studio.id, status: 'ACTIVE', effective_from: { lte: now }, OR: [{ effective_until: null }, { effective_until: { gt: now } }] },
      orderBy: { priority: 'asc' },
    });
    const newHours = (newEnd.getTime() - newStart.getTime()) / (1000 * 60 * 60);
    const endHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: studio.timezone, hour: '2-digit', hourCycle: 'h23' }).format(newEnd));
    const schedulingPolicies = policiesAffectedByChanges(activePolicies as unknown as PolicyContract[], ['booking']);
    const policyDecisions = evaluateStudioPolicies(schedulingPolicies, {
      service: { id: booking.service_id, category: booking.service?.category, unit: booking.service?.unit }, room: { id: booking.room_id, capacity: booking.room?.capacity }, artist: { id: booking.artist_id },
    }, {
      booking: { end_hour: endHour, duration_hours: newHours, repeat_weeks: 1 },
    });
    const approvedExceptions = data.policy_exception_ids.length ? await prisma.policyException.findMany({
      where: { id: { in: data.policy_exception_ids }, studio_id: studio.id, target_type: 'ARTIST_BOOKING', target_id: booking.artist_id, status: 'APPROVED', OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
      select: { id: true, policy_id: true },
    }) : [];
    const approvedPolicyIds = new Set(approvedExceptions.map(item => item.policy_id));
    const denied = policyDecisions.filter(decision => decision.result === 'DENIED');
    if (denied.length) throw new AppError(`Reschedule conflicts with a hard studio boundary: ${denied.map(item => item.policy_name).join(', ')}`, 409);
    const missingOverrides = policyDecisions.filter(decision => decision.result === 'OVERRIDE_REQUIRED' && !approvedPolicyIds.has(decision.policy_id));
    if (missingOverrides.length) throw new AppError(`Studio policy exception required: ${missingOverrides.map(item => item.policy_name).join(', ')}`, 409);

    // The new time must be free in the room. It is checked under the booking's and the
    // room's locks, so no booking for the room can be written in between; the room's
    // exclusion constraint still refuses any write that gets past the check.
    // The session's engineer moves with it, so the new time must be free for them too. The
    // engineer is read under the booking's lock, so an assignment cannot slip in between.
    const updated = await prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<Array<{ engineer_id: string | null }>>`
        SELECT engineer_id FROM bookings WHERE id = ${booking.id} FOR UPDATE
      `;
      if (booking.room_id && await findRoomClash(tx, { roomId: booking.room_id, slots: [{ startsAt: newStart, endsAt: newEnd }], exceptBookingId: booking.id })) {
        throw new AppError('That time slot is not available', 409);
      }
      if (current?.engineer_id) await assertEngineerFree(tx, { engineerId: current.engineer_id, startsAt: newStart, endsAt: newEnd, exceptBookingId: booking.id });
      return tx.booking.update({
        where: { id: booking.id },
        data: { starts_at: newStart, ends_at: newEnd },
        include: { room: true, service: true },
      });
    }).catch((error) => {
      throw isRoomClash(error) ? new AppError('That time slot is not available', 409) : error;
    });
    await publishBookingUpdate(booking.id, updated.status);
    res.json(updated);
  } catch (error) {
    next(error);
  }
}

const SessionNotesSchema = z.object({
  notes: z.string().optional(),
  quality_rating: z.number().int().min(1).max(5).optional(),
  tracks_worked: z.array(z.string()).optional(),
});

export async function updateSessionNotes(req: Request, res: Response, next: NextFunction) {
  try {
    const data = SessionNotesSchema.parse(req.body);
    const studio = await resolveStaffStudio((req as any).userId);
    const booking = await prisma.booking.findFirst({ where: { id: req.params.id, studio_id: studio.id } });
    if (!booking) throw new AppError('Booking not found', 404);
    const log = await upsertSessionLog(booking, data);
    res.json(log);
  } catch (error) {
    next(error);
  }
}
