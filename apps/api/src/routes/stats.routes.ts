import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { AppError } from '../lib/errors';
import { studioDate } from '../lib/studioClock';

export const statsRouter = Router();
statsRouter.use(authenticate);

// GET /api/passport/stats  (ARTIST only)
statsRouter.get('/', async (req: any, res: Response, next: NextFunction) => {
  try {
    const userId: string = req.userId;
    const userRole: string = req.userRole;

    if (userRole !== 'ARTIST') {
      throw new AppError('Artist account required', 403);
    }

    const artistRecord = await prisma.artist.findUnique({ where: { user_id: userId } });
    if (!artistRecord) throw new AppError('Artist profile not found', 404);

    const bookings = await prisma.booking.findMany({
      where: {
        artist_id: artistRecord.id,
        status:    { in: ['CONFIRMED', 'COMPLETED', 'IN_PROGRESS'] },
      },
      select: {
        id:         true,
        starts_at:  true,
        ends_at:    true,
        status:     true,
        room:       { select: { name: true } },
        studio:     { select: { timezone: true } },
        engineer:   { select: { name: true } },
        session_log: { select: { quality_rating: true } },
      },
      orderBy: { starts_at: 'desc' },
    });

    // A session's year and month are its studio's, not the server's: an Auckland
    // session on the morning of 1 January belongs to January there.
    const now        = new Date();
    const studioYearMonth = (b: (typeof bookings)[number]) => studioDate(b.starts_at, b.studio.timezone).slice(0, 7);
    const completed  = bookings.filter((b) => b.status === 'COMPLETED');
    const thisYear   = bookings.filter((b) => studioYearMonth(b).slice(0, 4) === studioDate(now, b.studio.timezone).slice(0, 4));

    // Total hours
    const totalHours = completed.reduce((sum, b) => {
      const hrs = (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 3_600_000;
      return sum + hrs;
    }, 0);

    const thisYearHours = thisYear
      .filter((b) => b.status === 'COMPLETED')
      .reduce((sum, b) => {
        const hrs = (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 3_600_000;
        return sum + hrs;
      }, 0);

    // Favourite room
    const roomCount: Record<string, number> = {};
    for (const b of completed) {
      const name = b.room?.name ?? 'Unknown';
      roomCount[name] = (roomCount[name] ?? 0) + 1;
    }
    const favRoom = Object.entries(roomCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Favourite engineer
    const engCount: Record<string, number> = {};
    for (const b of completed) {
      if (b.engineer?.name) engCount[b.engineer.name] = (engCount[b.engineer.name] ?? 0) + 1;
    }
    const favEngineer = Object.entries(engCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Avg quality rating (from engineer logs)
    const rated  = completed.filter((b) => b.session_log?.quality_rating);
    const avgRating = rated.length
      ? rated.reduce((s, b) => s + (b.session_log!.quality_rating ?? 0), 0) / rated.length
      : null;

    // Monthly breakdown this year
    const monthly: Record<number, { sessions: number; hours: number }> = {};
    for (let m = 0; m < 12; m++) monthly[m] = { sessions: 0, hours: 0 };
    for (const b of thisYear.filter((b) => b.status === 'COMPLETED')) {
      const m   = Number(studioYearMonth(b).slice(5, 7)) - 1;
      const hrs = (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 3_600_000;
      monthly[m].sessions += 1;
      monthly[m].hours    += hrs;
    }

    res.json({
      total_sessions:    completed.length,
      total_hours:       Math.round(totalHours * 10) / 10,
      this_year_sessions: thisYear.length,
      this_year_hours:   Math.round(thisYearHours * 10) / 10,
      fav_room:          favRoom,
      fav_engineer:      favEngineer,
      avg_session_rating: avgRating ? Math.round(avgRating * 10) / 10 : null,
      monthly:           Object.entries(monthly).map(([month, data]) => ({
        month: Number(month),
        ...data,
        hours: Math.round(data.hours * 10) / 10,
      })),
    });
  } catch (err) { next(err); }
});
