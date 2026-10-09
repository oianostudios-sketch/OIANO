import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { AppError } from '../lib/errors';
import { resolveStaffStudio } from '../middleware/studioScope.middleware';
import { studioDate, studioDateBounds } from '../lib/studioClock';

export const engineersRouter = Router();

// The rate a studio pays an engineer is the studio's own business: only its staff,
// whose studio comes from their membership, read it. Anyone else names a studio and
// gets the public profile, the same fields /studio/:id publishes. No booking is
// priced from this rate; an artist pays the service's price.
const publicEngineerSelect = {
  id: true, name: true, bio: true, specialties: true, avatar_url: true,
} satisfies Prisma.EngineerSelect;
const staffEngineerSelect = { ...publicEngineerSelect, hourly_rate_usd: true } satisfies Prisma.EngineerSelect;
const engineerSelectFor = (role: string) =>
  role === 'STUDIO_ADMIN' || role === 'ENGINEER' ? staffEngineerSelect : publicEngineerSelect;

// GET /api/engineers — list all engineers for this studio (auth required)
engineersRouter.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = (req as any).userRole as string;
    const requestedStudioId = typeof req.query.studio_id === 'string' ? req.query.studio_id : undefined;
    const studioId = role === 'STUDIO_ADMIN' || role === 'ENGINEER'
      ? (await resolveStaffStudio((req as any).userId)).id
      : requestedStudioId;
    if (!studioId) throw new AppError('studio_id is required', 400);
    const engineers = await prisma.engineer.findMany({
      where: { studio_id: studioId },
      select: engineerSelectFor(role),
      orderBy: { name: 'asc' },
    });
    res.json(engineers);
  } catch (err) {
    next(err);
  }
});

// GET /api/engineers/me — the bookable Engineer record linked to the logged-in
// user, if any. Engineer.user_id was only just added (previously the login
// and the record assigned to bookings/specialties/credits were unlinked) —
// returns null rather than 404 when unset, since not every ENGINEER-role
// login is guaranteed to be linked to a bookable Engineer record.
engineersRouter.get('/me', authenticate, requireRole('ENGINEER'), async (req: any, res: Response, next: NextFunction) => {
  try {
    const engineer = await prisma.engineer.findUnique({
      where: { user_id: req.userId },
      select: {
        id: true,
        name: true,
        bio: true,
        specialties: true,
        avatar_url: true,
        hourly_rate_usd: true,
        credits: true,
      },
    });
    res.json(engineer);
  } catch (err) {
    next(err);
  }
});

// GET /api/engineers/:id — single engineer profile (auth required)
engineersRouter.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Keep the named endpoint reachable even though this legacy parameter
    // route is declared first.
    if (req.params.id === 'runsheet') return next();
    const role = (req as any).userRole as string;
    const requestedStudioId = typeof req.query.studio_id === 'string' ? req.query.studio_id : undefined;
    const studioId = role === 'STUDIO_ADMIN' || role === 'ENGINEER'
      ? (await resolveStaffStudio((req as any).userId)).id
      : requestedStudioId;
    if (!studioId) throw new AppError('studio_id is required', 400);
    const engineer = await prisma.engineer.findFirst({
      where: {
        id: req.params.id,
        studio_id: studioId,
      },
      select: engineerSelectFor(role),
    });
    if (!engineer) throw new AppError('Engineer not found', 404);
    res.json(engineer);
  } catch (err) {
    next(err);
  }
});

// GET /api/engineers/runsheet?date=YYYY-MM-DD — daily schedule for logged-in engineer
const RunsheetQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

engineersRouter.get('/runsheet', authenticate, requireRole('ENGINEER', 'STUDIO_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = RunsheetQuerySchema.parse(req.query);
    const studio = await resolveStaffStudio((req as any).userId);

    // The day, and "today" when no date is named, are the studio's own (C29),
    // not the server's: the server's midnight is not the studio's. A session
    // running across midnight is on the sheet for both days it touches.
    const day = date ?? studioDate(new Date(), studio.timezone);
    const { start: dayStart, end: dayEnd } = studioDateBounds(day, studio.timezone);

    // Engineers see all sessions for the day (no per-engineer filter since Engineer
    // model isn't linked to User in schema; engineer is matched by name at booking time)
    const bookings = await prisma.booking.findMany({
      where: {
        studio_id: studio.id,
        starts_at: { lt: dayEnd },
        ends_at: { gt: dayStart },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      include: {
        artist:   { select: { id: true, name: true, alias: true } },
        room:     { select: { id: true, name: true } },
        engineer: { select: { id: true, name: true } },
        service:  { select: { id: true, name: true } },
        payment:  { select: { status: true } },
      },
      orderBy: { starts_at: 'asc' },
    });

    // Conflict detection
    const conflictIds = new Set<string>();
    for (let i = 0; i < bookings.length; i++) {
      for (let j = i + 1; j < bookings.length; j++) {
        const a = bookings[i], bk = bookings[j];
        if (a.room?.id && a.room.id === bk.room?.id) {
          const aStart = new Date(a.starts_at).getTime();
          const aEnd   = new Date(a.ends_at).getTime();
          const bStart = new Date(bk.starts_at).getTime();
          const bEnd   = new Date(bk.ends_at).getTime();
          if (aStart < bEnd && aEnd > bStart) {
            conflictIds.add(a.id);
            conflictIds.add(bk.id);
          }
        }
      }
    }

    const mapped = bookings.map((b) => {
      const callTime = new Date(b.starts_at);
      callTime.setMinutes(callTime.getMinutes() - 15);
      return {
        id: b.id,
        starts_at: b.starts_at,
        ends_at: b.ends_at,
        call_time: callTime.toISOString(),
        artist_name: b.artist.alias ?? b.artist.name,
        artist_id: b.artist.id,
        room: b.room?.name ?? '—',
        room_type: '',  // room_type not in schema
        room_id: b.room?.id ?? null,
        engineer: b.engineer?.name ?? '—',
        engineer_id: b.engineer?.id ?? null,
        service: b.service?.name ?? '—',
        status: b.status,
        payment_status: b.payment?.status ?? 'UNPAID',
        total_usd: Number(b.total_usd ?? 0),
        notes: b.notes ?? '',
        conflict: conflictIds.has(b.id),
      };
    });

    res.json({
      date: day,
      timezone: studio.timezone,
      studio_name: studio.name,
      generated_at: new Date().toISOString(),
      revenue: { expected: 0, paid: 0, outstanding: 0 }, // not shown in engineer view
      bookings: mapped,
    });
  } catch (err) { next(err); }
});
