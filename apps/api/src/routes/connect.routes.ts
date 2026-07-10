import { Router } from 'express';
import { z } from 'zod';
import { authenticate as requireAuth, requireRole } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { broadcastToUser } from './notifications.routes';

export const connectRouter = Router();

// Helper: get artistId from userId
async function getArtistId(userId: string): Promise<string> {
  const artist = await (prisma as any).artist.findUnique({
    where: { user_id: userId },
    select: { id: true },
  });
  if (!artist) throw new AppError('Artist profile not found', 404);
  return artist.id;
}

// GET /api/connect — list my connections (sent + received) with latest message
connectRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const myArtistId = await getArtistId((req as any).userId!);

    const connections = await (prisma as any).passportConnection.findMany({
      where: {
        OR: [
          { initiator_id: myArtistId },
          { recipient_id: myArtistId },
        ],
      },
      include: {
        initiator: { select: { id: true, name: true, alias: true, avatar_url: true, user_id: true } },
        recipient: { select: { id: true, name: true, alias: true, avatar_url: true, user_id: true } },
        messages: {
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
      orderBy: { created_at: 'desc' },
    });

    res.json(connections);
  } catch (err) {
    next(err);
  }
});

// POST /api/connect — initiate or get connection with another artist
const InitiateSchema = z.object({
  artist_id: z.string().uuid(),
  message: z.string().min(1).max(500).optional(),
});

connectRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const { artist_id: recipientId, message } = InitiateSchema.parse(req.body);
    const myArtistId = await getArtistId((req as any).userId!);

    if (myArtistId === recipientId) {
      throw new AppError('Cannot connect with yourself', 400);
    }

    // Upsert — find existing in either direction
    let connection = await (prisma as any).passportConnection.findFirst({
      where: {
        OR: [
          { initiator_id: myArtistId, recipient_id: recipientId },
          { initiator_id: recipientId, recipient_id: myArtistId },
        ],
      },
    });

    if (!connection) {
      connection = await (prisma as any).passportConnection.create({
        data: {
          initiator_id: myArtistId,
          recipient_id: recipientId,
          status: 'PENDING',
        },
      });
    }

    // If first message provided, create it
    if (message) {
      await (prisma as any).connectMessage.create({
        data: {
          connection_id: connection.id,
          sender_id: myArtistId,
          body: message,
        },
      });

      // Notify recipient
      const sender = await (prisma as any).artist.findUnique({
        where: { id: myArtistId },
        include: { user: { select: { id: true } } },
      });
      const recipientUser = await (prisma as any).artist.findUnique({
        where: { id: recipientId },
        include: { user: { select: { id: true } } },
      });

      if (recipientUser?.user?.id) {
        broadcastToUser(recipientUser.user.id, {
          type: 'new_message',
          context: 'connect',
          connectionId: connection.id,
          senderName: sender?.alias ?? sender?.name ?? 'Artist',
          message: { body: message },
        });
      }
    }

    res.status(201).json(connection);
  } catch (err) {
    next(err);
  }
});

// GET /api/connect/:id — full thread
connectRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const myArtistId = await getArtistId((req as any).userId!);

    const connection = await (prisma as any).passportConnection.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { initiator_id: myArtistId },
          { recipient_id: myArtistId },
        ],
      },
      include: {
        initiator: { select: { id: true, name: true, alias: true, avatar_url: true } },
        recipient: { select: { id: true, name: true, alias: true, avatar_url: true } },
        messages: {
          orderBy: { created_at: 'asc' },
          include: {
            sender: { select: { id: true, name: true, alias: true } },
          },
        },
      },
    });

    if (!connection) throw new AppError('Connection not found', 404);
    res.json(connection);
  } catch (err) {
    next(err);
  }
});

// POST /api/connect/:id/messages — send a message in a thread
const MessageSchema = z.object({ body: z.string().min(1).max(2000) });

connectRouter.post('/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const { body } = MessageSchema.parse(req.body);
    const myArtistId = await getArtistId((req as any).userId!);

    const connection = await (prisma as any).passportConnection.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { initiator_id: myArtistId },
          { recipient_id: myArtistId },
        ],
      },
      include: {
        initiator: { include: { user: { select: { id: true } } } },
        recipient: { include: { user: { select: { id: true } } } },
      },
    });

    if (!connection) throw new AppError('Connection not found', 404);

    const message = await (prisma as any).connectMessage.create({
      data: {
        connection_id: connection.id,
        sender_id: myArtistId,
        body,
      },
      include: {
        sender: { select: { id: true, name: true, alias: true } },
      },
    });

    // Auto-accept on first reply if still PENDING
    if (connection.status === 'PENDING' && myArtistId !== connection.initiator_id) {
      await (prisma as any).passportConnection.update({
        where: { id: connection.id },
        data: { status: 'ACCEPTED' },
      });
    }

    // Notify the other party
    const otherId = myArtistId === connection.initiator_id
      ? connection.recipient?.user?.id
      : connection.initiator?.user?.id;

    if (otherId) {
      broadcastToUser(otherId, {
        type: 'new_message',
        context: 'connect',
        connectionId: connection.id,
        senderName: message.sender.alias ?? message.sender.name,
        message,
      });
    }

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/connect/:id/status — accept / decline
const StatusSchema = z.object({ status: z.enum(['ACCEPTED', 'DECLINED']) });

connectRouter.patch('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const { status } = StatusSchema.parse(req.body);
    const myArtistId = await getArtistId((req as any).userId!);

    const connection = await (prisma as any).passportConnection.findFirst({
      where: { id: req.params.id, recipient_id: myArtistId },
    });

    if (!connection) throw new AppError('Connection not found', 404);

    const updated = await (prisma as any).passportConnection.update({
      where: { id: req.params.id },
      data: { status },
    });

    res.json(updated);
  } catch (
err) {
    next(err);
  }
});
