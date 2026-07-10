// apps/api/src/controllers/bookings.controller.ts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { DEFAULT_STUDIO_SLUG } from '@oiano/shared';
import { emitActivityEvent } from '../lib/activityEvents';
import { broadcastToUser, broadcastAll } from '../routes/notifications.routes';
import {
  sendBookingConfirmed,
  sendSessionComplete,
  sendBookingCancelled,
} from '../services/email.service';
import { createNotification } from '../routes/notifications.routes';

const CreateBookingSchema = z.object({
  // Room/service/engineer ids are plain strings, not enforced-UUID — the
  // seeded rooms, services, and engineers all use human-readable ids like
  // "room-studio-a", "svc-recording", "eng-marcus" (see prisma/seed.ts).
  // Requiring .uuid() here rejected every real booking against seed data.
  room_id: z.string().min(1),
  service_id: z.string().min(1),
  engineer_id: z.string().min(1).optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  notes: z.string().optional(),
  repeat_weeks: z.number().int().min(1).max(12).optional().default(1),
  project_id: z.string().uuid().optional(),
});

const UpdateStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
});

// GET /api/bookings
export async function getBookings(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const role = (req as any).userRole;

    const take = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '100'))));
    const skip = (Math.max(1, parseInt(String(req.query.page ?? '1'))) - 1) * take;

    const studio = await prisma.studio.findUnique({ where: { slug: DEFAULT_STUDIO_SLUG } });
    if (!studio) throw new AppError('Studio not found', 404);

    let bookings: unknown[];
    let total: number;

    // Optional date-range filter — used by calendar view
    const fromParam = req.query.from as string | undefined;
    const toParam   = req.query.to   as string | undefined;
    const dateRange = fromParam && toParam
      ? { starts_at: { gte: new Date(fromParam), lte: new Date(toParam) } }
      : {};

    if (role === 'STUDIO_ADMIN') {
      const where = { studio_id: studio.id, ...dateRange };
      [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          include: { artist: true, room: true, engineer: true, service: true, payment: true },
          orderBy: { starts_at: 'asc' },
          take,
          skip,
        }),
        prisma.booking.count({ where }),
      ]);
    } else if (role === 'ENGINEER') {
      const where = { studio_id: studio.id, ...dateRange };
      [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          include: { artist: true, room: true, engineer: true, service: true, payment: true },
          orderBy: { starts_at: 'asc' },
          take,
          skip,
        }),
        prisma.booking.count({ where }),
      ]);
    } else {
      const artist = await prisma.artist.findUnique({ where: { user_id: userId } });
      if (!artist) throw new AppError('Artist not found', 404);
      const where = { artist_id: artist.id, ...dateRange };
      [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          include: { room: true, engineer: true, service: true, payment: true },
          orderBy: { starts_at: 'asc' },
          take,
          skip,
        }),
        prisma.booking.count({ where }),
      ]);
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
      include: { artist: { include: { user: true } }, room: true, engineer: true, service: true, payment: true, session_log: true },
    });
    if (!booking) throw new AppError('Booking not found', 404);

    // Ownership guard: ARTISTs can only see their own bookings
    if (userRole === 'ARTIST' && booking.artist?.user_id !== userId) {
      throw new AppError('Booking not found', 404); // 404 not 403 — don't reveal existence
    }

    res.json(booking);
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

    const studio = await prisma.studio.findUnique({ where: { slug: DEFAULT_STUDIO_SLUG } });
    if (!studio) throw new AppError('Studio not found', 404);

    const service = await prisma.serviceOffering.findUnique({ where: { id: data.service_id } });
    if (!service) throw new AppError('Service not found', 404);

    // Calculate price
    const hours =
      (new Date(data.ends_at).getTime() - new Date(data.starts_at).getTime()) / (1000 * 60 * 60);
    const total = Number(service.min_price_usd) * (service.unit === 'hour' ? hours : 1);

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
    const bookingCreates = occurrences.map((occ) =>
      prisma.booking.create({
        data: {
          studio_id:   studio.id,
          artist_id:   artist.id,
          project_id:  data.project_id ?? undefined,
          room_id:     data.room_id,
          engineer_id: data.engineer_id,
          service_id:  data.service_id,
          starts_at:   occ.starts_at,
          ends_at:     occ.ends_at,
          total_usd:   total,
          notes:       data.notes,
          status:      'PENDING',
          payment: {
            create: {
              provider:   'stripe',
              amount_usd: total,
              status:     'UNPAID',
            },
          },
        },
        include: { room: true, service: true, payment: true },
      })
    );

    const walletDeduct = prisma.wallet.update({
      where: { id: wallet.id },
      data:  { balance_usd: { decrement: totalCost } },
    });

    const txLabel = repeatWeeks > 1
      ? `${repeatWeeks} recurring sessions (${service.name})`
      : `Studio session: ${service.name}`;

    const walletTx = prisma.walletTransaction.create({
      data: {
        wallet_id:   wallet.id,
        amount_usd:  -totalCost,
        type:        'debit',
        description: txLabel,
      },
    });

    const results = await prisma.$transaction([...bookingCreates, walletDeduct, walletTx]);
    // First N results are bookings; last two are the wallet update and wallet tx
    const bookings = results.slice(0, occurrences.length) as Awaited<ReturnType<typeof prisma.booking.create>>[];

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
    next(err);
  }
}

// PATCH /api/bookings/:id/status
export async function updateBookingStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = UpdateStatusSchema.parse(req.body);

    // Scope to studio slug — prevents cross-studio mutations
    const existing = await prisma.booking.findFirst({
      where: { id: req.params.id, studio: { slug: DEFAULT_STUDIO_SLUG } },
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
    const booking = await prisma.booking.findFirst({
      where:   { id: req.params.id, studio: { slug: DEFAULT_STUDIO_SLUG } },
      include: { artist: { include: { user: true } }, service: true },
    });
    if (!booking) throw new AppError('Booking not found', 404);

    // Upsert session log with delivery info
    await prisma.sessionLog.upsert({
      where:  { booking_id: booking.id },
      update: { tracks_worked: data.file_urls, notes: data.notes ?? undefined, ended_at: new Date() },
      create: {
        booking_id:    booking.id,
        artist_id:     booking.artist_id,
        started_at:    booking.starts_at,
        ended_at:      new Date(),
        tracks_worked: data.file_urls,
        notes:         data.notes,
      },
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

    res.json({ success: true, files_delivered: data.file_urls.length });
  } catch (err) { next(err); }
}

// PATCH /api/bookings/:id/reschedule — artist moves their booking to a new time
const RescheduleSchema = z.object({
  starts_at: z.string().datetime(),
  ends_at:   z.string().datetime(),
});

export async function rescheduleBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId as string;
    const data   = RescheduleSchema.parse(req.body);

    const newStart = new Date(data.starts_at);
    const newEnd   = new Date(data.ends_at);

    if (newStart >= newEnd) throw new AppError('ends_at must be after starts_at', 400);
    if (newStart <= new Date()) throw new AppError('Cannot reschedule to a time in the past', 400);

    // Fetch booking — confirm ownership
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, studio: { slug: DEFAULT_STUDIO_SLUG } },
      include: { artist: { include: { user: { select: { email: true } } } } },
    });
    if (!booking) throw new AppError('Booking not found', 404);

    // Only the booking owner can reschedule
    if (booking.artist?.user_id !== userId) throw new AppError('Not authorised', 403);

    // Only PENDING or CONFIRMED bookings can be rescheduled
    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
      throw new AppError(`Cannot reschedule a ${booking.status} booking`, 409);
    }

    // Conflict check — exclude this booking's own slot
    const conflict = await prisma.booking.findFirst({
      where: {
        id:      { not: booking.id },
        room_id: booking.room_id ?? undefined,
        status:  { notIn: ['CANCELLED', 'NO_SHOW'] },
        OR: [
          { starts_at: { lte: newStart }, ends_at: { gt: newStart } },
          { starts_at: { lt: newEnd },   ends_at: { gte: newEnd } },
        ],
      },
    });
    if (conflict) throw new AppError('That time slot is not available', 409);

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data:  { starts_at: newStart, ends_at: newEnd },
      include: { room: true, service: true },
    });

    // Broadcast so admin calendar updates live
    broadcastAll({ type: 'booking_updated', bookingId: booking.id, status: updated.status });

    res.json(updated);
  } catch (err) { next(err); }
}

// PATCH /api/bookings/:id/session-notes — engineer/admin adds session notes
const SessionNotesSchema = z.object({
  notes: z.string().optional(),
  quality_rating: z.number().int().min(1).max(5).optional(),
  tracks_worked: z.array(z.string()).optional(),
});

export async function updateSessionNotes(req: Request, res: Response, next: NextFunction) {
  try {
    const data = SessionNotesSchema.parse(req.body);
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, studio: { slug: DEFAULT_STUDIO_SLUG } },
    });
    if (!booking) throw new AppError('Booking not found', 404);

    const log = await prisma.sessionLog.upsert({
      where: { booking_id: booking.id },
      update: { ...data },
      create: {
        booking_id: booking.id,
        artist_id: booking.artist_id,
         started_at: booking.starts_at,
        ...data,
      },
    });
    res.json(log);
  } catch (err) {
    next(err);
  }
}
