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
import { auditSuccessfulMutation } from '../lib/adminAudit';
import { ownershipSharesAreValid } from '../lib/resourceAuthorization';
import { createNotification } from './notifications.routes';

export const producerRouter = Router();
producerRouter.use(authenticate);
producerRouter.use(auditSuccessfulMutation);

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
producerRouter.post('/setup', requireRole('PRODUCER'), async (req: any, res, next) => {
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
      primary_discipline: z.string().min(1).max(60).optional(),
      disciplines:     z.array(z.string().min(1).max(60)).min(1).max(6).optional(),
      services:        z.array(z.string().min(1).max(100)).max(20).optional(),
      location:        z.string().max(120).nullable().optional(),
      onboarding_complete: z.boolean().optional(),
    }).parse(req.body);

    if (data.primary_discipline && data.disciplines && !data.disciplines.includes(data.primary_discipline)) {
      throw new AppError('Primary discipline must be one of the selected disciplines', 400);
    }

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
          include: { room: true, service: true, deliverables: { select: { id: true, title: true, status: true, current_version: true } } },
          orderBy: { starts_at: 'desc' },
        },
        participants: { where: { status: { not: 'REMOVED' } }, orderBy: { created_at: 'asc' } },
        credits: { orderBy: { created_at: 'asc' } },
        promotional_consents: { orderBy: { created_at: 'desc' } },
        rights_agreements: { include: { shares: { orderBy: { percentage: 'desc' } }, decisions: { orderBy: { created_at: 'asc' } } }, orderBy: { created_at: 'desc' } },
      },
      orderBy: { updated_at: 'desc' },
    });
    res.json(projects);
  } catch (err) { next(err); }
});

const ParticipantSchema = z.object({
  display_name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254).optional().or(z.literal('')),
  role: z.enum(['FEATURED_ARTIST', 'PRODUCER', 'CO_PRODUCER', 'ENGINEER', 'RECORDING_ENGINEER', 'SONGWRITER', 'COMPOSER', 'MIX_ENGINEER', 'MASTERING_ENGINEER', 'MUSICIAN', 'VOCALS', 'MANAGER', 'OTHER']),
});

producerRouter.post('/projects/:id/participants', requireRole('PRODUCER'), async (req: any, res, next) => {
  try {
    const data = ParticipantSchema.parse(req.body);
    const producer = await db.producer.findUnique({ where: { user_id: req.userId } });
    if (!producer) throw new AppError('Producer not found', 404);
    const project = await db.project.findFirst({ where: { id: req.params.id, producer_id: producer.id, is_active: true } });
    if (!project) throw new AppError('Project not found', 404);

    const duplicate = await db.projectParticipant.findFirst({
      where: {
        project_id: project.id,
        display_name: { equals: data.display_name, mode: 'insensitive' },
        role: data.role,
        status: { not: 'REMOVED' },
      },
    });
    if (duplicate) throw new AppError('This participant already has that role', 409);

    const matchedUser = data.email
      ? await db.user.findFirst({ where: { email: { equals: data.email, mode: 'insensitive' } }, select: { id: true } })
      : null;
    const participant = await db.projectParticipant.create({
      data: {
        project_id: project.id,
        display_name: data.display_name,
        email: data.email || null,
        role: data.role,
        added_by: req.userId,
        status: data.email ? 'INVITED' : 'ACTIVE',
        participant_ref_id: matchedUser?.id ?? null,
        participant_type: data.email ? 'INVITED' : 'EXTERNAL',
      },
    });
    if (participant.participant_ref_id) await createNotification({
      user_id: participant.participant_ref_id,
      type: 'CONTRIBUTION_INVITATION', category: 'PROJECT', priority: 'HIGH',
      title: `Contribution invitation · ${project.title}`,
      body: `You were invited as ${data.role.toLowerCase().replace(/_/g, ' ')}. Review the role before joining the project.`,
      payload: { project_id: project.id, participant_id: participant.id },
      action_url: '/contributions',
    });
    res.status(201).json(participant);
  } catch (err) { next(err); }
});

producerRouter.delete('/projects/:id/participants/:participantId', requireRole('PRODUCER'), async (req: any, res, next) => {
  try {
    const producer = await db.producer.findUnique({ where: { user_id: req.userId } });
    if (!producer) throw new AppError('Producer not found', 404);
    const participant = await db.projectParticipant.findFirst({
      where: { id: req.params.participantId, project_id: req.params.id, project: { producer_id: producer.id } },
    });
    if (!participant) throw new AppError('Project participant not found', 404);
    await db.projectParticipant.update({ where: { id: participant.id }, data: { status: 'REMOVED' } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

const CreditSchema = z.object({
  credited_name: z.string().trim().min(1).max(120),
  role: z.enum(['PRIMARY_ARTIST', 'FEATURED_ARTIST', 'PRODUCER', 'CO_PRODUCER', 'SONGWRITER', 'COMPOSER', 'ENGINEER', 'RECORDING_ENGINEER', 'MIX_ENGINEER', 'MASTERING_ENGINEER', 'MUSICIAN', 'VOCALS', 'OTHER']),
  scope: z.string().trim().max(500).optional(),
  participant_id: z.string().uuid().optional(),
});

producerRouter.post('/projects/:id/credits', requireRole('PRODUCER'), async (req: any, res, next) => {
  try {
    const data = CreditSchema.parse(req.body);
    const producer = await db.producer.findUnique({ where: { user_id: req.userId } });
    if (!producer) throw new AppError('Producer not found', 404);
    const project = await db.project.findFirst({ where: { id: req.params.id, producer_id: producer.id, is_active: true } });
    if (!project) throw new AppError('Project not found', 404);
    let participantId = data.participant_id;
    if (!participantId) {
      participantId = (await db.projectParticipant.findFirst({
        where: { project_id: project.id, display_name: { equals: data.credited_name, mode: 'insensitive' }, status: 'ACTIVE' },
        select: { id: true },
      }))?.id;
    }
    if (participantId) {
      const participant = await db.projectParticipant.findFirst({ where: { id: participantId, project_id: project.id, status: 'ACTIVE' } });
      if (!participant) throw new AppError('Project participant not found', 404);
    }
    const duplicate = await db.projectCredit.findFirst({ where: { project_id: project.id, credited_name: { equals: data.credited_name, mode: 'insensitive' }, role: data.role } });
    if (duplicate) throw new AppError('This credit is already listed', 409);
    const credit = await db.projectCredit.create({ data: { ...data, scope: data.scope || null, participant_id: participantId || null, project_id: project.id, added_by: req.userId } });
    res.status(201).json(credit);
  } catch (err) { next(err); }
});

producerRouter.delete('/projects/:id/credits/:creditId', requireRole('PRODUCER'), async (req: any, res, next) => {
  try {
    const producer = await db.producer.findUnique({ where: { user_id: req.userId } });
    if (!producer) throw new AppError('Producer not found', 404);
    const credit = await db.projectCredit.findFirst({ where: { id: req.params.creditId, project_id: req.params.id, project: { producer_id: producer.id } } });
    if (!credit) throw new AppError('Project credit not found', 404);
    await db.projectCredit.delete({ where: { id: credit.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

producerRouter.post('/projects/:id/promotional-consents', requireRole('PRODUCER'), async (req: any, res, next) => {
  try {
    const requestData = { ...req.body, channels: Array.isArray(req.body?.channels) ? req.body.channels.map((channel: unknown) => String(channel).toUpperCase().replace(/\s+/g, '_')) : req.body?.channels };
    const data = z.object({
      subject: z.string().trim().min(1).max(160),
      purpose: z.string().trim().min(1).max(500),
      channels: z.array(z.enum(['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'WEBSITE', 'PRESS', 'PAID_ADS', 'EMAIL'])).min(1),
      assets: z.array(z.enum(['NAME', 'IMAGE', 'VIDEO', 'AUDIO', 'PROJECT_TITLE', 'QUOTE'])).min(1),
      expires_at: z.string().datetime().optional(),
    }).parse(requestData);
    const producer = await db.producer.findUnique({ where: { user_id: req.userId } });
    if (!producer) throw new AppError('Producer not found', 404);
    const project = await db.project.findFirst({ where: { id: req.params.id, producer_id: producer.id, artist_id: { not: null } }, include: { artist: true } });
    if (!project) throw new AppError('Project with an artist not found', 404);
    const consent = await db.promotionalConsent.create({ data: { ...data, expires_at: data.expires_at ? new Date(data.expires_at) : null, project_id: project.id, requested_by: req.userId } });
    await db.notification.create({ data: { user_id: project.artist!.user_id, type: 'PROMOTIONAL_CONSENT_REQUESTED', title: 'Promotion permission requested', body: `${producer.alias ?? producer.name} requested permission for ${project.title}.`, payload: { project_id: project.id, consent_id: consent.id } } });
    res.status(201).json(consent);
  } catch (err) { next(err); }
});

producerRouter.post('/projects/:id/rights-agreements', requireRole('PRODUCER'), async (req: any, res, next) => {
  try {
    const data = z.object({
      agreement_type: z.enum(['MASTER', 'PUBLISHING']),
      title: z.string().trim().min(1).max(200),
      terms_note: z.string().trim().max(2000).optional(),
      shares: z.array(z.object({ holder_name: z.string().trim().min(1).max(120), holder_type: z.enum(['ARTIST','PRODUCER','PARTICIPANT','COMPANY']), holder_ref_id: z.string().optional(), role: z.string().trim().min(1).max(80), percentage: z.number().positive().max(100) })).min(2).max(20),
    }).superRefine((value, ctx) => {
      if (!ownershipSharesAreValid(value.shares)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ownership must have unique holders and total exactly 100%', path: ['shares'] });
    }).parse(req.body);
    const producer = await db.producer.findUnique({ where: { user_id: req.userId } });
    if (!producer) throw new AppError('Producer not found', 404);
    const project = await db.project.findFirst({ where: { id: req.params.id, producer_id: producer.id, artist_id: { not: null } }, include: { artist: true } });
    if (!project) throw new AppError('Project with an artist not found', 404);
    const existing = await db.rightsAgreement.findFirst({ where: { project_id: project.id, agreement_type: data.agreement_type, status: { in: ['PROPOSED','APPROVED'] } } });
    if (existing) throw new AppError(`An active ${data.agreement_type.toLowerCase()} agreement already exists`, 409);
    const normalizedShares = await Promise.all(data.shares.map(async share => {
      let holderUserId: string | null = null;
      if (share.holder_type === 'ARTIST' && share.holder_ref_id === project.artist!.id) holderUserId = project.artist!.user_id;
      if (share.holder_type === 'PRODUCER' && share.holder_ref_id === producer.id) holderUserId = producer.user_id;
      if (share.holder_type === 'PARTICIPANT' && share.holder_ref_id) holderUserId = (await db.projectParticipant.findFirst({ where: { id: share.holder_ref_id, project_id: project.id, status: 'ACTIVE' }, select: { participant_ref_id: true } }))?.participant_ref_id ?? null;
      return { ...share, holder_ref_id: holderUserId ?? share.holder_ref_id, holderUserId };
    }));
    if (normalizedShares.some(share => !share.holderUserId)) throw new AppError('Every rights holder must be linked to an accepted OIANO identity before this proposal can be sent', 400);
    const decisionHolders = normalizedShares.filter(share => share.holderUserId).filter((share, index, all) => all.findIndex(item => item.holderUserId === share.holderUserId) === index);
    const agreement = await db.rightsAgreement.create({ data: {
      project_id: project.id, agreement_type: data.agreement_type, title: data.title, terms_note: data.terms_note, created_by: req.userId,
      shares: { create: normalizedShares.map(({ holderUserId: _holderUserId, ...share }) => share) },
      decisions: { create: decisionHolders.map(holder => ({ holder_user_id: holder.holderUserId!, holder_name: holder.holder_name, status: holder.holderUserId === req.userId ? 'APPROVED' : 'PENDING', responded_at: holder.holderUserId === req.userId ? new Date() : null, evidence: holder.holderUserId === req.userId ? { method: 'PROPOSAL_AUTHORSHIP' } : undefined })) },
    }, include: { shares: true, decisions: true } });
    for (const holder of decisionHolders.filter(holder => holder.holderUserId !== req.userId)) await createNotification({ user_id: holder.holderUserId!, type: 'RIGHTS_PROPOSAL', category: 'PROJECT', priority: 'HIGH', title: `${data.agreement_type === 'MASTER' ? 'Master' : 'Publishing'} split proposed`, body: `Review your named share for ${project.title}.`, payload: { project_id: project.id, agreement_id: agreement.id }, action_url: holder.holderUserId === project.artist!.user_id ? '/projects' : '/contributions' });
    res.status(201).json(agreement);
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

// ── GET /api/producer/projects/:id/available-sessions — this project's
// artist's unlinked bookings, so the producer can attach an existing session
// retroactively. Booking creation has no project picker yet, so this is
// currently the only way a Booking's project_id ever gets set post-creation.
// A generic "bookings for artist X" endpoint doesn't exist for producers
// (GET /api/bookings is artist/admin/engineer-scoped only) -- scoping this
// tightly to the producer's own project avoids needing one.
producerRouter.get('/projects/:id/available-sessions', requireRole('PRODUCER'), async (req: any, res, next) => {
  try {
    const producer = await db.producer.findUnique({ where: { user_id: req.userId } });
    if (!producer) throw new AppError('Producer not found', 404);

    const project = await db.project.findFirst({ where: { id: req.params.id, producer_id: producer.id } });
    if (!project) throw new AppError('Project not found', 404);
    if (!project.artist_id) return res.json([]);

    const bookings = await db.booking.findMany({
      where: { artist_id: project.artist_id, project_id: null },
      include: { room: true, service: true },
      orderBy: { starts_at: 'desc' },
      take: 20,
    });
    res.json(bookings);
  } catch (err) { next(err); }
});

// ── POST /api/producer/projects/:id/link-booking — attach an existing
// booking to this project. Scoped to the producer's own project and that
// project's artist, so a producer can't link a booking that isn't theirs.
producerRouter.post('/projects/:id/link-booking', requireRole('PRODUCER'), async (req: any, res, next) => {
  try {
    const { booking_id } = z.object({ booking_id: z.string().uuid() }).parse(req.body);

    const producer = await db.producer.findUnique({ where: { user_id: req.userId } });
    if (!producer) throw new AppError('Producer not found', 404);

    const project = await db.project.findFirst({ where: { id: req.params.id, producer_id: producer.id } });
    if (!project) throw new AppError('Project not found', 404);

    const booking = await db.booking.findUnique({ where: { id: booking_id } });
    if (!booking || booking.artist_id !== project.artist_id) {
      throw new AppError("Booking not found for this project's artist", 404);
    }

    const updated = await db.booking.update({
      where: { id: booking_id },
      data: { project_id: project.id },
      include: { room: true, service: true },
    });
    res.json(updated);
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
