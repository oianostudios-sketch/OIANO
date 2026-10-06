// apps/api/src/routes/availability.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { studioDateBounds } from '../lib/studioClock';

const AvailabilityQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  // Room ids are plain strings, not enforced-UUID — seeded rooms use
  // human-readable ids like "room-studio-a" (see prisma/seed.ts).
  room_id: z.string().min(1).optional(),
  studio_id: z.string().min(1),
});

export const availabilityRouter = Router();

// GET /api/availability?date=YYYY-MM-DD&studio_id=<id>[&room_id=<id>]
availabilityRouter.get('/', async (req, res, next) => {
  try {
    const { date, room_id, studio_id } = AvailabilityQuery.parse(req.query);
    const roomFilter = room_id ? { room_id } : {};

    const studio = await prisma.studio.findUnique({ where: { id: studio_id } });
    if (!studio) throw new AppError('Studio not found', 404);
    if (room_id) {
      const room = await prisma.room.findFirst({ where: { id: room_id, studio_id: studio.id } });
      if (!room) throw new AppError('Room does not belong to this studio', 400);
    }

    // The date is a day at the studio, in the studio's own zone (C29). It used
    // to be the UTC day, which for a studio far from UTC is mostly another day,
    // and it counted only sessions starting that day, so one carried over from
    // the night before was offered again. A session belongs to the day when it
    // overlaps it. This reads bookings only: AvailabilitySlot (blackouts and
    // opening exceptions) has no reader or writer yet; that is migration step 6.
    const { start: dayStart, end: dayEnd } = studioDateBounds(date, studio.timezone);

    const bookings = await prisma.booking.findMany({
      where: {
        studio_id: studio.id,
        ...roomFilter,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        starts_at: { lt: dayEnd },
        ends_at: { gt: dayStart },
      },
      select: { starts_at: true, ends_at: true, room_id: true, engineer_id: true },
      orderBy: { starts_at: 'asc' },
    });

    res.json({ date, timezone: studio.timezone, bookings });
  } catch (err) {
    next(err);
  }
});
