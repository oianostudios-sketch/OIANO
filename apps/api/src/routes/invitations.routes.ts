import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { authenticate } from '../middleware/auth.middleware';
import { emitActivityEvent } from '../lib/activityEvents';

// A creator bringing someone new to OIANO.
//
// The adoption loop had no INVITE stage: PassportConnection requires both
// parties to be existing artists, and StudioStaffInvitation only admits studio
// staff, so nobody already here could bring in anybody who was not. This is the
// missing link between having a record worth showing and the network growing.
//
// The link is a credential, so only its SHA-256 is stored — the same treatment
// StudioStaffInvitation already gives its token.
export const invitationsRouter = Router();
invitationsRouter.use(authenticate);

const INVITE_TTL_DAYS = 14;
const OPEN_INVITE_LIMIT = 25;

const CreateSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  note: z.string().trim().max(280).optional(),
}).strict();

const AcceptSchema = z.object({
  token: z.string().min(30).max(200),
}).strict();

// POST /api/invitations — invite someone by email. Returns the link for the
// inviter to pass on however they like; OIANO does not require an email
// provider to be configured for the loop to work.
invitationsRouter.post('/', async (req: any, res, next) => {
  try {
    const data = CreateSchema.parse(req.body);

    const me = await prisma.user.findUniqueOrThrow({ where: { id: req.userId }, select: { email: true } });
    if (me.email.toLowerCase() === data.email) {
      throw new AppError('You are already here', 409);
    }

    // A bounded number of open invitations per creator. This endpoint mints
    // credentials addressed to arbitrary email addresses, so it must not be a
    // free bulk-messaging surface.
    const open = await prisma.creatorInvitation.count({
      where: { invited_by: req.userId, status: 'PENDING', expires_at: { gt: new Date() } },
    });
    if (open >= OPEN_INVITE_LIMIT) {
      throw new AppError('You have too many invitations still open', 429);
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const token_hash = crypto.createHash('sha256').update(token).digest('hex');

    const invitation = await prisma.creatorInvitation.create({
      data: {
        email: data.email,
        note: data.note,
        token_hash,
        invited_by: req.userId,
        expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      },
      select: { id: true, email: true, note: true, status: true, expires_at: true, created_at: true },
    });

    res.status(201).json({
      ...invitation,
      // Returned once, at creation. The hash is all that is kept, so this link
      // cannot be recovered later — which is the point of storing it that way.
      invite_url: `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/enter?invite=${encodeURIComponent(token)}`,
    });
  } catch (error) { next(error); }
});

// GET /api/invitations — the caller's own invitations. Never anyone else's, and
// never the token.
invitationsRouter.get('/', async (req: any, res, next) => {
  try {
    const invitations = await prisma.creatorInvitation.findMany({
      where: { invited_by: req.userId },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: { id: true, email: true, note: true, status: true, expires_at: true, accepted_at: true, created_at: true },
    });
    res.json(invitations);
  } catch (error) { next(error); }
});

// POST /api/invitations/accept — claim an invitation as the signed-in user.
// Deliberately requires authentication: the account is created through the
// normal signup path, and accepting only records who arrived through whom.
invitationsRouter.post('/accept', async (req: any, res, next) => {
  try {
    const { token } = AcceptSchema.parse(req.body);
    const token_hash = crypto.createHash('sha256').update(token).digest('hex');

    const invitation = await prisma.creatorInvitation.findUnique({
      where: { token_hash },
      select: { id: true, status: true, expires_at: true, invited_by: true },
    });
    // One message for missing, spent and expired alike: a caller probing tokens
    // learns nothing about which of those a guess was.
    if (!invitation || invitation.status !== 'PENDING' || invitation.expires_at < new Date()) {
      throw new AppError('That invitation is no longer valid', 410);
    }
    if (invitation.invited_by === req.userId) {
      throw new AppError('You cannot accept your own invitation', 409);
    }

    // Single use, enforced by the update's own filter rather than by the read
    // above — two simultaneous claims cannot both match status PENDING.
    const claimed = await prisma.creatorInvitation.updateMany({
      where: { id: invitation.id, status: 'PENDING' },
      data: { status: 'ACCEPTED', accepted_by: req.userId, accepted_at: new Date() },
    });
    if (claimed.count !== 1) throw new AppError('That invitation is no longer valid', 410);

    emitActivityEvent('invitation.accepted', {
      subject: { type: 'PLATFORM', id: invitation.id },
      actorId: req.userId,
      invited_by: invitation.invited_by,
    }).catch((e: any) => console.error('[activity] invitation.accepted emit failed:', e?.message));

    res.json({ ok: true });
  } catch (error) { next(error); }
});
