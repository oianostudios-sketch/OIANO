// apps/api/src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AppError('Unauthorized', 401);

    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string; role: string; ver?: number };
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { role: true, auth_version: true },
    });
    const tokenVersion = typeof payload.ver === 'number' ? payload.ver : 0;
    if (!user || user.auth_version !== tokenVersion) throw new AppError('Unauthorized', 401);

    (req as any).userId = payload.sub;
    (req as any).userRole = user.role;
    next();
  } catch {
    next(new AppError('Unauthorized', 401));
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = (req as any).userRole;
    if (!roles.includes(role)) {
      return next(new AppError('Forbidden', 403));
    }
    next();
  };
}
