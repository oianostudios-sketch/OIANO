import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { emitActivityEvent } from '../lib/activityEvents';
import { computeArtistTier } from '../lib/artistTier';
import { publishArtistStatus } from '../services/liveUpdates';
import { writeAdminAudit } from '../lib/adminAudit';
import { resolveStaffStudio } from '../middleware/studioScope.middleware';
import { isAiEnabled } from '../intelligence/config';

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

    // Pushed live so staff see who's available without a poll: staff at the
    // studios this artist has booked with, not every studio (A01).
    await publishArtistStatus(artist, status);

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

    // Every admin at every studio an artist has booked reads this row, so it carries the
    // public profile, with the artist's privacy choices applied, plus the account email a
    // studio uses to reach its own customer. No wallet: it holds the artist's money from
    // every studio they work with (owner decision, 2026-09-15).
    const [artists, total] = await Promise.all([
      prisma.artist.findMany({
        where,
        select: { ...publicArtistSelect, user: { select: { email: true, created_at: true } } },
        orderBy: { created_at: 'desc' },
        take,
        skip,
      }),
      prisma.artist.count({ where }),
    ]);
    const data = artists.map((artist) => ({
      ...publicArtistProfile(artist),
      user: { email: artist.user.email, created_at: artist.user.created_at },
    }));
    res.json({ data, total, page, limit: take, hasMore: skip + take < total });
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

// What any signed-in account may read about an artist. Signup is open and discovery hands
// out artist ids, so this is public in practice. Fields are listed here rather than
// inherited from the row, and publicArtistProfile() applies the artist's privacy choices.
// Session logs, the wallet, bookings, files and the account id are not public.
const publicArtistSelect = {
  id: true, name: true, alias: true, bio: true, avatar_url: true, status: true, created_at: true,
  user: { select: { created_at: true } },
  passport: {
    select: {
      passport_code: true, creative_dna: true, profile_strength: true, profile_image_url: true, bio: true,
      ai_summary: true, ai_summary_public: true, location: true, location_public: true,
      social_links: true, collaboration_interests: true,
    },
  },
} satisfies Prisma.ArtistSelect;

function publicArtistProfile(artist: Prisma.ArtistGetPayload<{ select: typeof publicArtistSelect }>) {
  const { passport } = artist;
  return {
    id: artist.id, name: artist.name, alias: artist.alias, bio: artist.bio,
    avatar_url: artist.avatar_url, status: artist.status, created_at: artist.created_at,
    user: { created_at: artist.user.created_at },
    passport: passport && {
      passport_code: passport.passport_code,
      creative_dna: passport.creative_dna,
      profile_strength: passport.profile_strength,
      profile_image_url: passport.profile_image_url,
      bio: passport.bio,
      ai_summary: passport.ai_summary_public ? passport.ai_summary : null,
      location: passport.location_public ? passport.location : null,
      social_links: passport.social_links,
      collaboration_interests: passport.collaboration_interests,
    },
  };
}

// No view is counted here. GET /api/passport/public/:code counts unique visitors a day
// through PassportView; this route used to add one per signed-in read to the same column.
artistsRouter.get('/:id', async (req: any, res, next) => {
  try {
    const userId   = req.userId   as string;
    const userRole = req.userRole as string;

    const artist = await prisma.artist.findUnique({
      where: { id: req.params.id },
      select: { ...publicArtistSelect, user_id: true },
    });
    if (!artist) throw new AppError('Artist not found', 404);

    // The artist reads their whole record.
    if (artist.user_id === userId) {
      const record = await prisma.artist.findUnique({
        where: { id: artist.id },
        include: {
          passport: true,
          wallet: true,
          bookings: { include: { room: true, service: true, engineer: { select: { id: true, name: true } } }, orderBy: { starts_at: 'desc' }, take: 50 },
          session_logs: { orderBy: { started_at: 'desc' }, take: 10 },
          files: { orderBy: { uploaded_at: 'desc' }, take: 20 },
          user: { select: { id: true, created_at: true } },
        },
      });
      if (!record) throw new AppError('Artist not found', 404);
      return res.json({ ...record, tier: await computeArtistTier(artist.id) });
    }

    // A studio admin reads the public profile plus their own studio's side of the
    // relationship: its bookings with the artist, those sessions' logs, and the artist's
    // files, which the files routes already open to them. Not the wallet, which holds the
    // artist's money for every studio they work with.
    if (userRole === 'STUDIO_ADMIN') {
      const studio = await resolveStaffStudio(userId);
      const atStudio = { studio_id: studio.id };
      const relationship = await prisma.artist.findFirst({
        where: { id: artist.id, bookings: { some: atStudio } },
        select: {
          bookings: { where: atStudio, include: { room: true, service: true, engineer: { select: { id: true, name: true } } }, orderBy: { starts_at: 'desc' }, take: 50 },
          session_logs: { where: { booking: atStudio }, orderBy: { started_at: 'desc' }, take: 10 },
          files: { orderBy: { uploaded_at: 'desc' }, take: 20 },
        },
      });
      if (!relationship) throw new AppError('Artist not found', 404);
      return res.json({ ...publicArtistProfile(artist), ...relationship, tier: await computeArtistTier(artist.id) });
    }

    res.json({ ...publicArtistProfile(artist), tier: await computeArtistTier(artist.id) });
  } catch (err) { next(err); }
});

// GET /api/artists/:id/summary -- AI-generated brief (cached on Passport)
import { generateArtistSummary } from '../services/ai-summary.service';

// Besides the artist, the brief is read by staff at a studio the artist has booked: an
// admin there, or an engineer assigned to one of those bookings. The same people may read
// the artist's files (assertArtistFileAccess in files.routes.ts).
async function worksWithArtist(artistId: string, userId: string, userRole: string) {
  if (userRole !== 'STUDIO_ADMIN' && userRole !== 'ENGINEER') return false;
  const studio = await resolveStaffStudio(userId);
  const booking = await prisma.booking.findFirst({
    where: {
      artist_id: artistId,
      studio_id: studio.id,
      ...(userRole === 'ENGINEER' ? { engineer: { user_id: userId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(booking);
}

artistsRouter.get('/:id/summary', async (req: any, res, next) => {
  try {
    const artist = await prisma.artist.findUnique({
      where: { id: req.params.id },
      include: { passport: true, session_logs: true },
    });
    if (!artist) throw new AppError('Artist not found', 404);

    // Any account could make the model write about any artist, store the result on their
    // passport, and read a brief the artist had hidden.
    const isOwner = artist.user_id === req.userId;
    if (!isOwner && !(await worksWithArtist(artist.id, req.userId, req.userRole))) {
      throw new AppError('Only the artist and the studios they work with can read this brief', 403);
    }
    if (!isOwner && artist.passport?.ai_summary_public === false) {
      throw new AppError('The artist keeps their brief private', 403);
    }
    // An AI capability like the others: off unless OIANO_AI_ENABLED is on.
    if (!isAiEnabled()) throw new AppError('AI briefs are not enabled', 501);

    const passport = artist.passport;

    // A stored brief stands until the artist changes it, whoever wrote it, and one the artist
    // emptied counts as none. It used to be served only while newer than passport.updated_at,
    // which every write to the passport moves, storing the brief included, so each request
    // paid the model again and replaced the artist's edit.
    if (passport?.ai_summary) {
      return res.json({ artist_id: artist.id, summary: passport.ai_summary, cached: true });
    }

    // Generate fresh summary
    const summary = await generateArtistSummary(artist);

    // Stored only while the passport still has no brief, so an edit saved while the model was
    // writing is kept, and awaited, so the next request finds it. A failed write still answers.
    // generateArtistSummary says 'Summary unavailable.' when the model sent no text; that is
    // not a brief, and once stored it would stand.
    if (passport && summary !== 'Summary unavailable.') {
      await prisma.artistPassport.updateMany({
        where: { artist_id: artist.id, OR: [{ ai_summary: null }, { ai_summary: '' }] },
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
