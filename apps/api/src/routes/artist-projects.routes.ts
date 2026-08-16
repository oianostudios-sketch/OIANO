import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { z } from 'zod';
import { auditSuccessfulMutation } from '../lib/adminAudit';
import { isConsentTransitionAllowed, isRightsTransitionAllowed } from '../lib/resourceAuthorization';

export const artistProjectsRouter = Router();
artistProjectsRouter.use(authenticate, requireRole('ARTIST'));
artistProjectsRouter.use(auditSuccessfulMutation);

artistProjectsRouter.get('/', async (req: any, res, next) => {
  try {
    const artist = await prisma.artist.findUnique({
      where: { user_id: req.userId },
      include: { files: { orderBy: { uploaded_at: 'desc' } } },
    });
    if (!artist) throw new AppError('Artist not found', 404);

    const projects = await prisma.project.findMany({
      where: { artist_id: artist.id },
      include: {
        producer: { select: { id: true, name: true, alias: true, avatar_url: true } },
        participants: { where: { status: 'ACTIVE' }, orderBy: { created_at: 'asc' } },
        credits: { orderBy: { created_at: 'asc' } },
        promotional_consents: { orderBy: { created_at: 'desc' } },
        rights_agreements: { include: { shares: { orderBy: { percentage: 'desc' } } }, orderBy: { created_at: 'desc' } },
        bookings: {
          include: {
            room: { select: { name: true } },
            service: { select: { name: true } },
            engineer: { select: { id: true, name: true, avatar_url: true } },
            deliverables: { select: { id: true, title: true, status: true, current_version: true } },
            messages: {
              include: { sender: { select: { role: true } } },
              orderBy: { created_at: 'desc' },
              take: 3,
            },
          },
          orderBy: { starts_at: 'desc' },
        },
      },
      orderBy: { updated_at: 'desc' },
    });

    const result = projects.map((project) => {
      const title = project.title.toLowerCase();
      const files = artist.files.filter((file) => file.folder?.toLowerCase().includes(title));
      const collaborators = [
        project.producer && { id: project.producer.id, name: project.producer.alias ?? project.producer.name, role: 'Producer', avatar_url: project.producer.avatar_url },
        ...project.participants.map((participant) => ({
          id: participant.id,
          name: participant.display_name,
          role: participant.role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter: string) => letter.toUpperCase()),
          avatar_url: null,
        })),
        ...project.bookings.map((booking) => booking.engineer && ({ id: booking.engineer.id, name: booking.engineer.name, role: 'Engineer', avatar_url: booking.engineer.avatar_url })),
      ].filter(Boolean).filter((person: any, index, all) => all.findIndex((candidate: any) => candidate.id === person.id && candidate.role === person.role) === index);
      const feedback = project.bookings.flatMap((booking) => booking.messages.map((message) => ({
        id: message.id,
        body: message.body,
        created_at: message.created_at,
        source: booking.service?.name ?? 'Studio session',
        sender_role: message.sender.role,
      }))).sort((a, b) => b.created_at.getTime() - a.created_at.getTime()).slice(0, 5);

      return {
        ...project,
        bookings: project.bookings.map(({ messages: _messages, ...booking }) => booking),
        files,
        collaborators,
        feedback,
      };
    });

    res.json(result);
  } catch (error) { next(error); }
});

artistProjectsRouter.get('/:id', async (req: any, res, next) => {
  try {
    const artist = await prisma.artist.findUnique({ where: { user_id: req.userId } });
    if (!artist) throw new AppError('Artist not found', 404);
    const project = await prisma.project.findFirst({ where: { id: req.params.id, artist_id: artist.id }, select: { id: true } });
    if (!project) throw new AppError('Project not found', 404);
    res.redirect(307, `/api/artist-projects`);
  } catch (error) { next(error); }
});

artistProjectsRouter.patch('/:id/promotional-consents/:consentId', async (req: any, res, next) => {
  try {
    const { action } = z.object({ action: z.enum(['APPROVE', 'DECLINE', 'WITHDRAW']) }).parse(req.body);
    const artist = await prisma.artist.findUnique({ where: { user_id: req.userId } });
    if (!artist) throw new AppError('Artist not found', 404);
    const consent = await prisma.promotionalConsent.findFirst({ where: { id: req.params.consentId, project_id: req.params.id, project: { artist_id: artist.id } } });
    if (!consent) throw new AppError('Consent request not found', 404);
    if (!isConsentTransitionAllowed(consent.status, action)) throw new AppError('This consent action is not allowed from its current state', 409);
    const now = new Date();
    const updated = await prisma.promotionalConsent.update({ where: { id: consent.id }, data: { status: action === 'APPROVE' ? 'APPROVED' : action === 'DECLINE' ? 'DECLINED' : 'WITHDRAWN', responded_by: req.userId, responded_at: action === 'WITHDRAW' ? consent.responded_at : now, withdrawn_at: action === 'WITHDRAW' ? now : null } });
    res.json(updated);
  } catch (error) { next(error); }
});

artistProjectsRouter.patch('/:id/rights-agreements/:agreementId', async (req: any, res, next) => {
  try {
    const data = z.object({ action: z.enum(['APPROVE', 'DISPUTE']), note: z.string().trim().max(1500).optional() }).refine(value => value.action !== 'DISPUTE' || Boolean(value.note), { message: 'Explain what should change', path: ['note'] }).parse(req.body);
    const artist = await prisma.artist.findUnique({ where: { user_id: req.userId } });
    if (!artist) throw new AppError('Artist not found', 404);
    const agreement = await prisma.rightsAgreement.findFirst({ where: { id: req.params.agreementId, project_id: req.params.id, project: { artist_id: artist.id } } });
    if (!agreement) throw new AppError('Rights agreement not found', 404);
    if (!isRightsTransitionAllowed(agreement.status, data.action)) throw new AppError('This proposal has already been answered', 409);
    const now = new Date();
    const updated = await prisma.rightsAgreement.update({ where: { id: agreement.id }, data: { status: data.action === 'APPROVE' ? 'APPROVED' : 'DISPUTED', responded_by: req.userId, response_note: data.note, responded_at: now, effective_at: data.action === 'APPROVE' ? now : null }, include: { shares: true } });
    res.json(updated);
  } catch (error) { next(error); }
});
