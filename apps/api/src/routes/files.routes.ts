// apps/api/src/routes/files.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { isR2Configured, uploadToR2, deleteFromR2, getFromR2 } from '../lib/r2';
import { issueFileAccessTicket, verifyFileAccessTicket } from '../lib/fileAccessTicket';

export const filesRouter = Router();
// No router-wide authenticate: the /content route below is deliberately
// reached via a plain ticketed URL (window.open/<a>, which can't carry an
// Authorization header) and authenticates via its own ticket instead — same
// split as notifications.routes.ts's /stream-ticket + /stream. Every other
// route in this router applies `authenticate` individually.

// Local-disk fallback files live outside any statically-served directory —
// unlike /uploads (mounted publicly in app.ts for avatars/artwork/tracks,
// which are meant to be public), session/deliverable files are private and
// must only ever be reachable through the ticket-gated /content route below.
const PRIVATE_UPLOAD_DIR = path.join(process.cwd(), 'private-uploads');

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
    if (!fs.existsSync(PRIVATE_UPLOAD_DIR)) fs.mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true });
    return multer({
      dest: PRIVATE_UPLOAD_DIR,
      limits: { fileSize: 200 * 1024 * 1024 },
      fileFilter,
    });
  } catch {
    return null;
  }
}

// POST /api/artists/:id/files
filesRouter.post('/:id/files', authenticate, async (req: Request, res: Response, next: NextFunction) => {
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
        // Local disk fallback — stored under private-uploads/, "local:"-
        // prefixed so it's never confused for a directly-servable path
        publicUrl = `local:${reqFile.filename}`;
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
filesRouter.delete('/:id/files/:fileId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId   = (req as any).userId   as string;
    const userRole = (req as any).userRole as string;
    const artistId = req.params.id;

    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
      include: { user: { select: { id: true } } },
    });
    if (!artist) throw new AppError('Artist not found', 404);

    // Only the artist themselves or a studio admin can delete — same rule as upload
    if (userRole === 'ARTIST' && artist.user?.id !== userId) {
      throw new AppError('Forbidden', 403);
    }
    if (userRole !== 'ARTIST' && userRole !== 'STUDIO_ADMIN') {
      throw new AppError('Forbidden', 403);
    }

    const file = await prisma.artistFile.findUnique({ where: { id: req.params.fileId } });
    if (!file || file.artist_id !== artistId) throw new AppError('File not found', 404);

    if (file.url.startsWith('http')) {
      // R2 or remote — delete from R2 (no-ops if URL doesn't match configured bucket)
      await deleteFromR2(file.url);
    } else {
      // Local disk
      const filename = file.url.replace(/^local:/, '');
      const filePath = path.join(PRIVATE_UPLOAD_DIR, filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await prisma.artistFile.delete({ where: { id: file.id } });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// POST /api/artists/:id/files/:fileId/access-ticket
// Issues a short-lived, file-scoped ticket. The stored file location (R2
// bucket URL or local disk path) is never sent to the client — only this
// ticket, which is redeemed against the /content route below.
filesRouter.post('/:id/files/:fileId/access-ticket', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId   = (req as any).userId   as string;
    const userRole = (req as any).userRole as string;
    const artistId = req.params.id;

    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
      include: { user: { select: { id: true } } },
    });
    if (!artist) throw new AppError('Artist not found', 404);

    if (userRole === 'ARTIST' && artist.user?.id !== userId) {
      throw new AppError('Forbidden', 403);
    }
    if (userRole !== 'ARTIST' && userRole !== 'STUDIO_ADMIN' && userRole !== 'ENGINEER') {
      throw new AppError('Forbidden', 403);
    }

    const file = await prisma.artistFile.findUnique({ where: { id: req.params.fileId } });
    if (!file || file.artist_id !== artistId) throw new AppError('File not found', 404);

    res.setHeader('Cache-Control', 'no-store');
    res.json({ ticket: issueFileAccessTicket(userId, file.id), expiresInSeconds: 60 });
  } catch (e) { next(e); }
});

// GET /api/artists/:id/files/:fileId/content?ticket=<short-lived-ticket>
// Streams the file through the API instead of ever exposing the R2 bucket
// URL or local disk path to the client — this is the fix for files being
// reachable via a bare, permanent, unauthenticated URL.
filesRouter.get('/:id/files/:fileId/content', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fileId = req.params.fileId;
    const ticket = req.query.ticket as string | undefined;
    if (!ticket) throw new AppError('Missing access ticket', 401);
    verifyFileAccessTicket(ticket, fileId);

    const file = await prisma.artistFile.findUnique({ where: { id: fileId } });
    if (!file || file.artist_id !== req.params.id) throw new AppError('File not found', 404);

    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);

    if (file.url.startsWith('http')) {
      const { body, contentType } = await getFromR2(file.url);
      if (contentType) res.setHeader('Content-Type', contentType);
      (body as any).pipe(res);
    } else {
      const filename = file.url.replace(/^local:/, '');
      const filePath = path.join(PRIVATE_UPLOAD_DIR, filename);
      if (!fs.existsSync(filePath)) throw new AppError('File not found', 404);
      if (file.mime_type) res.setHeader('Content-Type', file.mime_type);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (e) { next(e); }
});
