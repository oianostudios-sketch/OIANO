// apps/api/src/routes/producer.routes.ts
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { isR2Configured, uploadToR2, deleteFromR2 } from '../lib/r2';
import { getImageUpload } from '../lib/imageUpload';
import { getAudioUpload } from '../lib/audioUpload';
import { generatePassportCode } from '../lib/passport';

export const producerRouter = Router();
producerRouter.use(authenticate);

const db = prisma as any; // cast until prisma generate runs with new schema

// ── GET /api/producer/me — producer profile + projects ───────────────────────
producerRouter.get('/me', requireRole('PRODUCER'), async (req: any, res, next) => {
  try {
    const producer = await db.producer.findUnique({
      where: { user_id: req.userId },
      include: {
        passport: true,
        projects: {
          where: { is_active: true },
          include: {
            artist: { select: { id: true, name: true, alias: true, avatar_url: true } },
          },
          orderBy: { updated_at: 'desc' },
        },
      },
    });
    if (!producer) throw new AppError('Producer profile not found', 404);
    res.json(producer);
  } catch (err) { next(err); }
});

// ── PATCH /api/producer/avatar — upload profile photo ────────────────────────
producerRouter.patch('/avatar', requireRole('PRODUCER'), async (req: any, res, next) => {
  const upload = getImageUpload();
  if (!upload) return next(new AppError('Image upload not configured', 501));

  upload.single('avatar')(req, res, async (err: any) => {
    if (err) return next(new AppError(err.message ?? 'Upload failed', 400));
    try {
      const producer = await db.producer.findUnique({ where: { user_id: req.userId } });
      if (!producer) throw new AppError('Producer not found', 404);

      const file = req.file;
      if (!file) throw new AppError('No image provided', 400);

      let publicUrl: string;

      if (isR2Configured && (file as any).buffer) {
        publicUrl = await uploadToR2(
          (file as any).buffer,
          `avatars/${producer.id}`,
          file.originalname || 'avatar.jpg',
          file.mimetype,
        );
        if (producer.avatar_url?.startsWith('http')) {
          await deleteFromR2(producer.avatar_url);
        }
      } else {
        publicUrl = `/uploads/avatars/${(file as any).filename}`;
        if (producer.avatar_url?.startsWith('/uploads/')) {
          const oldPath = path.join(process.cwd(), producer.avatar_url);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
      }

      await db.producer.update({
        where: { id: producer.id },
        data: { avatar_url: publicUrl },
      });

      res.json({ avatar_url: publicUrl });
    } catch (e) { next(e); }
  });
});

// ── POST /api/producer/setup — create producer profile on first login ─────────
producerRouter.post('/setup', async (req: any, res, next) => {
  try {
    const { name, alias, bio } = z.object({
      name:  z.string().min(1).max(120),
      alias: z.string().max(80).optional(),
      bio:   z.string().max(1000).optional(),
    }).parse(req.body);

    const existing = await db.producer.findUnique({ where: { user_id: req.userId } });
    if (existing) return res.json(existing);

    const code = await generatePassportCode();
    const producer = await db.producer.create({
      data: {
        user_id: req.userId,
        name, alias, bio,
        passport: {
          create: {
            passport_code: code,
            genres_produced: [],
            signature_tags:  [],
          },
        },
      },
      include: { passport: true },
    });
    res.status(201).json(producer);
  } catch (err) { next(err); }
});

// ── PATCH /api/producer/me — update profile ───────────────────────────────────
producerRouter.patch('/me', requireRole('PRODUCER'), async (req: any, res, next) => {
  try {
    const data = z.object({
      name:            z.string().min(1).max(120).optional(),
      alias:           z.string().max(80).optional(),
      bio:             z.string().max(1000).optional(),
      open_to_collabs: z.boolean().optional(),
    }).parse(req.body);

    const producer = await db.producer.update({
      where: { user_id: req.userId },
      data,
    });
    res.json(producer);
  } catch (err) { next(err); }
});

// ── PATCH /api/producer/passport — update passport DNA ───────────────────────
producerRouter.patch('/passport', requireRole('PRODUCER'), async (req: any, res, next) => {
  try {
    const data = z.object({
      genres_produced: z.array(z.string()).optional(),
      signature_tags:  z.array(z.string()).optional(),
    }).parse(req.body);

    const producer = await db.producer.findUnique({ where: { user_id: req.userId } });
    if (!producer) throw new AppError('Producer not found', 404);

    const passport = await db.producerPassport.update({
      where: { producer_id: producer.id },
      data,
    });
    res.json(passport);
  } catch (err) { next(err); }
});

// ── GET /api/producer/projects — all projects for this producer ───────────────
producerRouter.get('/projects', requireRole('PRODUCER'), async (req: any, res, next) => {
  try {
    const producer = await db.producer.findUnique({ where: { user_id: req.userId } });
    if (!producer) throw new AppError('Producer not found', 404);

    const projects = await db.project.findMany({
      where: { producer_id: producer.id },
      include: {
        artist: { select: { id: true, name: true, alias: true, avatar_url: true } },
        bookings: {
          include: { room: true, service: true },
          orderBy: { starts_at: 'desc' },
        },
      },
      orderBy: { updated_at: 'desc' },
    });
    res.json(projects);
  } catch (err) { next(err); }
});

// ── POST /api/producer/projects — create a project ───────────────────────────
producerRouter.post('/projects', requireRole('PRODUCER'), async (req: any, res, next) => {
  try {
    const data = z.object({
      title:     z.string().min(1).max(200),
      artist_id: z.string().uuid().optional(),
      phase:     z.enum(['PRE_PRODUCTION','TRACKING','EDITING','MIXING','MASTERING','DELIVERED']).optional(),
      notes:     z.string().max(2000).optional(),
    }).parse(req.body);

    const producer = await db.producer.findUnique({ where: { user_id: req.userId } });
    if (!producer) throw new AppError('Producer not found', 404);

    const project = await db.project.create({
      data: { ...data, producer_id: producer.id },
      include: {
        artist: { select: { id: true, name: true, alias: true, avatar_url: true } },
      },
    });
    res.status(201).json(project);
  } catch (err) { next(err); }
});

// ── PATCH /api/producer/projects/:id — update phase / notes ──────────────────
producerRouter.patch('/projects/:id', requireRole('PRODUCER'), async (req: any, res, next) => {
  try {
    const data = z.object({
      phase:     z.enum(['PRE_PRODUCTION','TRACKING','EDITING','MIXING','MASTERING','DELIVERED']).optional(),
      notes:     z.string().max(2000).optional(),
      is_active: z.boolean().optional(),
      title:     z.string().min(1).max(200).optional(),
      artist_id: z.string().uuid().nullable().optional(),
    }).parse(req.body);

    const producer = await db.producer.findUnique({ where: { user_id: req.userId } });
    if (!producer) throw new AppError('Producer not found', 404);

    // Scope to this producer
    const existing = await db.project.findFirst({
      where: { id: req.params.id, producer_id: producer.id },
    });
    if (!existing) throw new AppError('Project not found', 404);

    const project = await db.project.update({
      where: { id: req.params.id },
      data: { ...data, updated_at: new Date() },
      include: {
        artist: { select: { id: true, name: true, alias: true, avatar_url: true } },
      },
    });
    res.json(project);
  } catch (err) { next(err); }
});

// ── DELETE /api/producer/projects/:id — archive (soft delete) ────────────────
producerRouter.delete('/projects/:id', requireRole('PRODUCER'), async (req: any, res, next) => {
  try {
    const producer = await db.producer.findUnique({ where: { user_id: req.userId } });
    if (!producer) throw new AppError('Producer not found', 404);

    const existing = await db.project.findFirst({
      where: { id: req.params.id, producer_id: producer.id },
    });
    if (!existing) throw new AppError('Project not found', 404);

    await db.project.update({ where: { id: req.params.id }, data: { is_active: false } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── GET /api/producer/discover — browse producer passports ───────────────────
// Public within the platform — any authenticated user can browse producers
producerRouter.get('/discover', async (_req, res, next) => {
  try {
    const producers = await db.producer.findMany({
      where: { open_to_collabs: true },
      include: {
        passport: true,
        projects: { where: { is_active: true }, select: { id: true } },
        tracks: {
          where: { is_active: true },
          orderBy: { created_at: 'desc' },
          take: 3,
          select: { id: true, title: true, file_url: true, duration_sec: true, bpm: true, genre: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const mapped = producers.map((p: any) => ({
      id:              p.id,
      name:            p.name,
      alias:           p.alias,
      bio:             p.bio,
      avatar_url:      p.avatar_url,
      open_to_collabs: p.open_to_collabs,
      passport_code:   p.passport?.passport_code,
      genres_produced: p.passport?.genres_produced ?? [],
      signature_tags:  p.passport?.signature_tags  ?? [],
      active_projects: p.projects.length,
      tracks:          p.tracks,
    }));

    res.json(mapped);
  } catch (err) { next(err); }
});

// ── GET /api/producer/tracks — own catalogue ──────────────────────────────────
producerRouter.get('/tracks', requireRole('PRODUCER'), async (req: any, res, next) => {
  try {
    const producer = await db.producer.findUnique({ where: { user_id: req.userId } });
    if (!producer) throw new AppError('Producer not found', 404);

    const tracks = await db.track.findMany({
      where: { producer_id: producer.id, is_active: true },
      orderBy: { created_at: 'desc' },
    });
    res.json(tracks);
  } catch (err) { next(err); }
});

// ── POST /api/producer/tracks — upload a beat/sample ──────────────────────────
producerRouter.post('/tracks', requireRole('PRODUCER'), async (req: any, res, next) => {
  const upload = getAudioUpload();
  if (!upload) return next(new AppError('Audio upload not configured', 501));

  upload.single('audio')(req, res, async (err: any) => {
    if (err) return next(new AppError(err.message ?? 'Upload failed', 400));
    try {
      const producer = await db.producer.findUnique({ where: { user_id: req.userId } });
      if (!producer) throw new AppError('Producer not found', 404);

      const file = req.file;
      if (!file) throw new AppError('No audio file provided', 400);

      const data = z.object({
        title:        z.string().min(1).max(200),
        bpm:          z.coerce.number().int().positive().optional(),
        genre:        z.string().max(80).optional(),
        tags:         z.string().optional().transform(s => s ? JSON.parse(s) : []),
        duration_sec: z.coerce.number().int().positive().optional(),
      }).parse(req.body);

      const file_url = isR2Configured && (file as any).buffer
        ? await uploadToR2((file as any).buffer, `tracks/${producer.id}`, file.originalname || 'track.mp3', file.mimetype)
        : `/uploads/tracks/${(file as any).filename}`;

      const track = await db.track.create({
        data: { ...data, file_url, producer_id: producer.id },
      });
      res.status(201).json(track);
    } catch (e) { next(e); }
  });
});

// ── DELETE /api/producer/tracks/:id — archive (soft delete) ──────────────────
producerRouter.delete('/tracks/:id', requireRole('PRODUCER'), async (req: any, res, next) => {
  try {
    const producer = await db.producer.findUnique({ where: { user_id: req.userId } });
    if (!producer) throw new AppError('Producer not found', 404);

    const existing = await db.track.findFirst({
      where: { id: req.params.id, producer_id: producer.id },
    });
    if (!existing) throw new AppError('Track not found', 404);

    await db.track.update({ where: { id: req.params.id }, data: { is_active: false } });
    res.json({ success: true });
  } catch (err) { next(err); }
});
