// apps/api/src/controllers/bookings.controller.ts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { emitActivityEvent } from '../lib/activityEvents';
import { broadcastToUser, broadcastAll } from '../routes/notifications.routes';
import {
  sendBookingConfirmed,
  sendSessionComplete,
  sendBookingCancelled,
} from '../services/email.service';
import { createNotification } from '../routes/notifications.routes';
import { Prisma } from '@prisma/client';
import { resolveStaffStudio } from '../middleware/studioScope.middleware';
import { syncStudioCircleMembership } from '../services/studio-circle.service';
import { applyWalletDelta } from '../lib/walletLedger';
import { recordBookingPayment } from '../lib/financialLedger';
import { getNextAction, getSessionSummary } from '../intelligence/intelligence.service';
import { buildNextActionContext, buildSessionSummaryContext } from '../intelligence/context/context-builder';
import { evaluateStudioPolicies, type PolicyContract } from '../lib/studioPolicyEngine';

const CreateBookingSchema = z.object({
  // Room/service/engineer ids are plain strings, not enforced-UUID — the
  // seeded rooms, services, and engineers all use human-readable ids like
  // "room-studio-a", "svc-recording", "eng-marcus" (see prisma/seed.ts).
  // Requiring .uuid() here rejected every real booking against seed data.
  room_id: z.string().min(1),
  studio_id: z.string().min(1),
  service_id: z.string().min(1),
  // The studio assigns the session engineer after booking.
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  notes: z.string().optional(),
  repeat_weeks: z.number().int().min(1).max(12).optional().default(1),
  project_id: z.string().uuid().optional(),
  policy_exception_ids: z.array(z.string().uuid()).max(10).optional().default([]),
}).strict().refine(
  (value) => new Date(value.ends_at).getTime() > new Date(value.starts_at).getTime(),
  { message: 'ends_at must be after starts_at', path: ['ends_at'] },
);

const UpdateStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
});
const AssignEngineerSchema = z.object({ engineer_id: z.string().min(1).nullable() });

export async function assignBookingEngineer(req: Request, res: Response, next: NextFunction) {
  try {
    const { engineer_id } = AssignEngineerSchema.parse(req.body);
    const studio = await resolveStaffStudio((req as any).userId);
    const booking = await prisma.booking.findFirst({ where: { id: req.params.id, studio_id: studio.id } });
    if (!booking) throw new AppError('Booking not found', 404);
    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(booking.status)) throw new AppError('Engineer assignment is closed for this booking', 409);
    if (engineer_id) {
      const engineer = await prisma.engineer.findFirst({ where: { id: engineer_id, studio_id: studio.id } });
      if (!engineer) throw new AppError('Engineer not found at this studio', 404);
    }
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { engineer_id },
      include: { artist: true, room: true, engineer: true, service: true, payment: true },
    });
    res.json(updated);
  } catch (error) { next(error); }
}

// GET /api/bookings
export async function getBookings(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const role = (req as any).userRole;

    const take = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '100'))));
    const skip = (Math.max(1, parseInt(String(req.query.page ?? '1'))) - 1) * take;

    const staffStudio = ['STUDIO_ADMIN', 'ENGINEER'].includes(role)
      ? await resolveStaffStudio(userId)
      : null;

    let bookings: unknown[];
    let total: number;

    // Optional date-range filter — used by calendar view
    const fromParam = req.query.from as string | undefined;
    const toParam   = req.query.to   as string | undefined;
    const dateRange = fromParam && toParam
      ? { starts_at: { gte: new Date(fromParam), lte: new Date(toParam) } }
      : {};

    // Shared include shape — every role except ARTIST also gets `artist`
    // (an artist already knows who they are; everyone else needs it).
    const staffInclude = { artist: true, room: true, engineer: true, service: true, payment: true, project: { select: { id: true, title: true, phase: true } } };
    const artistInclude = { room: true, engineer: true, service: true, payment: true, project: { select: { id: true, title: true, phase: true } } };

    if (role === 'STUDIO_ADMIN' || role === 'ENGINEER') {
      const where = { studio_id: staffStudio!.id, ...dateRange };
      [bookings, total] = await Promise.all([
        prisma.booking.findMany({ where, include: staffInclude, orderBy: { starts_at: 'asc' }, take, skip }),
        prisma.booking.count({ where }),
      ]);
    } else if (role === 'PRODUCER') {
      // A Producer has no bookings of their own — only bookings linked to a
      // project they own (see producer.routes.ts's link-booking endpoint).
      const producer = await prisma.producer.findUnique({ where: { user_id: userId } });
      if (!producer) throw new AppError('Producer profile not found', 404);
      const where = { project: { producer_id: producer.id }, ...dateRange };
      [bookings, total] = await Promise.all([
        prisma.booking.findMany({ where, include: staffInclude, orderBy: { starts_at: 'asc' }, take, skip }),
        prisma.booking.count({ where }),
      ]);
    } else if (role === 'OIANO_ADMIN') {
      // Network-wide superuser — no studio filter, same as maintenance.routes.ts.
      const where = { ...dateRange };
      [bookings, total] = await Promise.all([
        prisma.booking.findMany({ where, include: staffInclude, orderBy: { starts_at: 'asc' }, take, skip }),
        prisma.booking.count({ where }),
      ]);
    } else if (role === 'ARTIST') {
      const artist = await prisma.artist.findUnique({ where: { user_id: userId } });
      if (!artist) throw new AppError('Artist not found', 404);
      const where = { artist_id: artist.id, ...dateRange };
      [bookings, total] = await Promise.all([
        prisma.booking.findMany({ where, include: artistInclude, orderBy: { starts_at: 'asc' }, take, skip }),
        prisma.booking.count({ where }),
      ]);
    } else {
      // Every real role is handled explicitly above — this only fires for a
      // JWT with a role string that doesn't match any known role, which
      // shouldn't happen in practice. Fail loudly rather than silently
      // guessing "must be an artist" (the previous behavior, AUD-015).
      throw new AppError('Unsupported role for booking list', 403);
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? '1')));
    res.json({ data: bookings, total, page, limit: take, hasMore: skip + take < total });
  } catch (err) {
    next(err);
  }
}

// GET /api/bookings/:id
export async function getBookingById(req: Request, res: Response, next: NextFunction) {
  try {
    const userId   = (req as any).userId   as string;
    const userRole = (req as any).userRole as string;

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        artist: { include: { user: true } }, studio: true, room: true, engineer: true, service: true, payment: true, session_log: true,
        project: { include: {
          producer: { select: { id: true, user_id: true, name: true, alias: true } },
          participants: {
            where: { status: 'ACTIVE', participant_ref_id: { not: null } },
            select: { id: true, display_name: true, participant_ref_id: true },
          },
        } },
        deliverables: {
          include: { versions: { orderBy: { version_number: 'desc' } }, reviews: { orderBy: { created_at: 'desc' } } },
          orderBy: { created_at: 'desc' },
        },
      },
    });
    if (!booking) throw new AppError('Booking not found', 404);

    // Ownership guard: ARTISTs can only see their own bookings
    if (userRole === 'ARTIST' && booking.artist?.user_id !== userId) {
      throw new AppError('Booking not found', 404); // 404 not 403 — don't reveal existence
    }
    if (['STUDIO_ADMIN', 'ENGINEER'].includes(userRole)) {
      const studio = await resolveStaffStudio(userId);
      if (booking.studio_id !== studio.id) throw new AppError('Booking not found', 404);
    }

    res.json(booking);
  } catch (err) {
    next(err);
  }
}

// GET /api/bookings/:id/next-action — intelligence layer, V1 capability 1.
// Read-only: suggests, never performs. Same ownership/studio-scope guard as
// getBookingById above, deliberately duplicated rather than shared, so this
// endpoint's authorization can never silently drift from the endpoint it
// mirrors just because someone edits one and not the other. If AI is
// disabled or unavailable this returns {enabled:false}/{enabled:true,
// result:null} — never an error — so the frontend has a normal, always-safe
// state to render.
export async function getBookingNextAction(req: Request, res: Response, next: NextFunction) {
  try {
    const userId   = (req as any).userId   as string;
    const userRole = (req as any).userRole as string;

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, studio_id: true, status: true, starts_at: true, ends_at: true,
        artist: { select: { user_id: true } },
        payment: { select: { status: true } },
        session_log: { select: { notes: true, quality_rating: true } },
        deliverables: { select: { status: true } },
        project: {
          select: {
            id: true,
            credits: { select: { status: true } },
            rights_agreements: { select: { status: true } },
          },
        },
      },
    });
    if (!booking) throw new AppError('Booking not found', 404);

    // Ownership guard: ARTISTs can only see their own bookings
    if (userRole === 'ARTIST' && booking.artist?.user_id !== userId) {
      throw new AppError('Booking not found', 404); // 404 not 403 — don't reveal existence
    }
    if (['STUDIO_ADMIN', 'ENGINEER'].includes(userRole)) {
      const studio = await resolveStaffStudio(userId);
      if (booking.studio_id !== studio.id) throw new AppError('Booking not found', 404);
    }

    const context = buildNextActionContext({
      id: booking.id,
      status: booking.status,
      starts_at: booking.starts_at,
      ends_at: booking.ends_at,
      payment_status: booking.payment?.status ?? null,
      has_session_notes: Boolean(booking.session_log?.notes),
      quality_rating: booking.session_log?.quality_rating ?? null,
      deliverable_statuses: booking.deliverables.map((d) => d.status),
      has_project: booking.project !== null,
      credit_statuses: booking.project?.credits.map((c) => c.status) ?? [],
      rights_statuses: booking.project?.rights_agreements.map((r) => r.status) ?? [],
    });

    const result = await getNextAction(context);
    if (!result.ok && result.reason === 'disabled') {
      return res.json({ enabled: false, result: null });
    }
    res.json({ enabled: true, result: result.ok ? result.data : null, reason: result.ok ? undefined : result.reason });
  } catch (err) {
    next(err);
  }
}

// GET /api/bookings/:id/session-summary — intelligence layer, V1 capability 2.
// Same guard as getBookingNextAction, deliberately duplicated for the same
// drift-proofing reason. Passes only structured facts (statuses, counts,
// track titles) into context — never booking/session notes free text, which
// stays out of scope for V1 exactly as the Stage 1 audit specified.
export async function getBookingSessionSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const userId   = (req as any).userId   as string;
    const userRole = (req as any).userRole as string;

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, studio_id: true, status: true, starts_at: true, ends_at: true,
        artist: { select: { user_id: true } },
        service: { select: { name: true } },
        room: { select: { name: true } },
        payment: { select: { status: true } },
        session_log: { select: { quality_rating: true, tracks_worked: true } },
        deliverables: { select: { status: true } },
        project: {
          select: {
            id: true,
            credits: { select: { status: true } },
            rights_agreements: { select: { status: true } },
          },
        },
      },
    });
    if (!booking) throw new AppError('Booking not found', 404);

    if (userRole === 'ARTIST' && booking.artist?.user_id !== userId) {
      throw new AppError('Booking not found', 404);
    }
    if (['STUDIO_ADMIN', 'ENGINEER'].includes(userRole)) {
      const studio = await resolveStaffStudio(userId);
      if (booking.studio_id !== studio.id) throw new AppError('Booking not found', 404);
    }

    const context = buildSessionSummaryContext({
      id: booking.id,
      status: booking.status,
      starts_at: booking.starts_at,
      ends_at: booking.ends_at,
      service_name: booking.service?.name ?? null,
      room_name: booking.room?.name ?? null,
      payment_status: booking.payment?.status ?? null,
      quality_rating: booking.session_log?.quality_rating ?? null,
      tracks_worked: booking.session_log?.tracks_worked ?? [],
      deliverable_statuses: booking.deliverables.map((d) => d.status),
      has_project: booking.project !== null,
      credit_statuses: booking.project?.credits.map((c) => c.status) ?? [],
      rights_statuses: booking.project?.rights_agreements.map((r) => r.status) ?? [],
    });

    const result = await getSessionSummary(context);
    if (!result.ok && result.reason === 'disabled') {
      return res.json({ enabled: false, result: null });
    }
    res.json({ enabled: true, result: result.ok ? result.data : null, reason: result.ok ? undefined : result.reason });
  } catch (err) {
    next(err);
  }
}

// POST /api/bookings
export async function createBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const data = CreateBookingSchema.parse(req.body);

    const artist = await prisma.artist.findUnique({ where: { user_id: userId } });
    if (!artist) throw new AppError('Artist profile not found', 404);

    // Only the authenticated artist may connect a booking to one of their
    // active projects. Never trust a client-supplied project id on its own.
    if (data.project_id) {
      const project = await prisma.project.findFirst({
        where: { id: data.project_id, artist_id: artist.id, is_active: true },
        select: { id: true },
      });
      if (!project) throw new AppError('Active project not found for this artist', 404);
    }

    const studio = await prisma.studio.findUnique({ where: { id: data.studio_id } });
    if (!studio) throw new AppError('Studio not found', 404);

    const service = await prisma.serviceOffering.findFirst({ where: { id: data.service_id, studio_id: studio.id } });
    if (!service) throw new AppError('Service not found', 404);
    const room = await prisma.room.findFirst({ where: { id: data.room_id, studio_id: studio.id } });
    if (!room) throw new AppError('Room not found at selected studio', 404);

    // Calculate price
    const hours =
      (new Date(data.ends_at).getTime() - new Date(data.starts_at).getTime()) / (1000 * 60 * 60);
    const total = Number(service.min_price_usd) * (service.unit === 'hour' ? hours : 1);

    // Evaluate the studio's active operating standards against this booking.
    // Existing studios with no configured policies retain today's behaviour.
    // Controlled departures require a previously approved, identity-bound
    // exception; hard boundaries remain non-overridable.
    const now = new Date();
    const activePolicies = await prisma.studioPolicy.findMany({
      where: { studio_id: studio.id, status: 'ACTIVE', effective_from: { lte: now }, OR: [{ effective_until: null }, { effective_until: { gt: now } }] },
      orderBy: { priority: 'asc' },
    });
    const endHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: studio.timezone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(data.ends_at)));
    const policyDecisions = evaluateStudioPolicies(activePolicies as unknown as PolicyContract[], {
      service: { id: service.id, category: service.category, unit: service.unit }, room: { id: room.id, capacity: room.capacity }, artist: { id: artist.id },
    }, {
      payment: { deposit_percent: 100, timing: 'UPFRONT', method: 'WALLET' },
      pricing: { hourly_rate: service.unit === 'hour' ? Number(service.min_price_usd) : total },
      booking: { end_hour: endHour, duration_hours: hours, repeat_weeks: data.repeat_weeks ?? 1 },
    });
    const approvedExceptions = data.policy_exception_ids.length ? await prisma.policyException.findMany({
      where: { id: { in: data.policy_exception_ids }, studio_id: studio.id, target_type: 'ARTIST_BOOKING', target_id: artist.id, status: 'APPROVED', OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
      select: { id: true, policy_id: true },
    }) : [];
    const approvedPolicyIds = new Set(approvedExceptions.map(item => item.policy_id));
    const denied = policyDecisions.filter(decision => decision.result === 'DENIED');
    if (denied.length) throw new AppError(`Booking conflicts with a hard studio boundary: ${denied.map(item => item.policy_name).join(', ')}`, 409);
    const missingOverrides = policyDecisions.filter(decision => decision.result === 'OVERRIDE_REQUIRED' && !approvedPolicyIds.has(decision.policy_id));
    if (missingOverrides.length) throw new AppError(`Studio policy exception required: ${missingOverrides.map(item => item.policy_name).join(', ')}`, 409);

    const wallet = await prisma.wallet.findUnique({ where: { artist_id: artist.id } });
    if (!wallet || Number(wallet.balance_usd) < total) {
      throw new AppError('Insufficient wallet balance', 402);
    }

    const repeatWeeks = data.repeat_weeks ?? 1;
    const totalCost = total * repeatWeeks;

    // Re-check wallet for full recurring cost
    if (!wallet || Number(wallet.balance_usd) < totalCost) {
      throw new AppError(`Insufficient wallet balance for ${repeatWeeks} week(s)`, 402);
    }

    // Build list of (starts_at, ends_at) for each occurrence
    const durationMs = new Date(data.ends_at).getTime() - new Date(data.starts_at).getTime();
    const occurrences = Array.from({ length: repeatWeeks }, (_, i) => ({
      starts_at: new Date(new Date(data.starts_at).getTime() + i * 7 * 24 * 60 * 60 * 1000),
      ends_at:   new Date(new Date(data.starts_at).getTime() + i * 7 * 24 * 60 * 60 * 1000 + durationMs),
    }));

    // Single query that checks conflicts for ALL occurrences at once
    const recurringConflict = await prisma.booking.findFirst({
      where: {
        room_id: data.room_id,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        OR: occurrences.flatMap((occ) => [
          { starts_at: { lte: occ.starts_at }, ends_at: { gt: occ.starts_at } },
          { starts_at: { lt: occ.ends_at },    ends_at: { gte: occ.ends_at } },
        ]),
      },
      select: { starts_at: true },
    });
    if (recurringConflict) {
      throw new AppError(
        `Time slot not available on ${new Date(recurringConflict.starts_at).toLocaleDateString()}`,
        409,
      );
    }

    // Create all bookings + deduct wallet in a single atomic transaction
    const txLabel = repeatWeeks > 1
      ? `${repeatWeeks} recurring sessions (${service.name})`
      : `Studio session: ${service.name}`;

    const bookings = await prisma.$transaction(async (tx) => {
      await applyWalletDelta(tx, wallet.id, -totalCost, 'debit', txLabel);

      const created = [];
      for (const occ of occurrences) {
        const createdBooking = await tx.booking.create({
          data: {
            studio_id: studio.id,
            artist_id: artist.id,
            project_id: data.project_id ?? undefined,
            room_id: data.room_id,
            engineer_id: undefined,
            service_id: data.service_id,
            starts_at: occ.starts_at,
            ends_at: occ.ends_at,
            total_usd: total,
            notes: data.notes,
            status: 'PENDING',
            payment: {
              create: {
                provider: 'wallet',
                amount_usd: total,
                status: 'PAID',
                paid_at: new Date(),
              },
            },
          },
          include: { room: true, service: true, payment: true },
        });
        await recordBookingPayment(tx, { paymentId: createdBooking.payment!.id, provider: 'wallet', amountUsd: total, platformFeeBps: studio.platform_fee_bps, artistId: artist.id, studioId: studio.id, bookingId: createdBooking.id });
        created.push(createdBooking);
      }

      if (approvedExceptions.length) await tx.policyException.updateMany({
        where: { id: { in: approvedExceptions.map(item => item.id) }, status: 'APPROVED' },
        data: { status: 'APPLIED', applied_at: new Date() },
      });

      return created;
    }, {
      isolationLevel: 'Serializable',
      maxWait: 10_000,
      timeout: 30_000,
    });

    // One session.booked per reserved slot — separate from session.completed
    for (const b of bookings) {
      emitActivityEvent('session.booked', {
        artist_id: artist.id,
        booking_id: b.id,
        room_id: b.room_id,
        starts_at: b.starts_at,
        ends_at: b.ends_at,
      }).catch((e) => console.error('[activity] session.booked emit failed:', e?.message));
    }

    const booking = bookings[0];
    res.status(201).json(
      repeatWeeks > 1
        ? { booking, recurring: true, total_created: bookings.length }
        : booking
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && ['P2004', 'P2034'].includes(err.code)) {
      return next(new AppError('Time slot is no longer available; please choose another slot', 409));
    }
    next(err);
  }
}

// PATCH /api/bookings/:id/status
export async function updateBookingStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = UpdateStatusSchema.parse(req.body);
    const studio = await resolveStaffStudio((req as any).userId);

    // Scope to studio slug — prevents cross-studio mutations
    const existing = await prisma.booking.findFirst({
      where: { id: req.params.id, studio_id: studio.id },
      include: {
        artist: {
          include: { user: { select: { email: true } } },
        },
        service: { select: { name: true } },
        room:    { select: { name: true } },
      },
    });
    if (!existing) throw new AppError('Booking not found', 404);

    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: { status },
    });

    // Auto-create SessionLog on completion
    if (status === 'COMPLETED') {
      await prisma.sessionLog.upsert({
        where: { booking_id: booking.id },
        update: { ended_at: new Date() },
        create: {
          booking_id: booking.id,
          artist_id: booking.artist_id,
          started_at: booking.starts_at,
          ended_at: new Date(),
        },
      });

      emitActivityEvent('session.completed', {
        artist_id: booking.artist_id,
        booking_id: booking.id,
      }).catch((e) => console.error('[activity] session.completed emit failed:', e?.message));

      await syncStudioCircleMembership(booking.studio_id, booking.artist_id);
    }

    if (status === 'CONFIRMED') {
      emitActivityEvent('booking.confirmed', {
        artist_id: booking.artist_id,
        booking_id: booking.id,
      }).catch((e) => console.error('[activity] booking.confirmed emit failed:', e?.message));
    }
    if (status === 'CANCELLED') {
      emitActivityEvent('booking.cancelled', {
        artist_id: booking.artist_id,
        booking_id: booking.id,
      }).catch((e) => console.error('[activity] booking.cancelled emit failed:', e?.message));
    }

    // On COMPLETED — update project's last_session_at if booking is tied to one
    if (status === 'COMPLETED' && (existing as any).project_id) {
      (prisma as any).project.update({
        where: { id: (existing as any).project_id },
        data:  { last_session_at: new Date() },
      }).catch(() => {});
    }

    // Broadcast live update to the artist and to all admin clients
    // broadcastToUser is keyed by user_id (JWT sub), NOT artist_id
    if (existing.artist?.user_id) {
      broadcastToUser(existing.artist.user_id, {
        type: 'booking_updated',
        bookingId: booking.id,
        status,
      });
    }
    broadcastAll({ type: 'booking_updated', bookingId: booking.id, status });

    // Send transactional email (fire-and-forget — don't block response)
    const artistEmail = existing.artist?.user?.email;
    const artistName  = existing.artist?.name ?? 'Artist';
    const service     = existing.service?.name ?? 'Session';
    const room        = existing.room?.name ?? 'Studio';
    const totalUsd    = Number((existing as any).total_usd ?? 0);

    // Persist notification to DB so the inbox shows it even after SSE reconnect
    if (existing.artist?.user_id) {
      const startsLabel = existing.starts_at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const notifMap: Record<string, { title: string; body: string }> = {
        CONFIRMED:   { title: 'Session confirmed',        body: `Your session on ${startsLabel} is confirmed. See you in the studio.` },
        CANCELLED:   { title: 'Session cancelled',        body: `Your session on ${startsLabel} has been cancelled.` },
        COMPLETED:   { title: 'Session complete',         body: `Your session on ${startsLabel} is marked complete. Check your profile.` },
        IN_PROGRESS: { title: 'Session in progress',      body: `Your session is live right now.` },
        NO_SHOW:     { title: 'Marked as no-show',        body: `Your session on ${startsLabel} was marked as no-show. Contact the studio if this is an error.` },
      };
      const notifData = notifMap[status];
      if (notifData) {
        createNotification({
          user_id: existing.artist.user_id,
          type:    `booking_${status.toLowerCase()}`,
          title:   notifData.title,
          body:    notifData.body,
          payload: { booking_id: booking.id },
        }).catch(() => {});
      }
    }

    if (artistEmail) {
      if (status === 'CONFIRMED') {
        sendBookingConfirmed({
          to: artistEmail, artistName, service, room,
          startsAt: existing.starts_at.toISOString(),
          endsAt:   existing.ends_at.toISOString(),
          bookingId: existing.id,
          totalUsd,
        }).catch((e) => console.error('[email] confirmed failed:', e?.message));
      } else if (status === 'COMPLETED') {
        sendSessionComplete({
          to: artistEmail, artistName, service,
          startsAt: existing.starts_at.toISOString(),
          endsAt:   existing.ends_at.toISOString(),
          bookingId: existing.id,
          totalUsd,
        }).catch((e) => console.error('[email] complete failed:', e?.message));
      } else if (status === 'CANCELLED') {
        sendBookingCancelled({
          to: artistEmail, artistName, service,
          startsAt: existing.starts_at.toISOString(),
          bookingId: existing.id,
        }).catch((e) => console.error('[email] cancelled failed:', e?.message));
      }
    }

    res.json(booking);
  } catch (err) {
    next(err);
  }
}

// POST /api/bookings/:id/deliver — engineer marks files as delivered
const DeliverSchema = z.object({
  file_urls: z.array(z.string().url()).min(1, 'At least one file URL is required'),
  notes: z.string().optional(),
});

export async function deliverSessionFiles(req: Request, res: Response, next: NextFunction) {
  try {
    const data = DeliverSchema.parse(req.body);
    const studio = await resolveStaffStudio((req as any).userId);
    const booking = await prisma.booking.findFirst({
      where:   { id: req.params.id, studio_id: studio.id },
      include: { artist: { include: { user: true } }, service: true },
    });
    if (!booking) throw new AppError('Booking not found', 404);

    // Delivery URLs belong to immutable deliverable versions, not the list of
    // track titles worked during a session. Keep those two data domains apart.
    await prisma.sessionLog.upsert({
      where:  { booking_id: booking.id },
      update: { notes: data.notes ?? undefined, ended_at: new Date() },
      create: {
        booking_id:    booking.id,
        artist_id:     booking.artist_id,
        started_at:    booking.starts_at,
        ended_at:      new Date(),
        notes:         data.notes,
      },
    });

    // Every delivery is an immutable version. Re-delivery never overwrites the
    // artist's review history or the files attached to an earlier version.
    const deliverable = await prisma.$transaction(async (tx) => {
      const existing = await tx.deliverable.findFirst({
        where: { booking_id: booking.id },
        orderBy: { created_at: 'asc' },
      });
      if (!existing) {
        return tx.deliverable.create({
          data: {
            booking_id: booking.id,
            title: `${booking.service?.name ?? 'Session'} files`,
            status: 'PENDING_REVIEW',
            current_version: 1,
            review_due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            created_by: (req as any).userId,
            versions: { create: { version_number: 1, file_urls: data.file_urls, notes: data.notes, created_by: (req as any).userId } },
          },
          include: { versions: true },
        });
      }
      const nextVersion = existing.current_version + 1;
      return tx.deliverable.update({
        where: { id: existing.id },
        data: {
          current_version: nextVersion,
          status: 'PENDING_REVIEW',
          reviewed_at: null,
          review_due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          versions: { create: { version_number: nextVersion, file_urls: data.file_urls, notes: data.notes, created_by: (req as any).userId } },
        },
        include: { versions: { orderBy: { version_number: 'desc' } } },
      });
    });

    // Move booking to COMPLETED if still CONFIRMED/IN_PROGRESS
    if (['CONFIRMED','IN_PROGRESS'].includes(booking.status)) {
      await prisma.booking.update({ where: { id: booking.id }, data: { status: 'COMPLETED' } });
    }

    // In-app notification to artist
    if (booking.artist?.user_id) {
      await prisma.notification.create({
        data: {
          user_id: booking.artist.user_id,
          title:   'Your session files are ready',
          body:    `${data.file_urls.length} file${data.file_urls.length > 1 ? 's' : ''} delivered for your ${booking.service?.name ?? 'session'}.`,
          type:    'SESSION_DELIVERED',
        },
      });
      broadcastToUser(booking.artist.user_id, { type: 'session_delivered', bookingId: booking.id });
    }

    // Email delivery notification
    const { sendDeliveryEmail } = await import('../services/email.service');
    const artistEmail = booking.artist?.user?.email;
    const artistName  = booking.artist?.name ?? 'Artist';
    if (artistEmail) {
      sendDeliveryEmail(artistEmail, artistName, booking.id, data.file_urls).catch((e) =>
        console.error('[email] delivery failed:', e?.message),
      );
    }

    res.json({ success: true, files_delivered: data.file_urls.length, deliverable });
  } catch (err) { next(err); }
}

const DeliverableReviewSchema = z.object({
  decision: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
  note: z.string().trim().max(1500).optional(),
}).refine(value => value.decision !== 'CHANGES_REQUESTED' || Boolean(value.note), {
  message: 'Tell the studio what should change', path: ['note'],
});

export async function reviewDeliverable(req: Request, res: Response, next: NextFunction) {
  try {
    const data = DeliverableReviewSchema.parse(req.body);
    const artist = await prisma.artist.findUnique({ where: { user_id: (req as any).userId } });
    if (!artist) throw new AppError('Artist profile not found', 404);
    const deliverable = await prisma.deliverable.findFirst({
      where: { id: req.params.deliverableId, booking: { id: req.params.id, artist_id: artist.id } },
      include: { booking: { include: { studio: { include: { staff: true } } } } },
    });
    if (!deliverable) throw new AppError('Deliverable not found', 404);
    if (deliverable.status === 'APPROVED') throw new AppError('This deliverable is already approved', 409);

    const updated = await prisma.deliverable.update({
      where: { id: deliverable.id },
      data: {
        status: data.decision,
        reviewed_at: new Date(),
        reviews: { create: { version_number: deliverable.current_version, decision: data.decision, note: data.note, reviewed_by: (req as any).userId } },
      },
      include: { versions: { orderBy: { version_number: 'desc' } }, reviews: { orderBy: { created_at: 'desc' } } },
    });

    const staffUserIds = deliverable.booking.studio.staff.map(staff => staff.user_id);
    if (staffUserIds.length) {
      await prisma.notification.createMany({
        data: staffUserIds.map(user_id => ({
          user_id,
          type: data.decision === 'APPROVED' ? 'DELIVERABLE_APPROVED' : 'DELIVERABLE_CHANGES_REQUESTED',
          title: data.decision === 'APPROVED' ? 'Deliverable approved' : 'Artist requested changes',
          body: data.decision === 'APPROVED'
            ? `Version ${deliverable.current_version} of ${deliverable.title} was approved.`
            : `Revision requested for version ${deliverable.current_version} of ${deliverable.title}.`,
          payload: { booking_id: req.params.id, deliverable_id: deliverable.id },
        })),
      });
      staffUserIds.forEach(userId => broadcastToUser(userId, {
        type: 'deliverable_reviewed', bookingId: req.params.id, deliverableId: deliverable.id, decision: data.decision,
      }));
    }
    res.json(updated);
  } catch (err) { next(err); }
}
