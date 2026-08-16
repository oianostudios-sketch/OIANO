import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { prisma } from './prisma';
import { Prisma } from '@prisma/client';

function safeIpHash(req: Request) {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? 'unknown';
  return crypto.createHash('sha256').update(`${process.env.JWT_SECRET}:${ip}`).digest('hex').slice(0, 24);
}

export async function writeAdminAudit(actorId: string, action: string, req: Request, metadata: Record<string, unknown> = {}) {
  await prisma.adminAuditLog.create({ data: {
    actor_id: actorId, action, method: req.method, path: req.originalUrl,
    ip_hash: safeIpHash(req), user_agent: req.get('user-agent')?.slice(0, 240) ?? null, metadata: metadata as Prisma.InputJsonValue,
  }});
}

export function auditMaintenanceAccess(req: Request, res: Response, next: NextFunction) {
  res.on('finish', () => {
    if (res.statusCode < 400) writeAdminAudit((req as any).userId, 'maintenance.view', req, { status_code: res.statusCode }).catch((error) => console.error('[audit] write failed:', error?.message));
  });
  next();
}

export function auditSuccessfulMutation(req: Request, res: Response, next: NextFunction) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next();
  res.on('finish', () => {
    if (res.statusCode < 400 && (req as any).userId) {
      const routePath = req.route?.path ?? req.path;
      writeAdminAudit((req as any).userId, 'resource.mutation', req, {
        status_code: res.statusCode,
        role: (req as any).userRole,
        route: routePath,
        target_id: req.params.id ?? req.params.projectId ?? null,
      }).catch((error) => console.error('[audit] mutation write failed:', error?.message));
    }
  });
  next();
}
