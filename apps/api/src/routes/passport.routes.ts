import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import type { ArtistPassport } from '@prisma/client';
import { isR2Configured, uploadToR2, deleteFromR2 } from '../lib/r2';
import { getImageUpload } from '../lib/imageUpload';

function calcProfileStrength(
  passport: ArtistPassport,
  artistBio?: string | null,
  artistAvatar?: string | null,
): number {
  const dna = (passport.creative_dna ?? {}) as Record<string, any>;
  const fields = [
    artistBio,           // artist.bio
    artistAvatar,        // artist.avatar_url
    dna.genres?.length,  // creative_dna.genres non-empty
    dna.vocal_type,
    dna.energy_profile,
    dna.key_themes?.length,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}

export const passportRouter = Router();
passportRouter.use(authenticate);

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

passportRouter.patch('/profile', async (req: any, res, next) => {
  try {
    const artist = await prisma.artist.findUnique({ where: { user_id: req.userId } });
    if (!artist) throw new AppError('Artist not found', 404);
    const { creative_dna, ...artistFields } = req.body;
    if (creative_dna) {
      await prisma.artistPassport.update({ where: { artist_id: artist.id }, data: { creative_dna } });
    }
    const allowedFields = ['name', 'alias', 'bio', 'avatar_url'];
    const safeFields = Object.fromEntries(
      Object.entries(artistFields).filter(([k]) => allowedFields.includes(k))
    );
    if (Object.keys(safeFields).length > 0) {
      await prisma.artist.update({ where: { id: artist.id }, data: safeFields });
    }
    const updated = await prisma.artist.findUnique({
      where: { id: artist.id },
      include: { passport: true },
    });

    // Recalculate profile strength after any profile update
    if (updated?.passport) {
      const strength = calcProfileStrength(updated.passport, updated.bio, updated.avatar_url);
      await prisma.artistPassport.update({
        where: { artist_id: artist.id },
        data: { profile_strength: strength },
      });
      updated.passport.profile_strength = strength;
    }

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

      // Recalculate strength with new avatar
      if (updated.passport) {
        const strength = calcProfileStrength(updated.passport, updated.bio, publicUrl);
        await prisma.artistPassport.update({
          where: { artist_id: artist.id },
          data: { profile_strength: strength },
        });
      }

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
