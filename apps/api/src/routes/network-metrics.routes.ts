import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { resolveStaffStudio } from '../middleware/studioScope.middleware';
import { AppError } from '../lib/errors';

export const networkMetricsRouter = Router();
networkMetricsRouter.use(authenticate);

type Metric = { key: string; label: string; value: number; unit?: '%' | 'USD'; detail: string };

function response(pole: string, metrics: Metric[]) {
  return { pole, metrics, updated_at: new Date().toISOString() };
}

networkMetricsRouter.get('/', async (req: any, res, next) => {
  try {
    const userId = req.userId as string;
    const role = req.userRole as string;

    if (role === 'ARTIST') {
      const artist = await prisma.artist.findUnique({ where: { user_id: userId }, select: { id: true } });
      if (!artist) throw new AppError('Artist profile required', 404);
      const [sessions, projects, credits, studioRelationships] = await Promise.all([
        prisma.booking.count({ where: { artist_id: artist.id, status: 'COMPLETED' } }),
        prisma.project.count({ where: { artist_id: artist.id, is_active: true } }),
        prisma.projectCredit.count({ where: { project: { artist_id: artist.id }, status: 'CONFIRMED' } }),
        prisma.studioCircleMember.count({ where: { artist_id: artist.id, consent_status: 'ACCEPTED' } }),
      ]);
      return res.json(response('ARTIST', [
        { key: 'completed_sessions', label: 'Completed sessions', value: sessions, detail: 'Studio activity completed through OIANO' },
        { key: 'active_projects', label: 'Active projects', value: projects, detail: 'Current creative work' },
        { key: 'confirmed_credits', label: 'Confirmed credits', value: credits, detail: 'Accepted professional attribution' },
        { key: 'studio_relationships', label: 'Studio relationships', value: studioRelationships, detail: 'Artist-approved Studio Circle connections' },
      ]));
    }

    if (role === 'PRODUCER') {
      const producer = await prisma.producer.findUnique({ where: { user_id: userId }, select: { id: true, passport: { select: { profile_views: true } } } });
      if (!producer) throw new AppError('Creative Professional profile required', 404);
      const [projects, credits, collaborators] = await Promise.all([
        prisma.project.count({ where: { producer_id: producer.id, is_active: true } }),
        prisma.projectCredit.count({ where: { project: { producer_id: producer.id }, status: 'CONFIRMED' } }),
        prisma.projectParticipant.count({ where: { project: { producer_id: producer.id }, status: 'ACTIVE' } }),
      ]);
      return res.json(response('CREATIVE', [
        { key: 'active_projects', label: 'Active projects', value: projects, detail: 'Producer-led work in progress' },
        { key: 'confirmed_credits', label: 'Confirmed credits', value: credits, detail: 'Accepted project attribution' },
        { key: 'active_collaborators', label: 'Active collaborators', value: collaborators, detail: 'Participants connected to your projects' },
        { key: 'passport_views', label: 'Passport views', value: producer.passport?.profile_views ?? 0, detail: 'Professional profile discovery' },
      ]));
    }

    if (role === 'ENGINEER') {
      const engineer = await prisma.engineer.findUnique({ where: { user_id: userId }, select: { id: true, name: true } });
      if (!engineer) throw new AppError('Engineer assignment required', 404);
      const now = new Date();
      const [completed, upcoming, credits, memberships] = await Promise.all([
        prisma.booking.count({ where: { engineer_id: engineer.id, status: 'COMPLETED' } }),
        prisma.booking.count({ where: { engineer_id: engineer.id, starts_at: { gte: now }, status: { in: ['PENDING', 'CONFIRMED'] } } }),
        prisma.projectCredit.count({ where: { credited_name: { equals: engineer.name, mode: 'insensitive' }, status: 'CONFIRMED' } }),
        prisma.studioStaff.count({ where: { user_id: userId } }),
      ]);
      return res.json(response('CREATIVE', [
        { key: 'completed_assignments', label: 'Completed assignments', value: completed, detail: 'Sessions delivered through OIANO' },
        { key: 'upcoming_assignments', label: 'Upcoming assignments', value: upcoming, detail: 'Confirmed and pending studio work' },
        { key: 'confirmed_credits', label: 'Confirmed credits', value: credits, detail: 'Accepted professional attribution' },
        { key: 'studio_workspaces', label: 'Studio workspaces', value: memberships, detail: 'Verified studio responsibilities' },
      ]));
    }

    if (role === 'STUDIO_ADMIN') {
      const studio = await resolveStaffStudio(userId);
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [bookings, rooms, paid, completed] = await Promise.all([
        prisma.booking.findMany({ where: { studio_id: studio.id, starts_at: { gte: since }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } }, select: { artist_id: true, starts_at: true, ends_at: true } }),
        prisma.room.count({ where: { studio_id: studio.id } }),
        prisma.payment.aggregate({ where: { booking: { studio_id: studio.id }, status: 'PAID', paid_at: { gte: since } }, _sum: { amount_usd: true } }),
        prisma.booking.count({ where: { studio_id: studio.id, status: 'COMPLETED', starts_at: { gte: since } } }),
      ]);
      const bookedHours = bookings.reduce((sum, booking) => sum + Math.max(0, booking.ends_at.getTime() - booking.starts_at.getTime()) / 3_600_000, 0);
      const availableHours = Math.max(1, rooms * Math.max(1, studio.operating_close_hour - studio.operating_open_hour) * 30);
      return res.json(response('STUDIO', [
        { key: 'artists_served', label: 'Artists served', value: new Set(bookings.map(booking => booking.artist_id)).size, detail: 'Unique artists in the last 30 days' },
        { key: 'completed_sessions', label: 'Completed sessions', value: completed, detail: 'Delivered in the last 30 days' },
        { key: 'utilization', label: 'Room utilization', value: Math.round(Math.min(100, bookedHours / availableHours * 100)), unit: '%', detail: 'Booked room capacity in the last 30 days' },
        { key: 'paid_revenue', label: 'Paid revenue', value: Number(paid._sum.amount_usd ?? 0), unit: 'USD', detail: 'Reconciled booking revenue in the last 30 days' },
      ]));
    }

    if (role === 'OIANO_ADMIN') {
      const [studios, artists, producers, sessions, credits, rights, consents] = await Promise.all([
        prisma.studio.count(), prisma.artist.count(), prisma.producer.count(),
        prisma.booking.count({ where: { status: 'COMPLETED' } }),
        prisma.projectCredit.count({ where: { status: 'CONFIRMED' } }),
        prisma.rightsAgreement.count({ where: { status: 'ACCEPTED' } }),
        prisma.promotionalConsent.count({ where: { status: 'ACCEPTED' } }),
      ]);
      return res.json(response('OIANO', [
        { key: 'active_studios', label: 'Studios', value: studios, detail: 'Studio infrastructure on the network' },
        { key: 'creator_identities', label: 'Creator identities', value: artists + producers, detail: 'Artists and Creative Professionals' },
        { key: 'completed_sessions', label: 'Completed sessions', value: sessions, detail: 'Creative outcomes delivered through OIANO' },
        { key: 'trusted_records', label: 'Trusted records', value: credits + rights + consents, detail: 'Confirmed credits, rights and consent decisions' },
      ]));
    }

    throw new AppError('Unsupported account responsibility', 403);
  } catch (error) {
    next(error);
  }
});
