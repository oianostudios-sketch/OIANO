import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { AppError } from '../lib/errors';
import { z } from 'zod';

export const artistReviewRouter = Router({ mergeParams: true });
artistReviewRouter.use(authenticate);

const ReviewBody = z.object({
  artist_rating:      z.number().int().min(1).max(5),
  artist_testimonial: z.string().max(500).optional(),
});

// PATCH /api/bookings/:id/artist-review  (ARTIST only, session must be COMPLETED)
artistReviewRouter.patch('/', async (req: any, res: Response, next: NextFunction) => {
  try {
    const { artist_rating, artist_testimonial } = ReviewBody.parse(req.body);
    if (req.user.role !== 'ARTIST') throw new AppError('Only artists can submit reviews', 403);

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      select: { artist_id: true, status: true, engineer_id: true },
    });
    if (!booking) throw new AppError('Booking not found', 404);
    if (req.user.artistId !== booking.artist_id) throw new AppError('Forbidden', 403);
    if (booking.status !== 'COMPLETED') throw new AppError('Can only review a completed session', 400);
    if (!booking.engineer_id) throw new AppError('No engineer on this booking', 400);

    const log = await prisma.sessionLog.upsert({
      where:  { booking_id: req.params.id },
      create: {
        booking_id:        req.params.id,
        artist_id:         booking.artist_id,
        artist_rating,
        artist_testimonial: artist_testimonial ?? null,
        tracks_worked: [],
      },
      update: {
        artist_rating,
        artist_testimonial: artist_testimonial ?? null,
      },
      select: { artist_rating: true, artist_testimonial: true },
    });

    res.json(log);
  } catch (err) { next(err); }
});
