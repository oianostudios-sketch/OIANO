// apps/api/src/routes/files.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { isR2Configured, uploadPrivateToR2, deleteFromR2, getFromR2, getPresignedUploadUrl, headObjectR2, deleteObjectByKey } from '../lib/r2';
import { issueFileAccessTicket, verifyFileAccessTicket } from '../lib/fileAccessTicket';
import { resolveStaffStudio } from '../middleware/studioScope.middleware';

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // matches the multer route's existing cap

const ALLOWED_PRIVATE_MIME = /^(audio\/|video\/|image\/(?!svg\+xml$)|application\/(pdf|zip|octet-stream)$)/i;

async function assertArtistFileAccess(artistId: string, userId: string, userRole: string, mode: 'manage' | 'read') {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    include: { user: { select: { id: true } } },
  });
  if (!artist) throw new AppError('Artist not found', 404);
  if (userRole === 'ARTIST') {
    if (artist.user?.id !== userId) throw new AppError('Forbidden', 403);
    return artist;
  }
  if (userRole !== 'STUDIO_ADMIN' && !(mode === 'read' && userRole === 'ENGINEER')) throw new AppError('Forbidden', 403);

  const studio = await resolveStaffStudio(userId);
  const relationship = await prisma.booking.findFirst({
    where: {
      artist_id: artistId,
      studio_id: studio.id,
      ...(userRole === 'ENGINEER' ? { engineer: { user_id: userId } } : {}),
    },
    select: { id: true },
  });
  if (!relationship) throw new AppError('Forbidden', 403);
  return artist;
}

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
      cb(null, ALLOWED_PRIVATE_MIME.test(file.mimetype));
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

      const userRole = (req as any).userRole as string;
      await assertArtistFileAccess(artistId, userId, userRole, 'manage');

      const reqFile = (req as any).file;
      if (!reqFile) throw new AppError('No file provided', 400);

      const folder = (req.body?.folder as string | undefined)?.trim() || null;
      const source = (req.body?.source as string | undefined)?.trim() || null;

      let publicUrl: string;

      if (isR2Configured && reqFile.buffer) {
        // Upload to R2
        publicUrl = await uploadPrivateToR2(
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

// POST /api/artists/:id/files/presign
// Step 1 of the direct-to-R2 upload flow (SCALE_READINESS_ROADMAP.md Tier
// 0.3): returns a short-lived presigned PUT URL the browser uploads straight
// to, so the file's bytes never transit this process. Falls back to the
// buffered /files route (above) when R2 isn't configured — presigned URLs
// don't exist for the local-disk dev path, and don't need to; disk storage
// was never the memory-buffering risk this fixes.
filesRouter.post('/:id/files/presign', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isR2Configured) throw new AppError('R2 is not configured', 501);

    const userId = (req as any).userId as string;
    const userRole = (req as any).userRole as string;
    const artistId = req.params.id;
    await assertArtistFileAccess(artistId, userId, userRole, 'manage');

    const body = z.object({
      filename: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(255),
      sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
    }).parse(req.body);
    if (!ALLOWED_PRIVATE_MIME.test(body.mimeType)) throw new AppError('Unsupported file type', 400);

    const ext = path.extname(body.filename) || '';
    const uid = crypto.randomBytes(8).toString('hex');
    const key = `files/${artistId}/${Date.now()}-${uid}${ext}`;

    const { uploadUrl, expiresInSeconds } = await getPresignedUploadUrl(key, body.mimeType);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ uploadUrl, key, expiresInSeconds });
  } catch (e) { next(e); }
});

// POST /api/artists/:id/files/complete
// Step 2: called after the browser's direct PUT to `uploadUrl` succeeds.
// Never trusts the client's claim that the upload happened — HEADs the
// object in R2 first, and rejects (deleting the stray object) if it's
// missing or larger than what was authorized at presign time.
filesRouter.post('/:id/files/complete', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isR2Configured) throw new AppError('R2 is not configured', 501);

    const userId = (req as any).userId as string;
    const userRole = (req as any).userRole as string;
    const artistId = req.params.id;
    await assertArtistFileAccess(artistId, userId, userRole, 'manage');

    const body = z.object({
      key: z.string().min(1),
      name: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(255),
      folder: z.string().max(255).optional(),
      source: z.string().max(255).optional(),
    }).parse(req.body);

    if (!body.key.startsWith(`files/${artistId}/`)) throw new AppError('Invalid file key', 400);

    const head = await headObjectR2(body.key);
    if (!head) throw new AppError('Upload not found — it may not have completed', 400);
    if (head.sizeBytes > MAX_UPLOAD_BYTES) {
      await deleteObjectByKey(body.key);
      throw new AppError('File exceeds the maximum allowed size', 413);
    }

    const verifiedMime = head.contentType ?? body.mimeType;
    if (!ALLOWED_PRIVATE_MIME.test(verifiedMime)) {
      await deleteObjectByKey(body.key);
      throw new AppError('Unsupported file type', 400);
    }
    const publicUrl = `r2:${body.key}`;
    const record = await prisma.artistFile.create({
      data: {
        artist_id: artistId,
        name: body.name,
        url: publicUrl,
        mime_type: verifiedMime,
        size_bytes: head.sizeBytes,
        folder: body.folder ?? null,
        source: body.source ?? null,
      },
    });

    res.status(201).json(record);
  } catch (e) { next(e); }
});

// DELETE /api/artists/:id/files/:fileId
filesRouter.delete('/:id/files/:fileId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId   = (req as any).userId   as string;
    const userRole = (req as any).userRole as string;
    const artistId = req.params.id;

    await assertArtistFileAccess(artistId, userId, userRole, 'manage');

    const file = await prisma.artistFile.findUnique({ where: { id: req.params.fileId } });
    if (!file || file.artist_id !== artistId) throw new AppError('File not found', 404);

    if (file.url.startsWith('http') || file.url.startsWith('r2:')) {
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

    await assertArtistFileAccess(artistId, userId, userRole, 'read');

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
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);

    if (file.url.startsWith('http') || file.url.startsWith('r2:')) {
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
