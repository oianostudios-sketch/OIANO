import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { broadcastAll } from '../../routes/notifications.routes';
import { resolveStaffStudio } from '../../middleware/studioScope.middleware';
import { upsertSessionLog } from '../../lib/sessionLog';
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
    if (!booking) throw new AppError('Booking not found', 404);
    if (booking.artist?.user_id !== userId) throw new AppError('Not authorised', 403);
    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
      throw new AppError(`Cannot reschedule a ${booking.status} booking`, 409);
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

    const conflict = await prisma.booking.findFirst({
      where: {
        id: { not: booking.id },
        room_id: booking.room_id ?? undefined,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        OR: [
          { starts_at: { lte: newStart }, ends_at: { gt: newStart } },
          { starts_at: { lt: newEnd }, ends_at: { gte: newEnd } },
        ],
      },
    });
    if (conflict) throw new AppError('That time slot is not available', 409);

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { starts_at: newStart, ends_at: newEnd },
      include: { room: true, service: true },
    });
    broadcastAll({ type: 'booking_updated', bookingId: booking.id, status: updated.status });
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
