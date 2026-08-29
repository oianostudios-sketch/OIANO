import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { AppError } from '../lib/errors';
import { broadcastToUser } from './notifications.routes';

export const projectMessagesRouter = Router({ mergeParams: true });
projectMessagesRouter.use(authenticate);

const SendBody = z.object({ body: z.string().trim().min(1).max(4000) });

async function accessibleProject(projectId: string, userId: string, role: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      artist: { select: { user_id: true } },
      producer: { select: { user_id: true } },
      bookings: { select: { studio_id: true, engineer: { select: { user_id: true } } } },
      participants: { where: { status: 'ACTIVE' }, select: { participant_ref_id: true } },
    },
  });
  if (!project) return null;
  if (role === 'OIANO_ADMIN' || project.artist?.user_id === userId || project.producer.user_id === userId) return project;
  if (project.participants.some(participant => participant.participant_ref_id === userId)) return project;
  if (role === 'ENGINEER' && project.bookings.some(booking => booking.engineer?.user_id === userId)) return project;
  if (role === 'STUDIO_ADMIN') {
    // Checked against every studio this admin is a member of, not just one —
    // a STUDIO_ADMIN can staff more than one studio.
    const memberships = await prisma.studioStaff.findMany({ where: { user_id: userId }, select: { studio_id: true } });
    const studioIds = new Set(memberships.map(m => m.studio_id));
    if (project.bookings.some(booking => studioIds.has(booking.studio_id))) return project;
  }
  return null;
}

const messageSelect = {
  id: true, body: true, kind: true, created_at: true,
  sender: {
    select: {
      id: true, role: true,
      artist: { select: { name: true, alias: true, avatar_url: true } },
      producer: { select: { name: true, alias: true, avatar_url: true } },
      engineer: { select: { name: true, avatar_url: true } },
    },
  },
} as const;

projectMessagesRouter.get('/', async (req: any, res: Response, next: NextFunction) => {
  try {
    const project = await accessibleProject(req.params.id, req.userId, req.userRole);
    if (!project) throw new AppError('Project not found', 404);
    const messages = await prisma.projectMessage.findMany({ where: { project_id: project.id }, orderBy: { created_at: 'asc' }, select: messageSelect });
    res.json(messages);
  } catch (error) { next(error); }
});

projectMessagesRouter.post('/', async (req: any, res: Response, next: NextFunction) => {
  try {
    const { body } = SendBody.parse(req.body);
    const project = await accessibleProject(req.params.id, req.userId, req.userRole);
    if (!project) throw new AppError('Project not found', 404);
    const message = await prisma.projectMessage.create({ data: { project_id: project.id, sender_id: req.userId, body }, select: messageSelect });
    const recipientIds = new Set([project.artist?.user_id, project.producer.user_id].filter(Boolean) as string[]);
    recipientIds.delete(req.userId);
    for (const recipientId of recipientIds) broadcastToUser(recipientId, { type: 'new_project_message', projectId: project.id, senderName: message.sender.artist?.alias ?? message.sender.artist?.name ?? message.sender.producer?.alias ?? message.sender.producer?.name ?? message.sender.engineer?.name ?? 'Project collaborator', message });
    res.status(201).json(message);
  } catch (error) { next(error); }
});
