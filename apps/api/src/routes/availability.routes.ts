// apps/api/src/routes/availability.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';

const AvailabilityQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  // Room ids are plain strings, not enforced-UUID — seeded rooms use
  // human-readable ids like "room-studio-a" (see prisma/seed.ts).
  room_id: z.string().min(1).optional(),
  studio_id: z.string().min(1),
});

export const availabilityRouter = Router();

// GET /api/availability?date=YYYY-MM-DD&room_id=<uuid>
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

    // Use explicit UTC midnight so the window is timezone-independent.
    // The studio timezone (studio.timezone) can be used for display on the
    // frontend; the DB stores all datetimes as UTC.
    const dayStart = new Date(`${date}T00:00:00Z`);
    const dayEnd   = new Date(`${date}T23:59:59Z`);

    const bookings = await prisma.booking.findMany({
      where: {
        studio_id: studio.id,
        ...roomFilter,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        starts_at: { gte: dayStart, lte: dayEnd },
      },
      select: { starts_at: true, ends_at: true, room_id: true, engineer_id: true },
    });

    res.json({ date, bookings });
  } catch (err) {
    next(err);
  }
});
