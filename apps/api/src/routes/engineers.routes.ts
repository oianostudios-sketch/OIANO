import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { AppError } from '../lib/errors';
import { resolveStaffStudio } from '../middleware/studioScope.middleware';

export const engineersRouter = Router();

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
      select: {
        id: true,
        name: true,
        bio: true,
        specialties: true,
        avatar_url: true,
        hourly_rate_usd: true,
      },
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
      select: {
        id: true,
        name: true,
        bio: true,
        specialties: true,
        avatar_url: true,
        hourly_rate_usd: true,
      },
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
    const target = date ? new Date(date) : new Date();
    const dayStart = new Date(target);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(target);
    dayEnd.setHours(23, 59, 59, 999);

    const studio = await resolveStaffStudio((req as any).userId);

    // Engineers see all sessions for the day (no per-engineer filter since Engineer
    // model isn't linked to User in schema; engineer is matched by name at booking time)
    const bookings = await prisma.booking.findMany({
      where: {
        studio_id: studio.id,
        starts_at: { gte: dayStart, lte: dayEnd },
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
      date: dayStart.toISOString().split('T')[0],
      studio_name: studio.name,
      generated_at: new Date().toISOString(),
      revenue: { expected: 0, paid: 0, outstanding: 0 }, // not shown in engineer view
      bookings: mapped,
    });
  } catch (err) { next(err); }
});
