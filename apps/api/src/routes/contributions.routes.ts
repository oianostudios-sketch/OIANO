import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { AppError } from '../lib/errors';
import { nextContributionStatus, participantBelongsToUser } from '../lib/contributionInvitation';
import { createNotification } from './notifications.routes';
import { respondToNamedRightsShare } from '../lib/rightsDecision';

export const contributionsRouter = Router();
contributionsRouter.use(authenticate);

contributionsRouter.get('/inbox', async (req: any, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, email: true } });
    if (!user) throw new AppError('Account not found', 404);
    const invitations = await prisma.projectParticipant.findMany({
      where: {
        OR: [{ participant_ref_id: user.id }, { email: { equals: user.email, mode: 'insensitive' } }],
        status: { not: 'REMOVED' },
      },
      include: {
        project: {
          select: {
            id: true, title: true, phase: true, is_active: true, updated_at: true,
            producer: { select: { name: true, alias: true, user_id: true } },
            artist: { select: { name: true, alias: true } },
            bookings: { select: { id: true, starts_at: true, studio: { select: { name: true } } }, orderBy: { starts_at: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { updated_at: 'desc' },
    });
    const credits = invitations.length ? await prisma.projectCredit.findMany({
      where: { participant_id: { in: invitations.map(invitation => invitation.id) } },
      orderBy: { created_at: 'desc' },
    }) : [];
    const creditsByParticipant = new Map<string, typeof credits>();
    for (const credit of credits) {
      const items = creditsByParticipant.get(credit.participant_id!) ?? [];
      items.push(credit);
      creditsByParticipant.set(credit.participant_id!, items);
    }
    res.json(invitations.map(invitation => ({ ...invitation, credits: creditsByParticipant.get(invitation.id) ?? [] })));
  } catch (error) { next(error); }
});

contributionsRouter.patch('/credits/:creditId/respond', async (req: any, res, next) => {
  try {
    const { decision } = z.object({ decision: z.enum(['CONFIRM', 'DISPUTE']) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, email: true } });
    if (!user) throw new AppError('Account not found', 404);
    const credit = await prisma.projectCredit.findUnique({
      where: { id: req.params.creditId },
      include: {
        project: { select: { id: true, title: true, producer: { select: { user_id: true } } } },
      },
    });
    if (!credit?.participant_id) throw new AppError('Contribution credit not found', 404);
    const participant = await prisma.projectParticipant.findUnique({ where: { id: credit.participant_id } });
    if (!participant || participant.status !== 'ACTIVE' || !participantBelongsToUser(participant, user)) {
      throw new AppError('Contribution credit not found', 404);
    }
    if (credit.status !== 'DRAFT') throw new AppError('This credit has already been answered', 409);

    // Guard the write on the status we just read, not just the id — a plain
    // update() here would let two concurrent requests both pass the check
    // above and both apply, double-processing (and double-notifying) a
    // credit that should only be answerable once.
    const status = decision === 'CONFIRM' ? 'CONFIRMED' : 'DISPUTED';
    const claimed = await prisma.projectCredit.updateMany({
      where: { id: credit.id, status: 'DRAFT' },
      data: { status, is_public: decision === 'CONFIRM' },
    });
    if (claimed.count !== 1) throw new AppError('This credit has already been answered', 409);
    const updated = await prisma.projectCredit.findUniqueOrThrow({ where: { id: credit.id } });
    await createNotification({
      user_id: credit.project.producer.user_id,
      type: 'CREDIT_RESPONSE', category: 'PROJECT',
      title: `Project credit ${status.toLowerCase()}`,
      body: `${credit.credited_name} ${status.toLowerCase()} their ${credit.role.toLowerCase().replace(/_/g, ' ')} credit for ${credit.project.title}.`,
      payload: { project_id: credit.project.id, credit_id: credit.id, status },
      action_url: `/producer/projects/${credit.project.id}`,
    });
    res.json(updated);
  } catch (error) { next(error); }
});

contributionsRouter.get('/:id/workspace', async (req: any, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, email: true } });
    if (!user) throw new AppError('Account not found', 404);
    const participant = await prisma.projectParticipant.findUnique({
      where: { id: req.params.id },
      include: { project: { include: {
        producer: { select: { name: true, alias: true, avatar_url: true } },
        artist: { select: { name: true, alias: true, avatar_url: true } },
        participants: { where: { status: 'ACTIVE' }, select: { id: true, display_name: true, role: true, participant_ref_id: true } },
        bookings: { orderBy: { starts_at: 'desc' }, select: {
          id: true, status: true, starts_at: true, ends_at: true,
          studio: { select: { name: true } }, room: { select: { name: true } }, service: { select: { name: true } },
          deliverables: { select: { id: true, title: true, status: true, current_version: true, review_due_at: true, versions: { select: { id: true, version_number: true, created_at: true }, orderBy: { version_number: 'desc' } }, reviews: { select: { id: true, version_number: true, decision: true, note: true, created_at: true }, orderBy: { created_at: 'desc' } } } },
        } },
        credits: { orderBy: { created_at: 'asc' } },
        rights_agreements: { include: { shares: { orderBy: { percentage: 'desc' } }, decisions: { orderBy: { created_at: 'asc' } } }, orderBy: { created_at: 'desc' } },
      } } },
    });
    if (!participant || participant.status !== 'ACTIVE' || !participantBelongsToUser(participant, user)) throw new AppError('Contribution workspace not found', 404);
    res.json(participant);
  } catch (error) { next(error); }
});

contributionsRouter.patch('/rights/:agreementId/respond', async (req: any, res, next) => {
  try {
    const data = z.object({ action: z.enum(['APPROVE', 'DISPUTE']), note: z.string().trim().max(1500).optional() }).parse(req.body);
    const agreement = await prisma.rightsAgreement.findUnique({ where: { id: req.params.agreementId }, select: { id: true, project_id: true } });
    if (!agreement) throw new AppError('Rights agreement not found', 404);
    const membership = await prisma.projectParticipant.findFirst({ where: { project_id: agreement.project_id, participant_ref_id: req.userId, status: 'ACTIVE' }, select: { id: true } });
    if (!membership) throw new AppError('Rights agreement not found', 404);
    res.json(await respondToNamedRightsShare({ agreementId: agreement.id, userId: req.userId, action: data.action, note: data.note, requestId: req.requestId }));
  } catch (error) { next(error); }
});

contributionsRouter.patch('/:id/respond', async (req: any, res, next) => {
  try {
    const data = z.object({
      decision: z.enum(['ACCEPT', 'DECLINE', 'REQUEST_CORRECTION']),
      note: z.string().trim().max(500).optional(),
    }).parse(req.body);
    if (data.decision === 'REQUEST_CORRECTION' && !data.note) throw new AppError('Tell the project lead what needs correcting', 400);

    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, email: true } });
    if (!user) throw new AppError('Account not found', 404);
    const participant = await prisma.projectParticipant.findUnique({
      where: { id: req.params.id },
      include: { project: { include: { producer: { select: { user_id: true, name: true, alias: true } } } } },
    });
    if (!participant || !participantBelongsToUser(participant, user)) throw new AppError('Contribution invitation not found', 404);
    const status = nextContributionStatus(participant.status, data.decision);
    if (!status) throw new AppError('This invitation has already been answered', 409);

    // Guard the write on the status we just read — the transaction below
    // already makes the update+message pair atomic, but without this guard
    // two concurrent requests can both pass the check above and both apply,
    // double-processing an invitation that should only be answerable once.
    const updated = await prisma.$transaction(async tx => {
      const claimed = await tx.projectParticipant.updateMany({
        where: { id: participant.id, status: participant.status },
        data: { status, participant_ref_id: user.id, participant_type: 'OIANO_USER' },
      });
      if (claimed.count !== 1) throw new AppError('This invitation has already been answered', 409);
      if (data.note) await tx.projectMessage.create({
        data: { project_id: participant.project_id, sender_id: user.id, kind: 'CONTRIBUTION_RESPONSE', body: data.note },
      });
      return tx.projectParticipant.findUniqueOrThrow({ where: { id: participant.id } });
    });

    const decisionLabel = data.decision === 'ACCEPT' ? 'accepted' : data.decision === 'DECLINE' ? 'declined' : 'requested a correction to';
    await createNotification({
      user_id: participant.project.producer.user_id,
      type: 'CONTRIBUTION_RESPONSE', category: 'PROJECT',
      title: `Contribution invitation ${decisionLabel}`,
      body: `${participant.display_name} ${decisionLabel} the ${participant.role.toLowerCase().replace(/_/g, ' ')} invitation for ${participant.project.title}.`,
      payload: { project_id: participant.project_id, participant_id: participant.id, status },
      action_url: `/producer/projects/${participant.project_id}`,
    });
    res.json(updated);
  } catch (error) { next(error); }
});
