import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { AppError } from '../lib/errors';
import { broadcastToUsers } from './notifications.routes';

export const projectMessagesRouter = Router({ mergeParams: true });
projectMessagesRouter.use(authenticate);

const SendBody = z.object({ body: z.string().trim().min(1).max(4000) });

async function loadProject(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      artist: { select: { user_id: true } },
      producer: { select: { user_id: true } },
      bookings: { select: { studio_id: true, engineer: { select: { user_id: true } } } },
      participants: { where: { status: 'ACTIVE' }, select: { participant_ref_id: true } },
    },
  });
}

/**
 * Everyone in the conversation through their relationship to the work: its artist
 * and producer, contributors who accepted their invitation and are still ACTIVE
 * (invited, declined, correction-requested and removed are not), engineers on its
 * bookings, and studio admins holding a membership at a studio it was booked at —
 * any of them, as a STUDIO_ADMIN can staff more than one studio.
 *
 * Reading and live delivery both come from this one list. Delivery used to reach
 * only the artist and producer, so an accepted contributor's open conversation
 * never heard a new message.
 */
async function conversationMembers(project: NonNullable<Awaited<ReturnType<typeof loadProject>>>): Promise<Set<string>> {
  const engineerUserIds = project.bookings.map(booking => booking.engineer?.user_id).filter((id): id is string => Boolean(id));
  const studioIds = [...new Set(project.bookings.map(booking => booking.studio_id))];
  const [engineers, admins] = await Promise.all([
    engineerUserIds.length ? prisma.user.findMany({ where: { id: { in: engineerUserIds }, role: 'ENGINEER' }, select: { id: true } }) : [],
    studioIds.length ? prisma.user.findMany({ where: { role: 'STUDIO_ADMIN', studio_staff: { some: { studio_id: { in: studioIds } } } }, select: { id: true } }) : [],
  ]);
  return new Set([
    project.artist?.user_id,
    project.producer.user_id,
    ...project.participants.map(participant => participant.participant_ref_id),
    ...engineers.map(user => user.id),
    ...admins.map(user => user.id),
  ].filter((id): id is string => Boolean(id)));
}

// Platform operators read every conversation but are not members of it, so they
// are let in here and are not sent its messages live.
async function accessibleProject(projectId: string, userId: string, role: string) {
  const project = await loadProject(projectId);
  if (!project) return null;
  const members = await conversationMembers(project);
  if (role !== 'OIANO_ADMIN' && !members.has(userId)) return null;
  return { project, members };
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
    const access = await accessibleProject(req.params.id, req.userId, req.userRole);
    if (!access) throw new AppError('Project not found', 404);
    const messages = await prisma.projectMessage.findMany({ where: { project_id: access.project.id }, orderBy: { created_at: 'asc' }, select: messageSelect });
    res.json(messages);
  } catch (error) { next(error); }
});

projectMessagesRouter.post('/', async (req: any, res: Response, next: NextFunction) => {
  try {
    const { body } = SendBody.parse(req.body);
    const access = await accessibleProject(req.params.id, req.userId, req.userRole);
    if (!access) throw new AppError('Project not found', 404);
    const { project, members } = access;
    const message = await prisma.projectMessage.create({ data: { project_id: project.id, sender_id: req.userId, body }, select: messageSelect });
    members.delete(req.userId);
    broadcastToUsers(members, { type: 'new_project_message', projectId: project.id, senderName: message.sender.artist?.alias ?? message.sender.artist?.name ?? message.sender.producer?.alias ?? message.sender.producer?.name ?? message.sender.engineer?.name ?? 'Project collaborator', message });
    res.status(201).json(message);
  } catch (error) { next(error); }
});
