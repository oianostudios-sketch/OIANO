// apps/api/src/routes/network-pulse.routes.ts
// Two small, honest, permission-safe reads over data that already exists:
//   GET /api/network/pulse — an aggregate "OIANO is alive" signal, available
//     to any authenticated role (unlike /api/network-metrics's OIANO_ADMIN-only
//     aggregate branch). Pure counts only — no per-studio or per-artist
//     breakdown, so a small network can't be deanonymized by process of
//     elimination.
//   GET /api/network/orbit — the caller's own real work relationships,
//     derived from Booking/Project/ProjectParticipant, never fabricated and
//     never another user's data. Returns an honest empty chain when there
//     isn't yet a real relationship to show.
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { RIGHTS_AGREEMENT_APPROVED } from '../lib/rightsDecisionState';

export const networkPulseRouter = Router();
networkPulseRouter.use(authenticate);

networkPulseRouter.get('/pulse', async (_req: any, res, next) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [studios, artists, producers, completedToday, completedTotal, confirmedCredits, approvedRights] = await Promise.all([
      prisma.studio.count(),
      prisma.artist.count(),
      prisma.producer.count(),
      prisma.booking.count({ where: { status: 'COMPLETED', updated_at: { gte: since } } }),
      prisma.booking.count({ where: { status: 'COMPLETED' } }),
      prisma.projectCredit.count({ where: { status: 'CONFIRMED' } }),
      prisma.rightsAgreement.count({ where: { status: RIGHTS_AGREEMENT_APPROVED } }),
    ]);
    res.json({
      studios,
      creatives: artists + producers,
      sessions_completed_today: completedToday,
      sessions_completed_total: completedTotal,
      trusted_records: confirmedCredits + approvedRights,
      generated_at: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

networkPulseRouter.get('/orbit', async (req: any, res, next) => {
  try {
    const userId = req.userId as string;
    const role = req.userRole as string;

    if (role === 'ARTIST') {
      const artist = await prisma.artist.findUnique({ where: { user_id: userId }, select: { id: true, name: true, alias: true } });
      if (!artist) return res.json({ self: null, chain: [] });

      const project = await prisma.project.findFirst({
        where: { artist_id: artist.id },
        orderBy: [{ is_active: 'desc' }, { updated_at: 'desc' }],
        select: {
          title: true,
          producer: { select: { name: true, alias: true } },
          bookings: { orderBy: { starts_at: 'desc' }, take: 1, select: { studio: { select: { name: true } }, engineer: { select: { name: true } } } },
        },
      });

      if (!project) {
        // No project yet — fall back to the most recent booking's own chain
        const booking = await prisma.booking.findFirst({
          where: { artist_id: artist.id },
          orderBy: { starts_at: 'desc' },
          select: { studio: { select: { name: true } }, engineer: { select: { name: true } } },
        });
        const chain = [{ label: artist.alias ?? artist.name, kind: 'SELF' }];
        if (booking?.studio) chain.push({ label: booking.studio.name, kind: 'STUDIO' });
        if (booking?.engineer) chain.push({ label: booking.engineer.name, kind: 'ENGINEER' });
        return res.json({ self: artist.alias ?? artist.name, chain });
      }

      const latestBooking = project.bookings[0];
      const chain = [{ label: artist.alias ?? artist.name, kind: 'SELF' }, { label: project.title, kind: 'PROJECT' }];
      if (project.producer) chain.push({ label: project.producer.alias ?? project.producer.name, kind: 'PRODUCER' });
      if (latestBooking?.studio) chain.push({ label: latestBooking.studio.name, kind: 'STUDIO' });
      if (latestBooking?.engineer) chain.push({ label: latestBooking.engineer.name, kind: 'ENGINEER' });
      return res.json({ self: artist.alias ?? artist.name, chain });
    }

    if (role === 'PRODUCER') {
      const producer = await prisma.producer.findUnique({ where: { user_id: userId }, select: { id: true, name: true, alias: true } });
      if (!producer) return res.json({ self: null, chain: [] });

      const project = await prisma.project.findFirst({
        where: { producer_id: producer.id },
        orderBy: [{ is_active: 'desc' }, { updated_at: 'desc' }],
        select: {
          title: true,
          artist: { select: { name: true, alias: true } },
          bookings: { orderBy: { starts_at: 'desc' }, take: 1, select: { studio: { select: { name: true } }, engineer: { select: { name: true } } } },
        },
      });
      if (!project) return res.json({ self: producer.alias ?? producer.name, chain: [{ label: producer.alias ?? producer.name, kind: 'SELF' }] });

      const latestBooking = project.bookings[0];
      const chain = [{ label: producer.alias ?? producer.name, kind: 'SELF' }, { label: project.title, kind: 'PROJECT' }];
      if (project.artist) chain.push({ label: project.artist.alias ?? project.artist.name, kind: 'ARTIST' });
      if (latestBooking?.studio) chain.push({ label: latestBooking.studio.name, kind: 'STUDIO' });
      if (latestBooking?.engineer) chain.push({ label: latestBooking.engineer.name, kind: 'ENGINEER' });
      return res.json({ self: producer.alias ?? producer.name, chain });
    }

    if (role === 'ENGINEER') {
      const engineer = await prisma.engineer.findUnique({ where: { user_id: userId }, select: { id: true, name: true, studio: { select: { name: true } } } });
      if (!engineer) return res.json({ self: null, chain: [] });
      const booking = await prisma.booking.findFirst({
        where: { engineer_id: engineer.id, status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] } },
        orderBy: { starts_at: 'desc' },
        select: { artist: { select: { name: true, alias: true } }, project: { select: { title: true } } },
      });
      const chain = [{ label: engineer.name, kind: 'SELF' }, { label: engineer.studio.name, kind: 'STUDIO' }];
      if (booking?.project) chain.push({ label: booking.project.title, kind: 'PROJECT' });
      if (booking?.artist) chain.push({ label: booking.artist.alias ?? booking.artist.name, kind: 'ARTIST' });
      return res.json({ self: engineer.name, chain });
    }

    // STUDIO_ADMIN / OIANO_ADMIN operate the network rather than sitting inside
    // one work relationship — an individual "orbit" doesn't honestly apply.
    return res.json({ self: null, chain: [], note: 'Orbit reflects an individual creative or studio worker\'s own relationships.' });
  } catch (err) { next(err); }
});
