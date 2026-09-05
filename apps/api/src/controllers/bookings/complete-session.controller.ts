import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { broadcastAll, broadcastToUser, createNotification } from '../../routes/notifications.routes';
import { sendSessionComplete } from '../../services/email.service';
import { resolveStaffStudio } from '../../middleware/studioScope.middleware';
import { recordBookingCompleted } from '../../lib/bookingCompletion';
import { upsertSessionLog } from '../../lib/sessionLog';

// POST /api/bookings/:id/complete — the session completion screen.
// Single entry point that replaces the old "flip status, then separately
// deliver files, then separately add notes" scatter across pages. Collects
// deliverables, credits, rights, and session notes in one atomic submit, and
// enforces the privacy ceiling: nothing submitted here can become publicly
// visible — PASSPORT_PUBLIC on a deliverable and is_public on a credit are
// never accepted from this endpoint, only ever set later by the artist/
// project owner on their own surface.
const CreditRoleEnum = z.enum([
  'FEATURED_ARTIST', 'PRODUCER', 'ENGINEER', 'SONGWRITER', 'COMPOSER',
  'MIX_ENGINEER', 'MASTERING_ENGINEER', 'MANAGER', 'OTHER',
]);

const CompleteSessionSchema = z.object({
  deliverables: z.object({
    file_urls: z.array(z.string().url()).min(1, 'At least one file URL is required'),
    title: z.string().trim().min(1).max(160).optional(),
    notes: z.string().trim().max(2000).optional(),
    visibility: z.enum(['PRIVATE', 'STUDIO_ONLY']).optional().default('STUDIO_ONLY'),
  }).optional(),
  credits: z.array(z.object({
    credited_name: z.string().trim().min(1).max(120),
    role: CreditRoleEnum,
    scope: z.string().trim().max(160).optional(),
    participant_id: z.string().optional(),
  })).max(20).optional(),
  rights: z.object({
    agreement_type: z.enum(['MASTER', 'PUBLISHING']),
    shares: z.array(z.object({
      holder_name: z.string().trim().min(1).max(120),
      holder_type: z.enum(['ARTIST', 'PRODUCER', 'PARTICIPANT', 'COMPANY']),
      holder_ref_id: z.string().optional(),
      role: z.string().trim().min(1).max(80),
      percentage: z.number().positive().max(100),
    })).min(2).max(20),
  }).refine(
    (value) => Math.abs(value.shares.reduce((sum, s) => sum + s.percentage, 0) - 100) < 0.01,
    { message: 'Shares must sum to 100%', path: ['shares'] },
  ).optional(),
  session_notes: z.object({
    notes: z.string().trim().max(4000).optional(),
    quality_rating: z.number().int().min(1).max(5).optional(),
    tracks_worked: z.array(z.string().trim().min(1)).optional(),
  }).optional(),
}).strict();

export async function completeSession(req: Request, res: Response, next: NextFunction) {
  try {
    const data = CompleteSessionSchema.parse(req.body);
    const userId = (req as any).userId as string;
    const idempotencyKey = req.get('Idempotency-Key')?.trim();
    if (!idempotencyKey || idempotencyKey.length > 128) {
      throw new AppError('A valid Idempotency-Key header is required', 400);
    }
    const studio = await resolveStaffStudio(userId);

    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, studio_id: studio.id },
      include: {
        artist: { include: { user: { select: { id: true, email: true } } } },
        service: { select: { name: true } },
        room: { select: { name: true } },
        project: { select: {
          id: true,
          producer: { select: { id: true, user_id: true } },
          participants: {
            where: { status: 'ACTIVE', participant_ref_id: { not: null } },
            select: { id: true, participant_ref_id: true },
          },
        } },
      },
    });
    if (!booking) throw new AppError('Booking not found', 404);
    if (['CANCELLED', 'NO_SHOW'].includes(booking.status)) {
      throw new AppError(`Cannot complete a ${booking.status} booking`, 409);
    }
    if ((data.credits?.length || data.rights) && !booking.project_id) {
      throw new AppError('Credits and rights can only be recorded on a booking linked to a project', 400);
    }

    const normalizedRightsShares = data.rights?.shares.map((share) => {
      let holderUserId: string | null = null;
      if (share.holder_type === 'ARTIST' && share.holder_ref_id === booking.artist_id) {
        holderUserId = booking.artist?.user_id ?? null;
      }
      if (share.holder_type === 'PRODUCER' && share.holder_ref_id === booking.project?.producer.id) {
        holderUserId = booking.project?.producer.user_id ?? null;
      }
      if (share.holder_type === 'PARTICIPANT' && share.holder_ref_id) {
        holderUserId = booking.project?.participants.find(participant => participant.id === share.holder_ref_id)?.participant_ref_id ?? null;
      }
      return { ...share, holder_ref_id: holderUserId ?? share.holder_ref_id, holderUserId };
    }) ?? [];
    if (data.rights && normalizedRightsShares.some(share => !share.holderUserId)) {
      throw new AppError('Every rights holder must be linked to an accepted OIANO identity before this proposal can be sent', 400);
    }

    const participantIds = [...new Set(data.credits?.flatMap((credit) => credit.participant_id ? [credit.participant_id] : []) ?? [])];
    if (participantIds.length && booking.project_id) {
      const validParticipantCount = await prisma.projectParticipant.count({
        where: { id: { in: participantIds }, project_id: booking.project_id },
      });
      if (validParticipantCount !== participantIds.length) {
        throw new AppError('One or more credit participants do not belong to this project', 400);
      }
    }

    const previousRequest = await prisma.sessionCompletionRequest.findUnique({
      where: { booking_id_idempotency_key: { booking_id: booking.id, idempotency_key: idempotencyKey } },
    });
    if (previousRequest) return res.json(previousRequest.response);

    const wasAlreadyCompleted = booking.status === 'COMPLETED';

    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
      // Reserving the key in the same transaction as every state change gives
      // retries exactly-once semantics. A concurrent request with the same key
      // waits on this unique row and then replays the stored response below.
      await tx.sessionCompletionRequest.create({
        data: { booking_id: booking.id, idempotency_key: idempotencyKey, response: {} },
      });

      const updatedBooking = await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'COMPLETED' },
      });

      await upsertSessionLog(booking, { ...data.session_notes, ended_at: new Date() }, tx);

      let deliverable = null;
      if (data.deliverables) {
        const { file_urls, title, notes, visibility } = data.deliverables;
        const existingDeliverable = await tx.deliverable.findFirst({
          where: { booking_id: booking.id },
          orderBy: { created_at: 'asc' },
        });
        if (!existingDeliverable) {
          deliverable = await tx.deliverable.create({
            data: {
              booking_id: booking.id,
              title: title ?? `${booking.service?.name ?? 'Session'} files`,
              status: 'PENDING_REVIEW',
              visibility,
              current_version: 1,
              review_due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              created_by: userId,
              versions: { create: { version_number: 1, file_urls, notes, created_by: userId } },
            },
            include: { versions: true },
          });
        } else {
          const nextVersion = existingDeliverable.current_version + 1;
          deliverable = await tx.deliverable.update({
            where: { id: existingDeliverable.id },
            data: {
              current_version: nextVersion,
              status: 'PENDING_REVIEW',
              visibility,
              reviewed_at: null,
              review_due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              versions: { create: { version_number: nextVersion, file_urls, notes, created_by: userId } },
            },
            include: { versions: { orderBy: { version_number: 'desc' } } },
          });
        }
      }

      let credits: Prisma.ProjectCreditGetPayload<{}>[] = [];
      if (data.credits?.length && booking.project_id) {
        credits = await Promise.all(data.credits.map((credit) =>
          tx.projectCredit.create({
            data: {
              project_id: booking.project_id!,
              credited_name: credit.credited_name,
              role: credit.role,
              scope: credit.scope,
              participant_id: credit.participant_id,
              status: 'DRAFT',
              is_public: false,
              added_by: userId,
            },
          }),
        ));
      }

      let rightsAgreement = null;
      if (data.rights && booking.project_id) {
        const decisionHolders = normalizedRightsShares
          .filter((holder, index, all) => all.findIndex((item) => item.holderUserId === holder.holderUserId) === index);

        rightsAgreement = await tx.rightsAgreement.create({
          data: {
            project_id: booking.project_id,
            agreement_type: data.rights.agreement_type,
            title: `${data.rights.agreement_type === 'MASTER' ? 'Master' : 'Publishing'} split — ${booking.service?.name ?? 'session'}`,
            status: 'PROPOSED',
            created_by: userId,
            shares: { create: normalizedRightsShares.map(({ holderUserId: _holderUserId, ...share }) => share) },
            decisions: {
              create: decisionHolders.map((holder) => ({
                holder_user_id: holder.holderUserId!,
                holder_name: holder.holder_name,
                status: 'PENDING',
              })),
            },
          },
          include: { shares: true, decisions: true },
        });
      }

      const response = { updatedBooking, deliverable, credits, rightsAgreement };
      const storedResponse = JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue;
      await tx.sessionCompletionRequest.update({
        where: { booking_id_idempotency_key: { booking_id: booking.id, idempotency_key: idempotencyKey } },
        data: { response: storedResponse },
      });
      return response;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const replay = await prisma.sessionCompletionRequest.findUnique({
          where: { booking_id_idempotency_key: { booking_id: booking.id, idempotency_key: idempotencyKey } },
        });
        if (replay) return res.json(replay.response);
      }
      throw err;
    }

    // Side effects only fire for genuinely new state — a re-submit against an
    // already-COMPLETED booking must not re-notify the artist that their
    // session is complete a second time.
    if (!wasAlreadyCompleted) {
      void recordBookingCompleted(booking);

      if (booking.project_id) {
        (prisma as any).project.update({
          where: { id: booking.project_id },
          data: { last_session_at: new Date() },
        }).catch(() => {});
      }

      if (booking.artist?.user_id) {
        broadcastToUser(booking.artist.user_id, { type: 'booking_updated', bookingId: booking.id, status: 'COMPLETED' });
      }
      broadcastAll({ type: 'booking_updated', bookingId: booking.id, status: 'COMPLETED' });

      const startsLabel = booking.starts_at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (booking.artist?.user_id) {
        createNotification({
          user_id: booking.artist.user_id,
          type: 'booking_completed',
          title: 'Session complete',
          body: `Your session on ${startsLabel} is marked complete. Check your profile.`,
          payload: { booking_id: booking.id },
        }).catch(() => {});
      }

      const artistEmail = booking.artist?.user?.email;
      if (artistEmail) {
        sendSessionComplete({
          to: artistEmail,
          artistName: booking.artist?.name ?? 'Artist',
          service: booking.service?.name ?? 'Session',
          startsAt: booking.starts_at.toISOString(),
          endsAt: booking.ends_at.toISOString(),
          bookingId: booking.id,
          totalUsd: Number(booking.total_usd ?? 0),
        }).catch((e) => console.error('[email] complete failed:', e?.message));
      }
    }

    // Deliverable, credit, and rights notifications fire on every submit that
    // includes them — each represents genuinely new content, first-time or not.
    if (data.deliverables && booking.artist?.user_id) {
      prisma.notification.create({
        data: {
          user_id: booking.artist.user_id,
          title: 'Your session files are ready',
          body: `${data.deliverables.file_urls.length} file${data.deliverables.file_urls.length > 1 ? 's' : ''} delivered for your ${booking.service?.name ?? 'session'}.`,
          type: 'SESSION_DELIVERED',
        },
      }).catch((e) => console.error('[notification] session delivery failed:', e?.message));
      broadcastToUser(booking.artist.user_id, { type: 'session_delivered', bookingId: booking.id });
    }

    if (data.credits?.length && booking.artist?.user_id) {
      prisma.notification.create({
        data: {
          user_id: booking.artist.user_id,
          title: 'New credits proposed',
          body: `${data.credits.length} credit${data.credits.length > 1 ? 's' : ''} proposed on your project — review and confirm.`,
          type: 'PROJECT_CREDITS_PROPOSED',
          payload: { booking_id: booking.id, project_id: booking.project_id },
        },
      }).catch((e) => console.error('[notification] credit proposal failed:', e?.message));
    }

    if (data.rights && booking.artist?.user_id) {
      prisma.notification.create({
        data: {
          user_id: booking.artist.user_id,
          title: 'Rights split proposed',
          body: `A ${data.rights.agreement_type.toLowerCase()} rights split was proposed for review. Not legally binding until agreed.`,
          type: 'RIGHTS_PROPOSED',
          payload: { booking_id: booking.id, project_id: booking.project_id },
        },
      }).catch((e) => console.error('[notification] rights proposal failed:', e?.message));
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}
