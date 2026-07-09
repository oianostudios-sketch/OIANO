// apps/api/src/routes/files.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { isR2Configured, uploadToR2, deleteFromR2 } from '../lib/r2';

export const filesRouter = Router();
filesRouter.use(authenticate);

// ── Multer setup ─────────────────────────────────────────────────────────────
// Memory storage when R2 is configured (buffer → R2).
// Disk storage as fallback for local dev without R2 credentials.
function getMulter() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const multer = require('multer');

    const fileFilter = (_req: any, file: any, cb: any) => {
      const allowed = /audio|video|image|pdf|zip|octet-stream/;
      cb(null, allowed.test(file.mimetype));
    };

    if (isR2Configured) {
      return multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
        fileFilter,
      });
    }

    // Local disk fallback
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    return multer({
      dest: uploadDir,
      limits: { fileSize: 200 * 1024 * 1024 },
      fileFilter,
    });
  } catch {
    return null;
  }
}

// POST /api/artists/:id/files
filesRouter.post('/:id/files', async (req: Request, res: Response, next: NextFunction) => {
  const upload = getMulter();
  if (!upload) {
    return next(new AppError('File upload not configured. Run: npm install multer in apps/api', 501));
  }

  upload.single('file')(req as any, res as any, async (err: any) => {
    if (err) return next(new AppError(err.message ?? 'Upload failed', 400));

    try {
      const userId   = (req as any).userId   as string;
      const artistId = req.params.id;

      const artist = await prisma.artist.findUnique({
        where: { id: artistId },
        include: { user: { select: { id: true } } },
      });
      if (!artist) throw new AppError('Artist not found', 404);

      // Only the artist themselves or admin can upload
      const userRole = (req as any).userRole as string;
      if (userRole === 'ARTIST' && artist.user?.id !== userId) {
        throw new AppError('Forbidden', 403);
      }

      const reqFile = (req as any).file;
      if (!reqFile) throw new AppError('No file provided', 400);

      const folder = (req.body?.folder as string | undefined)?.trim() || null;
      const source = (req.body?.source as string | undefined)?.trim() || null;

      let publicUrl: string;

      if (isR2Configured && reqFile.buffer) {
        // Upload to R2
        publicUrl = await uploadToR2(
          reqFile.buffer,
          `files/${artistId}`,
          reqFile.originalname,
          reqFile.mimetype,
        );
      } else {
        // Local disk fallback
        publicUrl = `/uploads/${reqFile.filename}`;
      }

      const record = await prisma.artistFile.create({
        data: {
          artist_id: artistId,
          name:       reqFile.originalname,
          url:        publicUrl,
          mime_type:  reqFile.mimetype,
          size_bytes: reqFile.size,
          folder,
          source,
        },
      });

      res.status(201).json(record);
    } catch (e) {
      next(e);
    }
  });
});

// DELETE /api/artists/:id/files/:fileId
filesRouter.delete('/:id/files/:fileId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = await prisma.artistFile.findUnique({ where: { id: req.params.fileId } });
    if (!file) throw new AppError('File not found', 404);

    if (file.url.startsWith('http')) {
      // R2 or remote — delete from R2 (no-ops if URL doesn't match configured bucket)
      await deleteFromR2(file.url);
    } else {
      // Local disk
      const uploadDir = path.join(process.cwd(), 'uploads');
      const filename  = file.url.replace('/uploads/', '');
      const filePath  = path.join(uploadDir, filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await prisma.artistFile.delete({ where: { id: file.id } });
    res.json({ success: true });
  } catch (e) { next(e); }
});
