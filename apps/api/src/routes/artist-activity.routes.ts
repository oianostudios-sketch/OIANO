import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';

export const artistActivityRouter = Router();
artistActivityRouter.use(authenticate, requireRole('ARTIST'));

artistActivityRouter.get('/', async (req: any, res, next) => {
  try {
    const artist = await prisma.artist.findUnique({
      where: { user_id: req.userId },
      include: { passport: { select: { id: true } } },
    });
    if (!artist) throw new AppError('Artist not found', 404);

    const [events, releases, projects, connections, views] = await Promise.all([
      prisma.activityEvent.findMany({ where: { artist_id: artist.id }, orderBy: { created_at: 'desc' }, take: 20 }),
      prisma.artistRelease.findMany({ where: { artist_id: artist.id }, orderBy: { created_at: 'desc' }, take: 8 }),
      prisma.project.findMany({ where: { artist_id: artist.id }, orderBy: { updated_at: 'desc' }, take: 8, select: { id: true, title: true, phase: true, updated_at: true, is_active: true } }),
      prisma.passportConnection.findMany({ where: { OR: [{ initiator_id: artist.id }, { recipient_id: artist.id }] }, orderBy: { created_at: 'desc' }, take: 8, include: { initiator: { select: { id: true, name: true, alias: true } }, recipient: { select: { id: true, name: true, alias: true } } } }),
      artist.passport ? prisma.passportView.findMany({ where: { passport_id: artist.passport.id }, orderBy: { created_at: 'desc' }, take: 12, select: { id: true, created_at: true, viewed_on: true } }) : Promise.resolve([]),
    ]);

    const eventEntries = events.map((event) => {
      const payload = event.payload as any;
      if (event.type === 'session.booked') return { id: `event-${event.id}`, kind: 'SESSION', title: 'Studio session requested', detail: payload?.service_name ?? 'Your next session entered the schedule.', at: event.created_at, href: payload?.booking_id ? `/bookings/${payload.booking_id}` : '/calendar', tone: 'blue' };
      if (event.type === 'session.completed') return { id: `event-${event.id}`, kind: 'MILESTONE', title: 'Session completed', detail: 'Another verified studio session was added to your record.', at: event.created_at, href: payload?.booking_id ? `/bookings/${payload.booking_id}` : '/calendar', tone: 'gold' };
      if (event.type === 'profile.created') return { id: `event-${event.id}`, kind: 'IDENTITY', title: 'Artist identity created', detail: 'Your OIANO journey started here.', at: event.created_at, href: '/artist/passport', tone: 'gold' };
      return { id: `event-${event.id}`, kind: 'STATUS', title: 'Availability updated', detail: String(payload?.status ?? '').replace(/_/g, ' ').toLowerCase() || 'Your booking status changed.', at: event.created_at, href: '/artist/passport', tone: 'green' };
    });

    const entries = [
      ...eventEntries,
      ...releases.map((release) => ({ id: `release-${release.id}`, kind: 'RELEASE', title: `${release.title} added to your catalogue`, detail: release.is_featured ? 'Featured on your public Passport.' : `${release.release_type.toLowerCase()} added to your released work.`, at: release.created_at, href: '/artist/passport', tone: 'gold' })),
      ...projects.map((project) => ({ id: `project-${project.id}`, kind: 'PROJECT', title: `${project.title} updated`, detail: `Now in ${project.phase.replace(/_/g, ' ').toLowerCase()}.`, at: project.updated_at, href: `/projects?project=${project.id}`, tone: 'blue' })),
      ...connections.map((connection) => { const other = connection.initiator_id === artist.id ? connection.recipient : connection.initiator; return { id: `connection-${connection.id}`, kind: 'COLLABORATION', title: `Connected with ${other.alias ?? other.name}`, detail: `${connection.status.toLowerCase()} artist connection.`, at: connection.created_at, href: `/connect/${other.id}`, tone: 'violet' }; }),
      ...views.map((view) => ({ id: `view-${view.id}`, kind: 'PASSPORT', title: 'Your Passport was discovered', detail: 'A unique visitor viewed your public artist identity.', at: view.created_at, href: '/artist/passport', tone: 'green' })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 20);

    res.json(entries);
  } catch (error) { next(error); }
});
