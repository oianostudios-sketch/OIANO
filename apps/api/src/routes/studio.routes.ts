// apps/api/src/routes/studio.routes.ts
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { DEFAULT_STUDIO_SLUG } from '@oiano/shared';

export const studioRouter = Router();

const STUDIO_PRESENTATION: Record<string, { image_url: string; amenities: string[] }> = {
  'dreamz-music-lab': { image_url: '/images/studios/dreamz-hero-v1.webp', amenities: ['Main recording room', 'Studio-assigned producer', 'Wi-Fi', 'Lefkoşa location'] },
  'northlight-sound-house': { image_url: '/images/studios/northlight-hero-v1.webp', amenities: ['Daylight rooms', 'Artist lounge', 'Wi-Fi', 'Freight elevator'] },
};
const ROOM_PRESENTATION: Record<string, { image_url: string; amenities: string[] }> = {
  'room-studio-a': { image_url: '/images/studios/dreamz-studio-a-v1.webp', amenities: ['Recording setup', 'Production workstation', 'Monitoring', 'Studio-assigned producer'] },
  'room-studio-b': { image_url: '/images/studios/dreamz-studio-b-v1.webp', amenities: ['Production workstation', 'Analog outboard', 'Nearfield monitors', 'Writing sofa'] },
  'room-vocal-booth': { image_url: '/images/studios/dreamz-vocal-booth-v1.webp', amenities: ['Condenser microphone', 'Pop shield', 'Headphone mix', 'Isolation'] },
  'northlight-live-room': { image_url: '/images/studios/northlight-live-room-v1.webp', amenities: ['Grand piano', 'Drum kit', 'Guitar amps', 'Acoustic gobos'] },
  'northlight-writing-suite': { image_url: '/images/studios/northlight-writing-suite-v1.webp', amenities: ['Vocal corner', 'Modular synth', 'Production desk', 'Writing lounge'] },
};
function presentStudio<T extends { slug: string; rooms?: Array<{ id: string }> }>(studio: T) {
  return { ...studio, ...(STUDIO_PRESENTATION[studio.slug] ?? { image_url: '', amenities: [] }), rooms: studio.rooms?.map(room => ({ ...room, ...(ROOM_PRESENTATION[room.id] ?? { image_url: '', amenities: [] }) })) };
}

// GET /api/studio
studioRouter.get('/', async (_req, res, next) => {
  try {
    const studio = await prisma.studio.findUnique({
      where: { slug: DEFAULT_STUDIO_SLUG },
      include: { rooms: true, engineers: true, services: true },
    });
    res.json(studio ? presentStudio(studio) : studio);
  } catch (err) {
    next(err);
  }
});

studioRouter.get('/options', async (_req, res, next) => {
  try {
    const studios = await prisma.studio.findMany({
      select: { id: true, slug: true, name: true, address: true, timezone: true, currency: true, logo_url: true, _count: { select: { rooms: true, engineers: true, services: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(studios.map(studio => ({ ...studio, ...(STUDIO_PRESENTATION[studio.slug] ?? { image_url: '', amenities: [] }) })));
  } catch (err) { next(err); }
});

// Public, evidence-backed Studio Passport. Only consented Circle members are
// exposed; operational totals are aggregated and never reveal booking data.
studioRouter.get('/passport/:slug', async (req, res, next) => {
  try {
    const studio = await prisma.studio.findUnique({
      where: { slug: req.params.slug },
      include: {
        rooms: true,
        engineers: { select: { id: true, name: true, specialties: true, bio: true, avatar_url: true } },
        services: true,
        circle_members: {
          where: { consent_status: 'ACCEPTED', visibility: { not: 'HIDDEN' } },
          include: { artist: { select: { id: true, name: true, alias: true, avatar_url: true, passport: { select: { passport_code: true } } } } },
          orderBy: { last_session_at: 'desc' },
          take: 12,
        },
      },
    });
    if (!studio) return res.status(404).json({ error: 'Studio not found' });

    const [completedSessions, uniqueArtists, rating] = await Promise.all([
      prisma.booking.count({ where: { studio_id: studio.id, status: 'COMPLETED' } }),
      prisma.booking.groupBy({ by: ['artist_id'], where: { studio_id: studio.id, status: 'COMPLETED' } }),
      prisma.sessionLog.aggregate({
        where: { booking: { studio_id: studio.id }, artist_rating: { not: null } },
        _avg: { artist_rating: true }, _count: { artist_rating: true },
      }),
    ]);
    const presented = presentStudio(studio);
    res.json({
      ...presented,
      proof: {
        completed_sessions: completedSessions,
        artists_served: uniqueArtists.length,
        average_rating: rating._avg.artist_rating ? Number(rating._avg.artist_rating.toFixed(1)) : null,
        verified_reviews: rating._count.artist_rating,
      },
      circle: studio.circle_members.map(member => ({
        visibility: member.visibility,
        session_count: member.show_session_count ? member.session_count : null,
        artist: {
          name: member.visibility === 'INITIALS'
            ? (member.artist.alias ?? member.artist.name).split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
            : (member.artist.alias ?? member.artist.name),
          avatar_url: member.visibility === 'INITIALS' ? null : member.artist.avatar_url,
          passport_code: member.visibility === 'FULL_PROFILE' ? member.artist.passport?.passport_code : null,
        },
      })),
    });
  } catch (err) { next(err); }
});

studioRouter.get('/:id', async (req, res, next) => {
  try {
    const studio = await prisma.studio.findUnique({
      where: { id: req.params.id },
      include: { rooms: true, engineers: true, services: true },
    });
    if (!studio) return res.status(404).json({ error: 'Studio not found' });
    res.json(presentStudio(studio));
  } catch (err) { next(err); }
});
