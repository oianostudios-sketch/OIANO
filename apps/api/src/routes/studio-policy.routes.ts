import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { canApprovePolicyException, evaluateStudioPolicies, type PolicyContract } from '../lib/studioPolicyEngine';
import { resolveStaffStudio } from '../middleware/studioScope.middleware';

export const studioPolicyRouter = Router();
studioPolicyRouter.use(authenticate, requireRole('STUDIO_ADMIN'));

const Clause = z.object({ field: z.string().min(1).max(120), operator: z.enum(['EQ','NEQ','GT','GTE','LT','LTE','IN','NOT_IN']), value: z.unknown() });
const PolicyInput = z.object({
  domain: z.string().trim().min(1).max(60).transform(value => value.toUpperCase()),
  subject: z.string().trim().min(1).max(100).transform(value => value.toUpperCase()),
  name: z.string().trim().min(2).max(140), description: z.string().trim().max(1000).optional(),
  conditions: z.object({ all: z.array(Clause).max(20).optional(), any: z.array(Clause).max(20).optional() }).default({}),
  default_outcome: z.object({ requirements: z.array(Clause).max(20).optional(), consequence: z.record(z.unknown()).optional() }),
  enforcement: z.enum(['ADVISORY','CONTROLLED','HARD']).default('CONTROLLED'),
  override_capability: z.string().trim().min(1).max(80).optional(), priority: z.number().int().min(0).max(10000).default(100),
  effective_from: z.string().datetime().optional(), effective_until: z.string().datetime().optional(),
});

async function contextFor(userId: string) {
  const studio = await resolveStaffStudio(userId);
  const membership = await prisma.studioStaff.findUnique({ where: { user_id_studio_id: { user_id: userId, studio_id: studio.id } } });
  if (!membership) throw new AppError('Studio assignment required', 403);
  const capabilities = membership.capabilities.length
    ? membership.capabilities
    : membership.role === 'STUDIO_ADMIN'
      ? ['MANAGE_POLICIES', 'POLICY_OVERRIDE_ALL']
      : [];
  return { studio, membership, capabilities };
}

studioPolicyRouter.get('/', async (req, res, next) => {
  try {
    const { studio } = await contextFor((req as any).userId);
    res.json(await prisma.studioPolicy.findMany({ where: { studio_id: studio.id }, orderBy: [{ domain: 'asc' }, { subject: 'asc' }, { version: 'desc' }] }));
  } catch (error) { next(error); }
});

studioPolicyRouter.post('/', async (req, res, next) => {
  try {
    const userId = (req as any).userId as string;
    const { studio, capabilities } = await contextFor(userId);
    if (!capabilities.includes('MANAGE_POLICIES') && !capabilities.includes('POLICY_OVERRIDE_ALL')) throw new AppError('Policy management permission required', 403);
    const data = PolicyInput.parse(req.body);
    if (data.enforcement === 'CONTROLLED' && !data.override_capability) throw new AppError('Controlled policies require an override capability', 400);
    const created = await prisma.$transaction(async tx => {
      const previous = await tx.studioPolicy.findFirst({ where: { studio_id: studio.id, domain: data.domain, subject: data.subject }, orderBy: { version: 'desc' } });
      if (previous?.status === 'ACTIVE') await tx.studioPolicy.update({ where: { id: previous.id }, data: { status: 'RETIRED', effective_until: new Date() } });
      const policy = await tx.studioPolicy.create({ data: {
        studio_id: studio.id, created_by: userId, domain: data.domain, subject: data.subject, name: data.name,
        description: data.description, conditions: data.conditions as Prisma.InputJsonValue, default_outcome: data.default_outcome as Prisma.InputJsonValue,
        enforcement: data.enforcement, override_capability: data.override_capability, priority: data.priority,
        version: (previous?.version ?? 0) + 1, effective_from: data.effective_from ? new Date(data.effective_from) : new Date(),
        effective_until: data.effective_until ? new Date(data.effective_until) : undefined,
      } });
      await tx.adminAuditLog.create({ data: { actor_id: userId, action: 'studio.policy.version.created', target_type: 'StudioPolicy', target_id: policy.id, metadata: { studio_id: studio.id, domain: policy.domain, subject: policy.subject, version: policy.version } } });
      return policy;
    });
    res.status(201).json(created);
  } catch (error) { next(error); }
});

studioPolicyRouter.post('/evaluate', async (req, res, next) => {
  try {
    const userId = (req as any).userId as string;
    const { studio } = await contextFor(userId);
    const input = z.object({ context: z.record(z.unknown()), proposed: z.record(z.unknown()) }).parse(req.body);
    const now = new Date();
    const policies = await prisma.studioPolicy.findMany({ where: { studio_id: studio.id, status: 'ACTIVE', effective_from: { lte: now }, OR: [{ effective_until: null }, { effective_until: { gt: now } }] }, orderBy: { priority: 'asc' } });
    res.json({ decisions: evaluateStudioPolicies(policies as unknown as PolicyContract[], input.context, input.proposed) });
  } catch (error) { next(error); }
});

studioPolicyRouter.get('/exceptions', async (req, res, next) => {
  try {
    const { studio } = await contextFor((req as any).userId);
    res.json(await prisma.policyException.findMany({ where: { studio_id: studio.id }, include: { policy: true, requester: { select: { id: true, email: true } }, approver: { select: { id: true, email: true } } }, orderBy: { created_at: 'desc' }, take: 200 }));
  } catch (error) { next(error); }
});

studioPolicyRouter.post('/exceptions', async (req, res, next) => {
  try {
    const userId = (req as any).userId as string;
    const { studio } = await contextFor(userId);
    const data = z.object({ policy_id: z.string().uuid(), target_type: z.string().min(1).max(80), target_id: z.string().min(1).max(160), normal_values: z.record(z.unknown()), requested_values: z.record(z.unknown()), consequence: z.record(z.unknown()).default({}), reason: z.string().trim().min(5).max(1000), expires_at: z.string().datetime().optional() }).parse(req.body);
    const policy = await prisma.studioPolicy.findFirst({ where: { id: data.policy_id, studio_id: studio.id, status: 'ACTIVE' } });
    if (!policy) throw new AppError('Active studio policy not found', 404);
    if (policy.enforcement === 'HARD') throw new AppError('Hard boundaries cannot be overridden', 409);
    const exception = await prisma.policyException.create({ data: {
      policy_id: data.policy_id, target_type: data.target_type, target_id: data.target_id,
      normal_values: data.normal_values as Prisma.InputJsonValue,
      requested_values: data.requested_values as Prisma.InputJsonValue,
      consequence: data.consequence as Prisma.InputJsonValue,
      reason: data.reason, expires_at: data.expires_at ? new Date(data.expires_at) : undefined,
      studio_id: studio.id, requested_by: userId,
    } });
    res.status(201).json(exception);
  } catch (error) { next(error); }
});

studioPolicyRouter.patch('/exceptions/:id/decision', async (req, res, next) => {
  try {
    const userId = (req as any).userId as string;
    const { studio, capabilities } = await contextFor(userId);
    const data = z.object({ decision: z.enum(['APPROVE','REJECT','ESCALATE']), note: z.string().trim().max(1000).optional() }).parse(req.body);
    const exception = await prisma.policyException.findFirst({ where: { id: req.params.id, studio_id: studio.id }, include: { policy: true } });
    if (!exception) throw new AppError('Policy exception not found', 404);
    if (exception.status !== 'REQUESTED' && exception.status !== 'ESCALATED') throw new AppError('This exception has already been decided', 409);
    if (data.decision === 'APPROVE' && !canApprovePolicyException(capabilities, exception.policy.override_capability)) throw new AppError('You do not have authority to approve this exception', 403);
    const status = data.decision === 'APPROVE' ? 'APPROVED' : data.decision === 'REJECT' ? 'REJECTED' : 'ESCALATED';
    const updated = await prisma.$transaction(async tx => {
      const result = await tx.policyException.update({ where: { id: exception.id }, data: { status, approved_by: data.decision === 'ESCALATE' ? null : userId, approval_note: data.note, approved_at: data.decision === 'APPROVE' ? new Date() : null } });
      await tx.adminAuditLog.create({ data: { actor_id: userId, action: `studio.policy.exception.${status.toLowerCase()}`, target_type: 'PolicyException', target_id: result.id, metadata: { studio_id: studio.id, policy_id: exception.policy_id, target_type: exception.target_type, target_id: exception.target_id, reason: exception.reason } } });
      return result;
    });
    res.json(updated);
  } catch (error) { next(error); }
});
