import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { AppError } from '../lib/errors';
import { z } from 'zod';
import { broadcastToUser } from './notifications.routes';
import { canAccessBookingMessages } from '../lib/resourceAuthorization';

export const messagesRouter = Router({ mergeParams: true });
messagesRouter.use(authenticate);

const SendBody = z.object({ body: z.string().min(1).max(2000) });

type MessageBookingAccess = {
  studio_id: string;
  artist: { user_id: string } | null;
  engineer: { user_id: string | null } | null;
  project: { producer: { user_id: string } | null } | null;
};

async function hasBookingMessageAccess(booking: MessageBookingAccess, userId: string, userRole: string) {
  // Checked against the booking's own studio, not the admin's currently-active
  // one — a STUDIO_ADMIN staffing multiple studios can access messages for
  // any booking at any studio they're a member of.
  const staff = userRole === 'STUDIO_ADMIN'
    ? await prisma.studioStaff.findUnique({ where: { user_id_studio_id: { user_id: userId, studio_id: booking.studio_id } } })
    : null;
  return canAccessBookingMessages({
    artistUserId: booking.artist?.user_id ?? null,
    engineerUserId: booking.engineer?.user_id ?? null,
    bookingStudioId: booking.studio_id,
    actorId: userId,
    actorRole: userRole,
    actorStudioId: staff?.studio_id,
    projectProducerUserId: booking.project?.producer?.user_id ?? null,
  });
}

// GET /api/bookings/:id/messages
messagesRouter.get('/', async (req: any, res: Response, next: NextFunction) => {
  try {
    const userId   = req.userId   as string;
    const userRole = req.userRole as string;

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      select: {
        studio_id: true,
        artist: { select: { user_id: true } },
        engineer: { select: { user_id: true } },
        project: { select: { producer: { select: { user_id: true } } } },
      },
    });
    if (!booking) throw new AppError('Booking not found', 404);

    if (!(await hasBookingMessageAccess(booking, userId, userRole))) {
      throw new AppError('Booking not found', 404);
    }

    const messages = await prisma.bookingMessage.findMany({
      where: { booking_id: req.params.id },
      orderBy: { created_at: 'asc' },
      select: {
        id: true,
        body: true,
        created_at: true,
        sender: {
          select: {
            id: true,
            role: true,
            artist: { select: { name: true, alias: true } },
            producer: { select: { name: true, alias: true } },
            engineer: { select: { name: true } },
          },
        },
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
        project:  { include: { producer: { select: { user_id: true } } } },
      },
    });
    if (!booking) throw new AppError('Booking not found', 404);

    if (!(await hasBookingMessageAccess(booking, userId, userRole))) {
      throw new AppError('Booking not found', 404);
    }

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
        sender: {
          select: {
            id: true,
            role: true,
            artist: { select: { name: true, alias: true } },
            producer: { select: { name: true, alias: true } },
            engineer: { select: { name: true } },
          },
        },
      },
    });

    // Resolve sender name for toast
    const senderName = message.sender.artist?.alias
      ?? message.sender.artist?.name
      ?? message.sender.producer?.alias
      ?? message.sender.producer?.name
      ?? message.sender.engineer?.name
      ?? (message.sender.role === 'STUDIO_ADMIN' ? 'Studio' : message.sender.role);

    // Broadcast to all parties — type must match useSSE handler
    const event = {
      type:       'new_message',
      bookingId:  req.params.id,
      booking_id: req.params.id,
      senderName,
      message,
    };

    // Notify every other party in this thread (never the sender) so
    // whoever sends -- artist, engineer, studio admin, or the linked
    // project's producer -- everyone else with access gets it live.
    if (booking.artist?.user?.id && booking.artist.user.id !== userId) {
      broadcastToUser(booking.artist.user.id, event);
    }
    if (booking.engineer?.user_id && booking.engineer.user_id !== userId) {
      broadcastToUser(booking.engineer.user_id, event);
    }
    if (booking.project?.producer?.user_id && booking.project.producer.user_id !== userId) {
      broadcastToUser(booking.project.producer.user_id, event);
    }

    res.status(201).json(message);
  } catch (err) { next(err); }
});
