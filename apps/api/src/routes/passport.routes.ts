import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { isR2Configured, uploadToR2, deleteFromR2 } from '../lib/r2';
import { getImageUpload } from '../lib/imageUpload';
import QRCode from 'qrcode';
import crypto from 'crypto';

export const passportRouter = Router();

const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  alias: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(2000).optional(),
  creative_dna: z.object({
    genres: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
    vocal_type: z.string().trim().max(80).optional(),
    energy_profile: z.string().trim().max(80).optional(),
    key_themes: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  }).strict().optional(),
}).strict();

const socialPlatforms = ['instagram', 'tiktok', 'youtube', 'spotify', 'apple_music', 'soundcloud', 'bandcamp', 'website'] as const;
const portfolioSchema = z.object({
  location: z.string().trim().max(120).optional(),
  collaboration_interests: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  social_links: z.record(z.enum(socialPlatforms), z.string().url().max(500)).optional(),
}).strict();
const releaseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  release_type: z.enum(['SINGLE', 'EP', 'ALBUM', 'MIXTAPE', 'VIDEO']),
  release_date: z.string().datetime().nullable().optional(),
  artwork_url: z.string().url().max(500).nullable().optional(),
  external_url: z.string().url().max(500).nullable().optional(),
  collaborators: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  is_featured: z.boolean().default(false),
}).strict();
const releaseUpdateSchema = releaseSchema.partial().refine((data) => Object.keys(data).length > 0, 'At least one release field is required');

function portfolioScore(artist: any) {
  const passport = artist.passport ?? {};
  const dna = passport.creative_dna ?? {};
  const links = Object.keys(passport.social_links ?? {}).length;
  const releases = artist.releases?.length ?? 0;
  const active = artist.projects?.filter((p: any) => p.is_active).length ?? 0;
  const completed = artist.projects?.filter((p: any) => p.phase === 'DELIVERED').length ?? 0;
  const verifiedBookings = artist.bookings?.length ?? 0;
  const studioHours = (artist.bookings ?? []).reduce((sum: number, booking: any) =>
    sum + Math.max(0, new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / 3_600_000, 0);
  return Math.min(100, [
    [artist.name, 3], [artist.alias, 3], [artist.avatar_url, 5], [artist.bio, 5],
    [passport.location, 2], [artist.status, 2], [dna.genres?.length, 4],
    [dna.vocal_type, 3], [dna.energy_profile, 2], [dna.key_themes?.length, 2],
    [dna.influences?.length, 2], [dna.languages?.length, 2],
    [passport.collaboration_interests?.length, 3], [links, Math.min(10, links * 2)],
    [releases, releases ? 8 + Math.min(12, Math.max(0, releases - 1) * 4) : 0],
    [active, active ? 8 : 0], [completed, completed ? 5 : 0],
    [verifiedBookings, 5], [studioHours, 3], [artist.created_at, 1],
    [passport.passport_code, 3], [true, 7],
  ].reduce((sum, [value, weight]) => sum + (value ? Number(weight) : 0), 0));
}

function portfolioBreakdown(artist: any) {
  const passport = artist.passport ?? {};
  const dna = passport.creative_dna ?? {};
  const links = Object.keys(passport.social_links ?? {}).length;
  const releases = artist.releases?.length ?? 0;
  const active = artist.projects?.some((p: any) => p.is_active && p.phase !== 'DELIVERED');
  const completed = artist.projects?.some((p: any) => p.phase === 'DELIVERED');
  const bookings = artist.bookings ?? [];
  const hours = bookings.reduce((sum: number, booking: any) => sum + Math.max(0, new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / 3_600_000, 0);
  return [
    { label: 'Core identity', max: 20, earned: [artist.name ? 3 : 0, artist.alias ? 3 : 0, artist.avatar_url ? 5 : 0, artist.bio ? 5 : 0, passport.location ? 2 : 0, artist.status ? 2 : 0].reduce((a, b) => a + b, 0) },
    { label: 'Creative identity', max: 18, earned: [dna.genres?.length ? 4 : 0, dna.vocal_type ? 3 : 0, dna.energy_profile ? 2 : 0, dna.key_themes?.length ? 2 : 0, dna.influences?.length ? 2 : 0, dna.languages?.length ? 2 : 0, passport.collaboration_interests?.length ? 3 : 0].reduce((a, b) => a + b, 0) },
    { label: 'Social & streaming', max: 10, earned: Math.min(10, links * 2) },
    { label: 'Released work', max: 20, earned: releases ? 8 + Math.min(12, Math.max(0, releases - 1) * 4) : 0 },
    { label: 'Projects', max: 13, earned: (active ? 8 : 0) + (completed ? 5 : 0) },
    { label: 'Verified OIANO activity', max: 12, earned: (bookings.length ? 5 : 0) + (hours ? 3 : 0) + 1 + (passport.passport_code ? 3 : 0) },
    { label: 'Professional tools', max: 7, earned: 7 },
  ];
}

async function recalculatePortfolioScore(artistId: string) {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    include: { passport: true, releases: true, projects: true, bookings: true },
  });
  if (!artist?.passport) return 0;
  const score = portfolioScore(artist);
  if (artist.passport.profile_strength !== score) {
    await prisma.artistPassport.update({ where: { id: artist.passport.id }, data: { profile_strength: score } });
  }
  return score;
}

passportRouter.get('/public/:code', async (req, res, next) => {
  try {
    const passport = await prisma.artistPassport.findUnique({
      where: { passport_code: req.params.code },
      include: {
        artist: {
          include: {
            releases: { orderBy: [{ is_featured: 'desc' }, { release_date: 'desc' }] },
            projects: { where: { is_public: true }, orderBy: { updated_at: 'desc' } },
            bookings: { where: { status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] } }, select: { starts_at: true, ends_at: true, status: true } },
          },
        },
      },
    });
    if (!passport) throw new AppError('Passport not found', 404);
    const artist = { ...passport.artist, passport };
    const viewedOn = new Date();
    viewedOn.setUTCHours(0, 0, 0, 0);
    const forwarded = req.headers['x-forwarded-for'];
    const address = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim() || req.ip || 'unknown';
    const viewerHash = crypto.createHash('sha256')
      .update(`${process.env.JWT_SECRET ?? 'oiano-local'}|${address}|${req.headers['user-agent'] ?? ''}`)
      .digest('hex');
    await prisma.passportView.upsert({
      where: { passport_id_viewer_hash_viewed_on: { passport_id: passport.id, viewer_hash: viewerHash, viewed_on: viewedOn } },
      create: { passport_id: passport.id, viewer_hash: viewerHash, viewed_on: viewedOn },
      update: {},
    });
    const uniqueViews = await prisma.passportView.count({ where: { passport_id: passport.id } });
    if (passport.profile_views !== uniqueViews) {
      await prisma.artistPassport.update({ where: { id: passport.id }, data: { profile_views: uniqueViews } });
    }
    const score = portfolioScore(artist);
    if (artist.passport.profile_strength !== score) {
      await prisma.artistPassport.update({ where: { id: artist.passport.id }, data: { profile_strength: score } });
      artist.passport.profile_strength = score;
    }
    res.json({
      artist: {
        id: artist.id, name: artist.name, alias: artist.alias, bio: artist.bio,
        avatar_url: artist.avatar_url, status: artist.status, created_at: artist.created_at,
        passport: {
          passport_code: passport.passport_code, creative_dna: passport.creative_dna,
          location: passport.location, social_links: passport.social_links,
          collaboration_interests: passport.collaboration_interests,
        },
        releases: artist.releases,
        projects: artist.projects.map((project) => ({ id: project.id, title: project.title, phase: project.phase, updated_at: project.updated_at })),
      },
      score,
      stats: {
        releases: artist.releases.length,
        active_projects: artist.projects.filter((project) => project.phase !== 'DELIVERED').length,
        completed_projects: artist.projects.filter((project) => project.phase === 'DELIVERED').length,
        sessions: artist.bookings.length,
        hours: Math.round(artist.bookings.reduce((sum, booking) => sum + (booking.ends_at.getTime() - booking.starts_at.getTime()) / 3_600_000, 0)),
      },
    });
  } catch (err) { next(err); }
});

passportRouter.get('/public/:code/qr.png', async (req, res, next) => {
  try {
    const passport = await prisma.artistPassport.findUnique({ where: { passport_code: req.params.code }, select: { passport_code: true } });
    if (!passport) throw new AppError('Passport not found', 404);
    const url = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/p/${passport.passport_code}`;
    // QR readers are most reliable with a dark foreground, light background,
    // and a generous quiet zone. Brand styling belongs around the code.
    const png = await QRCode.toBuffer(url, { errorCorrectionLevel: 'H', width: 384, margin: 4, color: { dark: '#080808', light: '#FFFFFF' } });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(png);
  } catch (err) { next(err); }
});

passportRouter.use(authenticate);

passportRouter.get('/analytics', async (req: any, res, next) => {
  try {
    const artist = await prisma.artist.findUnique({ where: { user_id: req.userId }, include: { passport: true } });
    if (!artist?.passport) throw new AppError('Passport not found', 404);
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - 6);
    const views = await prisma.passportView.findMany({
      where: { passport_id: artist.passport.id, viewed_on: { gte: since } },
      select: { viewed_on: true },
      orderBy: { viewed_on: 'asc' },
    });
    const daily = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(since);
      date.setUTCDate(since.getUTCDate() + offset);
      const key = date.toISOString().slice(0, 10);
      return { date: key, views: views.filter((view) => view.viewed_on.toISOString().slice(0, 10) === key).length };
    });
    res.json({ total_unique_views: artist.passport.profile_views, last_7_days: daily });
  } catch (err) { next(err); }
});

passportRouter.get('/', async (req: any, res, next) => {
  try {
    const artist = await prisma.artist.findUnique({
      where: { user_id: req.userId },
      include: { passport: true },
    });
    if (!artist?.passport) throw new AppError('Passport not found', 404);
    res.json(artist.passport);
  } catch (err) { next(err); }
});

passportRouter.get('/portfolio', async (req: any, res, next) => {
  try {
    const artist = await prisma.artist.findUnique({
      where: { user_id: req.userId },
      include: {
        passport: true,
        releases: { orderBy: [{ is_featured: 'desc' }, { release_date: 'desc' }] },
        projects: { orderBy: { updated_at: 'desc' } },
        bookings: { where: { status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] } } },
      },
    });
    if (!artist?.passport) throw new AppError('Passport not found', 404);
    const activeProjects = artist.projects.filter((p) => p.is_active && p.phase !== 'DELIVERED');
    const completedProjects = artist.projects.filter((p) => p.phase === 'DELIVERED');
    res.json({
      artist: { ...artist, projects: artist.projects.filter((p) => p.is_public) },
      score: portfolioScore(artist),
      score_breakdown: portfolioBreakdown(artist),
      project_options: artist.projects.map((project) => ({
        id: project.id, title: project.title, phase: project.phase,
        is_active: project.is_active, is_public: project.is_public,
      })),
      stats: {
        releases: artist.releases.length,
        active_projects: activeProjects.length,
        completed_projects: completedProjects.length,
        sessions: artist.bookings.length,
      },
    });
  } catch (err) { next(err); }
});

passportRouter.patch('/portfolio', async (req: any, res, next) => {
  try {
    const data = portfolioSchema.parse(req.body);
    const artist = await prisma.artist.findUnique({ where: { user_id: req.userId } });
    if (!artist) throw new AppError('Artist not found', 404);
    const updated = await prisma.artistPassport.update({ where: { artist_id: artist.id }, data });
    const score = await recalculatePortfolioScore(artist.id);
    res.json({ ...updated, profile_strength: score });
  } catch (err) { next(err); }
});

passportRouter.post('/releases', async (req: any, res, next) => {
  try {
    const data = releaseSchema.parse(req.body);
    const artist = await prisma.artist.findUnique({ where: { user_id: req.userId } });
    if (!artist) throw new AppError('Artist not found', 404);
    if (data.is_featured) await prisma.artistRelease.updateMany({ where: { artist_id: artist.id }, data: { is_featured: false } });
    const release = await prisma.artistRelease.create({
      data: { ...data, release_date: data.release_date ? new Date(data.release_date) : null, artist_id: artist.id },
    });
    await recalculatePortfolioScore(artist.id);
    res.status(201).json(release);
  } catch (err) { next(err); }
});

passportRouter.patch('/releases/:id', async (req: any, res, next) => {
  try {
    const data = releaseUpdateSchema.parse(req.body);
    const artist = await prisma.artist.findUnique({ where: { user_id: req.userId } });
    if (!artist) throw new AppError('Artist not found', 404);
    const existing = await prisma.artistRelease.findFirst({ where: { id: req.params.id, artist_id: artist.id } });
    if (!existing) throw new AppError('Release not found', 404);
    if (data.is_featured) await prisma.artistRelease.updateMany({ where: { artist_id: artist.id, id: { not: existing.id } }, data: { is_featured: false } });
    const release = await prisma.artistRelease.update({
      where: { id: existing.id },
      data: { ...data, release_date: data.release_date === undefined ? undefined : data.release_date ? new Date(data.release_date) : null },
    });
    await recalculatePortfolioScore(artist.id);
    res.json(release);
  } catch (err) { next(err); }
});

passportRouter.patch('/releases/:id/artwork', async (req: any, res, next) => {
  const upload = getImageUpload('releases');
  if (!upload) return next(new AppError('Image upload not configured', 501));
  upload.single('artwork')(req, res, async (err: any) => {
    if (err) return next(new AppError(err.message ?? 'Upload failed', 400));
    try {
      const artist = await prisma.artist.findUnique({ where: { user_id: req.userId } });
      if (!artist) throw new AppError('Artist not found', 404);
      const release = await prisma.artistRelease.findFirst({ where: { id: req.params.id, artist_id: artist.id } });
      if (!release) throw new AppError('Release not found', 404);
      const file = req.file;
      if (!file) throw new AppError('No artwork provided', 400);
      let artworkUrl: string;
      if (isR2Configured && (file as any).buffer) {
        artworkUrl = await uploadToR2((file as any).buffer, `releases/${artist.id}`, file.originalname || 'artwork.jpg', file.mimetype);
        if (release.artwork_url?.startsWith('http')) await deleteFromR2(release.artwork_url);
      } else {
        artworkUrl = `/uploads/releases/${(file as any).filename}`;
        if (release.artwork_url?.startsWith('/uploads/releases/')) {
          const oldPath = path.join(process.cwd(), release.artwork_url);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
      }
      const updated = await prisma.artistRelease.update({ where: { id: release.id }, data: { artwork_url: artworkUrl } });
      res.json(updated);
    } catch (error) { next(error); }
  });
});

passportRouter.delete('/releases/:id', async (req: any, res, next) => {
  try {
    const artist = await prisma.artist.findUnique({ where: { user_id: req.userId } });
    if (!artist) throw new AppError('Artist not found', 404);
    const release = await prisma.artistRelease.findFirst({ where: { id: req.params.id, artist_id: artist.id } });
    if (!release) throw new AppError('Release not found', 404);
    const result = await prisma.artistRelease.deleteMany({ where: { id: req.params.id, artist_id: artist.id } });
    if (!result.count) throw new AppError('Release not found', 404);
    if (release.artwork_url?.startsWith('http')) await deleteFromR2(release.artwork_url);
    if (release.artwork_url?.startsWith('/uploads/releases/')) {
      const artworkPath = path.join(process.cwd(), release.artwork_url);
      if (fs.existsSync(artworkPath)) fs.unlinkSync(artworkPath);
    }
    await recalculatePortfolioScore(artist.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

passportRouter.patch('/projects/:id/visibility', async (req: any, res, next) => {
  try {
    const { is_public } = z.object({ is_public: z.boolean() }).strict().parse(req.body);
    const artist = await prisma.artist.findUnique({ where: { user_id: req.userId } });
    if (!artist) throw new AppError('Artist not found', 404);
    const result = await prisma.project.updateMany({ where: { id: req.params.id, artist_id: artist.id }, data: { is_public } });
    if (!result.count) throw new AppError('Project not found', 404);
    await recalculatePortfolioScore(artist.id);
    res.json({ is_public });
  } catch (err) { next(err); }
});

passportRouter.patch('/profile', async (req: any, res, next) => {
  try {
    const input = profileUpdateSchema.parse(req.body);
    const artist = await prisma.artist.findUnique({
      where: { user_id: req.userId },
      include: { passport: true },
    });
    if (!artist) throw new AppError('Artist not found', 404);
    const { creative_dna, ...artistFields } = input;
    if (creative_dna) {
      const existingDna = (artist.passport?.creative_dna ?? {}) as Record<string, unknown>;
      await prisma.artistPassport.update({
        where: { artist_id: artist.id },
        data: { creative_dna: { ...existingDna, ...creative_dna } },
      });
    }
    if (Object.keys(artistFields).length > 0) {
      await prisma.artist.update({ where: { id: artist.id }, data: artistFields });
    }
    const updated = await prisma.artist.findUnique({
      where: { id: artist.id },
      include: { passport: true },
    });

    if (updated?.passport) updated.passport.profile_strength = await recalculatePortfolioScore(artist.id);

    res.json(updated);
  } catch (err) { next(err); }
});

// PATCH /api/passport/avatar — upload profile photo
passportRouter.patch('/avatar', async (req: any, res, next) => {
  const upload = getImageUpload();
  if (!upload) return next(new AppError('Image upload not configured', 501));

  upload.single('avatar')(req, res, async (err: any) => {
    if (err) return next(new AppError(err.message ?? 'Upload failed', 400));
    try {
      const artist = await prisma.artist.findUnique({ where: { user_id: req.userId } });
      if (!artist) throw new AppError('Artist not found', 404);

      const file = req.file;
      if (!file) throw new AppError('No image provided', 400);

      let publicUrl: string;

      if (isR2Configured && (file as any).buffer) {
        // Upload to R2
        publicUrl = await uploadToR2(
          (file as any).buffer,
          `avatars/${artist.id}`,
          file.originalname || 'avatar.jpg',
          file.mimetype,
        );
        // Remove old avatar from R2 if present
        if (artist.avatar_url?.startsWith('http')) {
          await deleteFromR2(artist.avatar_url);
        }
      } else {
        // Local disk
        publicUrl = `/uploads/avatars/${(file as any).filename}`;
        // Remove old avatar from disk
        if (artist.avatar_url?.startsWith('/uploads/')) {
          const oldPath = path.join(process.cwd(), artist.avatar_url);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
      }

      const updated = await prisma.artist.update({
        where: { id: artist.id },
        data: { avatar_url: publicUrl },
        include: { passport: true },
      });

      if (updated.passport) await recalculatePortfolioScore(artist.id);

      res.json({ avatar_url: publicUrl });
    } catch (e) { next(e); }
  });
});

// PATCH /api/passport/summary — artist edits or hides their AI brief
const SummarySchema = z.object({
  ai_summary:  z.string().max(2000).optional(),
  ai_summary_public: z.boolean().optional(),
});

passportRouter.patch('/summary', async (req: any, res, next) => {
  try {
    const data   = SummarySchema.parse(req.body);
    const artist = await prisma.artist.findUnique({ where: { user_id: req.userId } });
    if (!artist) throw new AppError('Artist not found', 404);

    const updated = await prisma.artistPassport.update({
      where: { artist_id: artist.id },
      data: {
        ...(data.ai_summary !== undefined && {
          ai_summary:        data.ai_summary,
          ai_summary_edited: true,
          ai_summary_updated_at: new Date(),
        }),
        ...(data.ai_summary_public !== undefined && {
          ai_summary_public: data.ai_summary_public,
        }),
      },
    });

    res.json({ ai_summary: updated.ai_summary, ai_summary_public: updated.ai_summary_public });
  } catch (err) { next(err); }
});
