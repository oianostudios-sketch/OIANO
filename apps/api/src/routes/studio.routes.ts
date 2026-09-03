// apps/api/src/routes/studio.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { DEFAULT_STUDIO_SLUG } from '@oiano/shared';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { AppError } from '../lib/errors';
import { resolveStaffStudio } from '../middleware/studioScope.middleware';
import { getNavigationRecommendation } from '../intelligence/intelligence.service';
import { buildNavigationContext } from '../intelligence/context/context-builder';
import crypto from 'crypto';
import { sendStudioInvitationEmail } from '../services/email.service';

export const studioRouter = Router();

function presentStudio<T extends { hero_image_url?: string | null }>(studio: T) {
  return { ...studio, image_url: studio.hero_image_url ?? '' };
}

// GET /api/studio
studioRouter.get('/', async (_req, res, next) => {
  try {
    const studio = await prisma.studio.findUnique({
      where: { slug: DEFAULT_STUDIO_SLUG },
      include: { rooms: true, engineers: true, services: true },
    });
    res.json(studio ? presentStudio(studio) : studio);
  } catch (err) {
    next(err);
  }
});

studioRouter.get('/options', async (_req, res, next) => {
  try {
    const studios = await prisma.studio.findMany({
      select: { id: true, slug: true, name: true, address: true, timezone: true, currency: true, logo_url: true, hero_image_url: true, amenities: true, _count: { select: { rooms: true, engineers: true, services: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(studios.map(studio => ({ ...studio, image_url: studio.hero_image_url ?? '' })));
  } catch (err) { next(err); }
});

// GET /api/studio/memberships — every studio this staff user belongs to,
// plus which one is currently active. Powers a future studio switcher; today
// most users have exactly one row and never need to call PATCH /active.
studioRouter.get('/memberships', authenticate, async (req, res, next) => {
  try {
    const userId = (req as any).userId as string;
    const [user, memberships] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { active_studio_id: true } }),
      prisma.studioStaff.findMany({
        where: { user_id: userId },
        include: { studio: { select: { id: true, name: true, slug: true, logo_url: true } } },
        orderBy: { created_at: 'asc' },
      }),
    ]);
    res.json({
      active_studio_id: user?.active_studio_id ?? (memberships.length === 1 ? memberships[0].studio_id : null),
      memberships: memberships.map(m => ({
        studio: m.studio,
        role: m.role,
        position: m.position,
        capabilities: m.capabilities,
      })),
    });
  } catch (err) { next(err); }
});

// PATCH /api/studio/active — switch which studio membership this user's
// requests are scoped to. No token refresh needed: resolveStaffStudio()
// re-reads active_studio_id fresh on every request.
const SwitchStudioSchema = z.object({ studio_id: z.string().min(1) });
studioRouter.patch('/active', authenticate, async (req, res, next) => {
  try {
    const userId = (req as any).userId as string;
    const { studio_id } = SwitchStudioSchema.parse(req.body);
    const membership = await prisma.studioStaff.findUnique({
      where: { user_id_studio_id: { user_id: userId, studio_id } },
      include: { studio: { select: { id: true, name: true, slug: true } } },
    });
    if (!membership) throw new AppError('You are not staff at that studio', 403);
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { active_studio_id: studio_id } }),
      prisma.adminAuditLog.create({ data: {
        actor_id: userId,
        action: 'studio.membership.activated',
        target_type: 'Studio',
        target_id: studio_id,
        metadata: { role: membership.role, position: membership.position },
      } }),
    ]);
    res.json({
      active_studio: membership.studio,
      membership: { role: membership.role, position: membership.position, capabilities: membership.capabilities },
    });
  } catch (err) { next(err); }
});

// Authenticated workspace context. Internal screens must not inherit the
// public featured studio: staff resolve their active membership, while an
// artist resolves the studio from their latest booking relationship.
studioRouter.get('/current', authenticate, async (req: any, res, next) => {
  try {
    let studio = null;
    if (req.userRole === 'STUDIO_ADMIN' || req.userRole === 'ENGINEER') {
      studio = await resolveStaffStudio(req.userId);
    } else if (req.userRole === 'ARTIST') {
      const artist = await prisma.artist.findUnique({ where: { user_id: req.userId }, select: { id: true } });
      const latest = artist ? await prisma.booking.findFirst({
        where: { artist_id: artist.id },
        orderBy: { starts_at: 'desc' },
        select: { studio_id: true },
      }) : null;
      studio = latest
        ? await prisma.studio.findUnique({ where: { id: latest.studio_id } })
        // An artist with no booking history yet has no studio to resolve from —
        // fall back to the same default the onboarding Calendar step already
        // books against, so "no studio" isn't a dead end for pages (Calendar,
        // Dashboard) that need somewhere real to point at.
        : await prisma.studio.findUnique({ where: { slug: DEFAULT_STUDIO_SLUG } });
    }
    if (!studio) return res.json(null);
    const detailed = await prisma.studio.findUnique({
      where: { id: studio.id },
      include: { rooms: true, engineers: true, services: true },
    });
    res.json(detailed ? presentStudio(detailed) : null);
  } catch (error) { next(error); }
});

const CAPABILITIES = [
  'VIEW_CALENDAR','MANAGE_CALENDAR','MANAGE_BOOKINGS','MANAGE_ASSIGNED_SESSIONS',
  'UPLOAD_DELIVERABLES','MANAGE_STAFF','MANAGE_POLICIES','VIEW_FINANCE',
  'WAIVE_DEPOSIT','CHANGE_PRICE','EXTEND_HOURS','POLICY_OVERRIDE_ALL',
] as const;
const TeamRole = z.enum(['STUDIO_ADMIN','ENGINEER']);
const TeamPosition = z.string().trim().min(2).max(60).transform(value => value.toUpperCase().replace(/[^A-Z0-9]+/g, '_'));
const TeamCapabilities = z.array(z.enum(CAPABILITIES)).max(CAPABILITIES.length);

async function requireStaffManager(userId: string) {
  const studio = await resolveStaffStudio(userId);
  const membership = await prisma.studioStaff.findUnique({ where: { user_id_studio_id: { user_id: userId, studio_id: studio.id } } });
  if (!membership || (membership.role !== 'STUDIO_ADMIN' && !membership.capabilities.includes('MANAGE_STAFF'))) throw new AppError('Staff management permission required', 403);
  return { studio, membership };
}

studioRouter.get('/team', authenticate, requireRole('STUDIO_ADMIN'), async (req, res, next) => {
  try {
    const { studio } = await requireStaffManager((req as any).userId);
    const [members, invitations] = await Promise.all([
      prisma.studioStaff.findMany({ where: { studio_id: studio.id }, include: { user: { select: { id: true, email: true, mfa_enabled: true } } }, orderBy: { created_at: 'asc' } }),
      prisma.studioStaffInvitation.findMany({ where: { studio_id: studio.id, status: 'PENDING' }, select: { id:true,email:true,role:true,position:true,capabilities:true,status:true,expires_at:true,created_at:true }, orderBy: { created_at: 'desc' } }),
    ]);
    res.json({ studio: { id: studio.id, name: studio.name }, capabilities: CAPABILITIES, members, invitations });
  } catch (error) { next(error); }
});

studioRouter.post('/team/invitations', authenticate, requireRole('STUDIO_ADMIN'), async (req, res, next) => {
  try {
    const userId = (req as any).userId as string;
    const { studio } = await requireStaffManager(userId);
    const data = z.object({ email: z.string().email().transform(v => v.toLowerCase()), role: TeamRole, position: TeamPosition, capabilities: TeamCapabilities }).parse(req.body);
    const existingUser = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (existingUser && await prisma.studioStaff.findUnique({ where: { user_id_studio_id: { user_id: existingUser.id, studio_id: studio.id } } })) throw new AppError('This person already belongs to the studio', 409);
    await prisma.studioStaffInvitation.updateMany({ where: { studio_id: studio.id, email: data.email, status: 'PENDING' }, data: { status: 'REVOKED' } });
    const token = crypto.randomBytes(32).toString('base64url');
    const token_hash = crypto.createHash('sha256').update(token).digest('hex');
    const expires_at = new Date(Date.now() + 7 * 86_400_000);
    const invitation = await prisma.studioStaffInvitation.create({ data: { studio_id: studio.id, invited_by: userId, token_hash, expires_at, ...data }, select: { id:true,email:true,role:true,position:true,capabilities:true,status:true,expires_at:true,created_at:true } });
    await prisma.adminAuditLog.create({ data: { actor_id:userId, action:'studio.staff.invited', target_type:'StudioStaffInvitation', target_id:invitation.id, metadata:{ studio_id:studio.id,email:data.email,role:data.role,position:data.position,capabilities:data.capabilities } } });
    const acceptUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/accept-studio-invite?token=${encodeURIComponent(token)}`;
    sendStudioInvitationEmail(data.email, studio.name, data.position, acceptUrl).catch(error => console.error('[email] studio invitation failed:', error?.message));
    res.status(201).json(invitation);
  } catch (error) { next(error); }
});

studioRouter.post('/team/invitations/accept', authenticate, async (req, res, next) => {
  try {
    const userId = (req as any).userId as string;
    const user = await prisma.user.findUnique({ where: { id:userId }, select:{ email:true, active_studio_id:true } });
    if (!user) throw new AppError('User not found', 404);
    const { token } = z.object({ token:z.string().min(30).max(200) }).parse(req.body);
    const token_hash = crypto.createHash('sha256').update(token).digest('hex');
    const invitation = await prisma.studioStaffInvitation.findUnique({ where:{ token_hash }, include:{ studio:{select:{id:true,name:true,slug:true}} } });
    if (!invitation || invitation.status !== 'PENDING' || invitation.expires_at <= new Date()) throw new AppError('Invitation is invalid or expired', 400);
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) throw new AppError('This invitation belongs to another account', 403);
    await prisma.$transaction(async tx => {
      await tx.studioStaff.upsert({ where:{user_id_studio_id:{user_id:userId,studio_id:invitation.studio_id}}, update:{role:invitation.role,position:invitation.position,capabilities:invitation.capabilities}, create:{user_id:userId,studio_id:invitation.studio_id,role:invitation.role,position:invitation.position,capabilities:invitation.capabilities} });
      await tx.studioStaffInvitation.update({ where:{id:invitation.id}, data:{status:'ACCEPTED',accepted_at:new Date()} });
      if (!user.active_studio_id) await tx.user.update({where:{id:userId},data:{active_studio_id:invitation.studio_id}});
      await tx.adminAuditLog.create({data:{actor_id:userId,action:'studio.staff.invitation.accepted',target_type:'Studio',target_id:invitation.studio_id,metadata:{invitation_id:invitation.id,position:invitation.position}}});
    });
    res.json({ studio:invitation.studio, position:invitation.position, capabilities:invitation.capabilities });
  } catch (error) { next(error); }
});

studioRouter.delete('/team/invitations/:invitationId', authenticate, requireRole('STUDIO_ADMIN'), async (req,res,next)=>{
  try{const userId=(req as any).userId as string;const{studio}=await requireStaffManager(userId);const invitation=await prisma.studioStaffInvitation.findFirst({where:{id:req.params.invitationId,studio_id:studio.id,status:'PENDING'}});if(!invitation)throw new AppError('Pending invitation not found',404);await prisma.$transaction([prisma.studioStaffInvitation.update({where:{id:invitation.id},data:{status:'REVOKED'}}),prisma.adminAuditLog.create({data:{actor_id:userId,action:'studio.staff.invitation.revoked',target_type:'StudioStaffInvitation',target_id:invitation.id,metadata:{studio_id:studio.id,email:invitation.email}}})]);res.status(204).send();}catch(error){next(error);}
});

studioRouter.patch('/team/:membershipId', authenticate, requireRole('STUDIO_ADMIN'), async (req, res, next) => {
  try {
    const userId=(req as any).userId as string; const {studio}=await requireStaffManager(userId);
    const data=z.object({role:TeamRole,position:TeamPosition,capabilities:TeamCapabilities}).parse(req.body);
    const member=await prisma.studioStaff.findFirst({where:{id:req.params.membershipId,studio_id:studio.id}}); if(!member)throw new AppError('Team member not found',404);
    if(member.user_id===userId&&!data.capabilities.includes('MANAGE_STAFF'))throw new AppError('You cannot remove your own staff-management authority',409);
    const updated=await prisma.studioStaff.update({where:{id:member.id},data});
    await prisma.adminAuditLog.create({data:{actor_id:userId,action:'studio.staff.access.updated',target_type:'StudioStaff',target_id:member.id,metadata:{studio_id:studio.id,role:data.role,position:data.position,capabilities:data.capabilities}}});
    res.json(updated);
  } catch(error){next(error);}
});

studioRouter.delete('/team/:membershipId', authenticate, requireRole('STUDIO_ADMIN'), async (req,res,next)=>{
  try{const userId=(req as any).userId as string;const{studio}=await requireStaffManager(userId);const member=await prisma.studioStaff.findFirst({where:{id:req.params.membershipId,studio_id:studio.id}});if(!member)throw new AppError('Team member not found',404);if(member.user_id===userId)throw new AppError('You cannot remove your active membership',409);const managers=await prisma.studioStaff.count({where:{studio_id:studio.id,OR:[{role:'STUDIO_ADMIN'},{capabilities:{has:'MANAGE_STAFF'}}]}});if(managers<=1&&(member.role==='STUDIO_ADMIN'||member.capabilities.includes('MANAGE_STAFF')))throw new AppError('A studio must retain at least one staff manager',409);await prisma.$transaction([prisma.studioStaff.delete({where:{id:member.id}}),prisma.user.updateMany({where:{id:member.user_id,active_studio_id:studio.id},data:{active_studio_id:null}}),prisma.adminAuditLog.create({data:{actor_id:userId,action:'studio.staff.access.revoked',target_type:'StudioStaff',target_id:member.id,metadata:{studio_id:studio.id,user_id:member.user_id}}})]);res.status(204).send();}catch(error){next(error);}
});

// GET /api/studio/navigation-intelligence — intelligence layer, V1 capability
// 3. Aggregate counts only, scoped to the caller's own studio via the same
// resolveStaffStudio() every other studio-scoped route already uses — never
// individual booking/project content. Ranks only over a fixed allowlist of
// destinations that already exist (see schemas/navigation.schema.ts).
const navigationLimiter = rateLimit({ max: 20, windowMs: 60_000, message: 'Too many requests — wait a minute and try again.' });
studioRouter.get('/navigation-intelligence', authenticate, requireRole('STUDIO_ADMIN'), navigationLimiter, async (req, res, next) => {
  try {
    const userId = (req as any).userId as string;
    const studio = await resolveStaffStudio(userId);

    const now = new Date();
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    const [pendingBookings, todaySessionsRemaining, pendingReviewDeliverables, draftCredits, overduePayments] = await Promise.all([
      prisma.booking.count({ where: { studio_id: studio.id, status: 'PENDING' } }),
      prisma.booking.count({ where: { studio_id: studio.id, status: { in: ['CONFIRMED', 'IN_PROGRESS'] }, starts_at: { gte: now, lte: todayEnd } } }),
      prisma.deliverable.count({ where: { status: 'PENDING_REVIEW', booking: { studio_id: studio.id } } }),
      prisma.projectCredit.count({ where: { status: 'DRAFT', project: { bookings: { some: { studio_id: studio.id } } } } }),
      prisma.payment.count({ where: { status: 'UNPAID', booking: { studio_id: studio.id, ends_at: { lt: now } } } }),
    ]);

    const context = buildNavigationContext({ pendingBookings, todaySessionsRemaining, pendingReviewDeliverables, draftCredits, overduePayments });
    const result = await getNavigationRecommendation(context, studio.id);
    if (!result.ok && result.reason === 'disabled') {
      return res.json({ enabled: false, result: null });
    }
    res.json({ enabled: true, result: result.ok ? result.data : null, reason: result.ok ? undefined : result.reason });
  } catch (err) { next(err); }
});

// Public, evidence-backed Studio Passport. Only consented Circle members are
// exposed; operational totals are aggregated and never reveal booking data.
studioRouter.get('/passport/:slug', async (req, res, next) => {
  try {
    const studio = await prisma.studio.findUnique({
      where: { slug: req.params.slug },
      include: {
        rooms: true,
        engineers: { select: { id: true, name: true, specialties: true, bio: true, avatar_url: true } },
        services: true,
        circle_members: {
          where: { consent_status: 'ACCEPTED', visibility: { not: 'HIDDEN' } },
          include: { artist: { select: { id: true, name: true, alias: true, avatar_url: true, passport: { select: { passport_code: true } } } } },
          orderBy: { last_session_at: 'desc' },
          take: 12,
        },
      },
    });
    if (!studio) return res.status(404).json({ error: 'Studio not found' });

    const [completedSessions, uniqueArtists, rating] = await Promise.all([
      prisma.booking.count({ where: { studio_id: studio.id, status: 'COMPLETED' } }),
      prisma.booking.groupBy({ by: ['artist_id'], where: { studio_id: studio.id, status: 'COMPLETED' } }),
      prisma.sessionLog.aggregate({
        where: { booking: { studio_id: studio.id }, artist_rating: { not: null } },
        _avg: { artist_rating: true }, _count: { artist_rating: true },
      }),
    ]);
    const presented = presentStudio(studio);
    res.json({
      ...presented,
      proof: {
        completed_sessions: completedSessions,
        artists_served: uniqueArtists.length,
        average_rating: rating._avg.artist_rating ? Number(rating._avg.artist_rating.toFixed(1)) : null,
        verified_reviews: rating._count.artist_rating,
      },
      circle: studio.circle_members.map(member => ({
        visibility: member.visibility,
        session_count: member.show_session_count ? member.session_count : null,
        artist: {
          name: member.visibility === 'INITIALS'
            ? (member.artist.alias ?? member.artist.name).split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
            : (member.artist.alias ?? member.artist.name),
          avatar_url: member.visibility === 'INITIALS' ? null : member.artist.avatar_url,
          passport_code: member.visibility === 'FULL_PROFILE' ? member.artist.passport?.passport_code : null,
        },
      })),
    });
  } catch (err) { next(err); }
});

studioRouter.get('/:id', async (req, res, next) => {
  try {
    const studio = await prisma.studio.findUnique({
      where: { id: req.params.id },
      include: { rooms: true, engineers: true, services: true },
    });
    if (!studio) return res.status(404).json({ error: 'Studio not found' });
    res.json(presentStudio(studio));
  } catch (err) { next(err); }
});
