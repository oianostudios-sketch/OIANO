import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { attachStudioScope } from '../middleware/studioScope.middleware';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { createNotification } from './notifications.routes';
import { syncStudioCircleMembership } from '../services/studio-circle.service';

export const studioCircleRouter = Router();
studioCircleRouter.use(authenticate);

async function backfillStudio(studioId: string) {
  const pairs = await prisma.booking.findMany({
    where: { studio_id: studioId, status: 'COMPLETED' },
    distinct: ['artist_id'],
    select: { artist_id: true },
  });
  await Promise.all(pairs.map(({ artist_id }) => syncStudioCircleMembership(studioId, artist_id)));
}

studioCircleRouter.get('/studio', requireRole('STUDIO_ADMIN'), attachStudioScope, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studioId = (req as any).studioId as string;
    await backfillStudio(studioId);
    const members = await prisma.studioCircleMember.findMany({
      where: { studio_id: studioId },
      orderBy: [{ consent_status: 'asc' }, { last_session_at: 'desc' }],
      include: {
        artist: {
          select: {
            id: true, name: true, alias: true, avatar_url: true, status: true,
            passport: { select: { passport_code: true, creative_dna: true, profile_strength: true, collaboration_interests: true } },
          },
        },
      },
    });
    res.json({
      total_verified: members.length,
      visible_count: members.filter(member => member.consent_status === 'ACCEPTED' && member.visibility !== 'HIDDEN').length,
      pending_consent: members.filter(member => ['ELIGIBLE', 'REQUESTED'].includes(member.consent_status)).length,
      members,
    });
  } catch (error) { next(error); }
});

studioCircleRouter.get('/current-work', requireRole('STUDIO_ADMIN'), attachStudioScope, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studioId = (req as any).studioId as string;
    const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const [projects, unlinkedBookings] = await Promise.all([
      prisma.project.findMany({
        where: { is_active: true, bookings: { some: { studio_id: studioId, status: { notIn: ['CANCELLED', 'NO_SHOW'] } } } },
        include: {
          artist: { select: { id: true, name: true, alias: true, avatar_url: true } },
          producer: { select: { id: true, name: true, alias: true, avatar_url: true } },
          bookings: {
            where: { studio_id: studioId, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
            orderBy: { starts_at: 'desc' },
            take: 6,
            select: { id: true, starts_at: true, ends_at: true, status: true, room: { select: { name: true } }, engineer: { select: { id: true, name: true, avatar_url: true } } },
          },
        },
        orderBy: { updated_at: 'desc' },
        take: 12,
      }),
      prisma.booking.findMany({
        where: { studio_id: studioId, project_id: null, ends_at: { gte: recentCutoff }, status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] } },
        orderBy: { starts_at: 'asc' },
        include: {
          artist: { select: { id: true, name: true, alias: true, avatar_url: true } },
          engineer: { select: { id: true, name: true, avatar_url: true } },
          room: { select: { name: true } },
          service: { select: { name: true } },
        },
        take: 12,
      }),
    ]);

    res.json({
      privacy: 'Private operational view. Participation does not imply public Studio Circle consent.',
      projects: projects.map(project => ({ ...project, source: 'PROJECT' })),
      sessions: unlinkedBookings.map(booking => ({ ...booking, source: 'SESSION' })),
    });
  } catch (error) { next(error); }
});

studioCircleRouter.post('/:id/request', requireRole('STUDIO_ADMIN'), attachStudioScope, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await prisma.studioCircleMember.findFirst({
      where: { id: req.params.id, studio_id: (req as any).studioId },
      include: { artist: { select: { user_id: true } }, studio: { select: { name: true } } },
    });
    if (!member) throw new AppError('Circle member not found', 404);
    if (member.consent_status === 'ACCEPTED') return res.json(member);
    if (member.consent_status === 'REQUESTED') throw new AppError('Consent has already been requested', 409);
    // Owner decision 2026-10-06: once the artist has declined or withdrawn, the
    // studio may not ask again. Only the artist can reopen it, from their side.
    if (member.consent_status === 'DECLINED' || member.consent_status === 'WITHDRAWN') {
      throw new AppError('The artist chose to keep this private. Only the artist can join the Circle now.', 409);
    }
    // Guard the write on the status just read: otherwise a request racing the
    // artist's own answer could overwrite it, and two requests sent together
    // would each notify the artist.
    const claimed = await prisma.studioCircleMember.updateMany({
      where: { id: member.id, consent_status: member.consent_status },
      data: { consent_status: 'REQUESTED' },
    });
    if (claimed.count !== 1) throw new AppError('This Circle membership changed. Refresh and try again.', 409);
    const updated = await prisma.studioCircleMember.findUniqueOrThrow({ where: { id: member.id } });
    await createNotification({
      user_id: member.artist.user_id,
      type: 'studio_circle_consent',
      title: 'Studio Circle invitation',
      body: `${member.studio.name} invited you to join its verified creator Circle. You control what appears.`,
      payload: { circle_member_id: member.id },
    });
    res.json(updated);
  } catch (error) { next(error); }
});

studioCircleRouter.get('/me', requireRole('ARTIST'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const artist = await prisma.artist.findUnique({ where: { user_id: (req as any).userId }, select: { id: true } });
    if (!artist) throw new AppError('Artist profile not found', 404);
    const completedStudios = await prisma.booking.findMany({
      where: { artist_id: artist.id, status: 'COMPLETED' }, distinct: ['studio_id'], select: { studio_id: true },
    });
    await Promise.all(completedStudios.map(({ studio_id }) => syncStudioCircleMembership(studio_id, artist.id)));
    const memberships = await prisma.studioCircleMember.findMany({
      where: { artist_id: artist.id }, orderBy: { last_session_at: 'desc' },
      include: { studio: { select: { id: true, name: true, slug: true, address: true, logo_url: true } } },
    });
    res.json({ memberships });
  } catch (error) { next(error); }
});

const ConsentSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('accept'),
    visibility: z.enum(['INITIALS', 'STAGE_NAME', 'FULL_PROFILE']),
    show_session_count: z.boolean().default(false),
    show_projects: z.boolean().default(false),
  }),
  z.object({ action: z.literal('decline') }),
  z.object({ action: z.literal('withdraw') }),
]);

studioCircleRouter.patch('/:id/consent', requireRole('ARTIST'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = ConsentSchema.parse(req.body);
    const artist = await prisma.artist.findUnique({ where: { user_id: (req as any).userId }, select: { id: true } });
    if (!artist) throw new AppError('Artist profile not found', 404);
    const member = await prisma.studioCircleMember.findFirst({ where: { id: req.params.id, artist_id: artist.id } });
    if (!member) throw new AppError('Circle membership not found', 404);

    // Accepting is open from any state but ACCEPTED, declining from any state
    // but DECLINED, and withdrawing only from ACCEPTED (what the consent
    // centre offers). The write is guarded on the status read, so answers
    // sent together cannot both apply.
    const allowed = input.action === 'accept' ? member.consent_status !== 'ACCEPTED'
      : input.action === 'decline' ? member.consent_status !== 'DECLINED'
        : member.consent_status === 'ACCEPTED';
    if (!allowed) throw new AppError('This Circle consent has already been answered', 409);

    const data = input.action === 'accept'
      ? { consent_status: 'ACCEPTED' as const, visibility: input.visibility, show_session_count: input.show_session_count, show_projects: input.show_projects, consented_at: new Date(), withdrawn_at: null }
      : input.action === 'decline'
        ? { consent_status: 'DECLINED' as const, visibility: 'HIDDEN' as const, show_session_count: false, show_projects: false, consented_at: null, withdrawn_at: null }
        : { consent_status: 'WITHDRAWN' as const, visibility: 'HIDDEN' as const, show_session_count: false, show_projects: false, withdrawn_at: new Date() };

    const claimed = await prisma.studioCircleMember.updateMany({ where: { id: member.id, consent_status: member.consent_status }, data });
    if (claimed.count !== 1) throw new AppError('This Circle consent has already been answered', 409);
    res.json(await prisma.studioCircleMember.findUniqueOrThrow({ where: { id: member.id } }));
  } catch (error) { next(error); }
});
