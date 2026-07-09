import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { AppError } from '../lib/errors';
import { z } from 'zod';
import { broadcastToUser } from './notifications.routes';

export const messagesRouter = Router({ mergeParams: true });
messagesRouter.use(authenticate);

const SendBody = z.object({ body: z.string().min(1).max(2000) });

// GET /api/bookings/:id/messages
messagesRouter.get('/', async (req: any, res: Response, next: NextFunction) => {
  try {
    const userId   = req.userId   as string;
    const userRole = req.userRole as string;

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      select: { artist_id: true, engineer_id: true, artist: { select: { user_id: true } } },
    });
    if (!booking) throw new AppError('Booking not found', 404);

    // Access: the artist who owns the booking, any engineer, or any admin
    const isArtist   = userRole === 'ARTIST'       && booking.artist?.user_id === userId;
    const isEngineer = userRole === 'ENGINEER';
    const isAdmin    = userRole === 'STUDIO_ADMIN';
    if (!isArtist && !isEngineer && !isAdmin) throw new AppError('Forbidden', 403);

    const messages = await prisma.bookingMessage.findMany({
      where: { booking_id: req.params.id },
      orderBy: { created_at: 'asc' },
      select: {
        id: true,
        body: true,
        created_at: true,
        sender: { select: { id: true, role: true, artist: { select: { name: true, alias: true } } } },
      },
    });
    res.json(messages);
  } catch (err) { next(err); }
});

// POST /api/bookings/:id/messages
messagesRouter.post('/', async (req: any, res: Response, next: NextFunction) => {
  try {
    const userId   = req.userId   as string;
    const userRole = req.userRole as string;
    const { body } = SendBody.parse(req.body);

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        artist:   { include: { user: true } },
        engineer: true,
      },
    });
    if (!booking) throw new AppError('Booking not found', 404);

    const isArtist   = userRole === 'ARTIST'       && booking.artist?.user_id === userId;
    const isEngineer = userRole === 'ENGINEER';
    const isAdmin    = userRole === 'STUDIO_ADMIN';
    if (!isArtist && !isEngineer && !isAdmin) throw new AppError('Forbidden', 403);

    const message = await prisma.bookingMessage.create({
      data: {
        booking_id: req.params.id,
        sender_id:  userId,
        body,
      },
      select: {
        id: true,
        body: true,
        created_at: true,
        sender: { select: { id: true, role: true, artist: { select: { name: true, alias: true } } } },
      },
    });

    // Resolve sender name for toast
    const senderName = message.sender.artist?.alias
      ?? message.sender.artist?.name
      ?? (message.sender.role === 'STUDIO_ADMIN' ? 'Studio' : 'Engineer');

    // Broadcast to all parties — type must match useSSE handler
    const event = {
      type:       'new_message',
      bookingId:  req.params.id,
      booking_id: req.params.id,
      senderName,
      message,
    };

    // Always notify the artist
    if (booking.artist?.user?.id && booking.artist.user.id !== userId) {
      broadcastToUser(booking.artist.user.id, event);
    }

    // If sender is the artist, notify any engineer staff in the studio
    if (isArtist) {
      // Engineers are studio staff with role ENGINEER — broadcast to all of them
      const engStaff = await prisma.studioStaff.findMany({
        where: { role: 'ENGINEER' },
        select: { user_id: true },
      });
      engStaff.forEach(({ user_id }) => {
        if (user_id !== userId) broadcastToUser(user_id, event);
      });
    }

    res.status(201).json(message);
  } catch (err) { next(err); }
});
