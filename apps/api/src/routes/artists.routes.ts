import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { emitActivityEvent } from '../lib/activityEvents';
import { computeArtistTier } from '../lib/artistTier';
import { broadcastAll } from './notifications.routes';
import { writeAdminAudit } from '../lib/adminAudit';
import { resolveStaffStudio } from '../middleware/studioScope.middleware';

export const artistsRouter = Router();
artistsRouter.use(authenticate);

// PATCH /api/artists/me/status — one-tap availability toggle
const StatusSchema = z.object({
  status: z.enum(['AVAILABLE_FOR_BOOKING', 'IN_SESSION', 'UNAVAILABLE']),
});

artistsRouter.patch('/me/status', requireRole('ARTIST'), async (req: any, res, next) => {
  try {
    const artist = await prisma.artist.findUnique({ where: { user_id: req.userId } });
    if (!artist) throw new AppError('Artist profile not found', 404);

    const { status } = StatusSchema.parse(req.body);
    const updated = await prisma.artist.update({ where: { id: artist.id }, data: { status } });

    await emitActivityEvent('status.changed', { artist_id: artist.id, status });

    // Was written to ActivityEvent but never pushed live -- studio-wide since
    // admin/engineer dashboards want to see "who's available" without a poll.
    broadcastAll({
      type: 'artist_status_changed',
      artistId: artist.id,
      artistName: artist.name,
      status,
    });

    res.json({ status: updated.status });
  } catch (err) { next(err); }
});

artistsRouter.get('/', requireRole('STUDIO_ADMIN'), async (req, res, next) => {
  try {
    const studio = await resolveStaffStudio((req as any).userId);
    const take = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '100'))));
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')));
    const skip = (page - 1) * take;

    // ART-05: search by name, alias, or account email. Case-insensitive,
    // substring match — clearing the query (empty/absent `q`) restores the
    // full roster since the where-clause is only added when q is present.
    const q = (req.query.q as string | undefined)?.trim();
    const where = {
      bookings: { some: { studio_id: studio.id } },
      ...(q ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { alias: { contains: q, mode: 'insensitive' as const } },
            { user: { email: { contains: q, mode: 'insensitive' as const } } },
          ],
      } : {}),
    };

    const [artists, total] = await Promise.all([
      prisma.artist.findMany({
        where,
        include: { passport: true, wallet: true, user: { select: { email: true, created_at: true } } },
        orderBy: { created_at: 'desc' },
        take,
        skip,
      }),
      prisma.artist.count({ where }),
    ]);
    res.json({ data: artists, total, page, limit: take, hasMore: skip + take < total });
  } catch (err) { next(err); }
});

// DELETE /api/artists/:id — ART-04. Deliberately conservative: only allows
// deleting artists with zero booking/session/file history (the real-world
// use case is cleaning up a duplicate/mistaken signup, not offboarding a
// customer with financial history). Anyone with real activity is refused
// with a clear 409 rather than either silently orphaning records or
// cascading through payments/ledger entries — a buggy financial cascade
// would be a far worse bug than the missing delete button.
artistsRouter.delete('/:id', requireRole('STUDIO_ADMIN'), async (req: any, res, next) => {
  try {
    const studio = await resolveStaffStudio(req.userId);
    const artist = await prisma.artist.findFirst({
      where: { id: req.params.id, bookings: { some: { studio_id: studio.id } } },
      include: {
        user: { select: { id: true, email: true } },
        _count: { select: { bookings: true, files: true, session_logs: true, releases: true } },
      },
    });
    if (!artist) throw new AppError('Artist not found', 404);

    const { bookings, files, session_logs, releases } = artist._count;
    if (bookings > 0 || files > 0 || session_logs > 0 || releases > 0) {
      throw new AppError(
        `Cannot delete ${artist.name} — this account has ${bookings} booking(s), ${files} file(s), ` +
        `${session_logs} session log(s), and ${releases} release(s). Deleting would either destroy ` +
        `real studio/financial history or orphan records. Set their status instead, or contact support ` +
        `for accounts that genuinely need to be removed.`,
        409,
      );
    }

    await prisma.$transaction([
      prisma.studioCircleMember.deleteMany({ where: { artist_id: artist.id } }),
      prisma.artistPassport.delete({ where: { artist_id: artist.id } }),
      prisma.wallet.delete({ where: { artist_id: artist.id } }),
      prisma.artist.delete({ where: { id: artist.id } }),
      prisma.user.delete({ where: { id: artist.user.id } }),
    ]);

    await writeAdminAudit(req.userId, 'artist.deleted', req, { artist_id: artist.id, artist_name: artist.name, email: artist.user.email });

    res.json({ success: true });
  } catch (err) { next(err); }
});

artistsRouter.get('/:id', async (req: any, res, next) => {
  try {
    const userId   = req.userId   as string;
    const userRole = req.userRole as string;

    const artist = await prisma.artist.findUnique({
      where: { id: req.params.id },
      include: {
        passport: true,
        wallet: true,
        bookings: { include: { room: true, service: true, engineer: { select: { id: true, name: true } } }, orderBy: { starts_at: 'desc' }, take: 50 },
        session_logs: { orderBy: { started_at: 'desc' }, take: 10 },
        files: { orderBy: { uploaded_at: 'desc' }, take: 20 },
        user: { select: { id: true, created_at: true } },
      },
    });
    if (!artist) throw new AppError('Artist not found', 404);

    const isOwner = artist.user?.id === userId;
    const isAdmin = userRole === 'STUDIO_ADMIN';

    if (isAdmin) {
      const studio = await resolveStaffStudio(userId);
      if (!artist.bookings.some((booking) => booking.studio_id === studio.id)) {
        throw new AppError('Artist not found', 404);
      }
    }

    // Increment profile_views for non-owner viewers (fire-and-forget)
    if (!isOwner && artist.passport) {
      prisma.artistPassport.update({
        where: { artist_id: artist.id },
        data:  { profile_views: { increment: 1 } },
      }).catch(() => {}); // non-fatal
    }

    const tier = await computeArtistTier(artist.id);

    // Non-admin artists viewing someone else's profile get a redacted response
    if (!isOwner && !isAdmin) {
      const { wallet, bookings, files, ...publicFields } = artist as any;
      // Also hide AI brief if artist marked it private
      if (publicFields.passport && !publicFields.passport.ai_summary_public) {
        publicFields.passport = { ...publicFields.passport, ai_summary: null };
      }
      return res.json({ ...publicFields, tier });
    }

    res.json({ ...artist, tier });
  } catch (err) { next(err); }
});

// GET /api/artists/:id/summary -- AI-generated brief (cached on Passport)
import { generateArtistSummary } from '../services/ai-summary.service';

artistsRouter.get('/:id/summary', async (req, res, next) => {
  try {
    const artist = await prisma.artist.findUnique({
      where: { id: req.params.id },
      include: { passport: true, session_logs: true },
    });
    if (!artist) throw new AppError('Artist not found', 404);

    const passport = artist.passport;
    const profileUpdated = (passport as any)?.updated_at ?? new Date(0);
    const summaryAge     = (passport as any)?.ai_summary_updated_at ?? new Date(0);

    // Serve cache if summary exists and was generated after last profile update
    if (passport?.ai_summary && summaryAge > profileUpdated) {
      return res.json({ artist_id: artist.id, summary: passport.ai_summary, cached: true });
    }

    // Generate fresh summary
    const summary = await generateArtistSummary(artist as any);

    // Persist to passport (non-blocking -- don't let a DB write fail the response)
    if (passport) {
      prisma.artistPassport.update({
        where: { artist_id: artist.id },
        data: {
          ai_summary:            summary,
          ai_summary_updated_at: new Date(),
          ai_summary_edited:     false,
        },
      }).catch(() => { /* ignore cache write errors */ });
    }

    res.json({ artist_id: artist.id, summary });
  } catch (err) { next(err); }
});
