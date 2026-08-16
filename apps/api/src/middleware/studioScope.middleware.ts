import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';

export async function resolveStaffStudio(userId: string) {
  const staff = await prisma.studioStaff.findUnique({
    where: { user_id: userId },
    include: { studio: true },
  });
  if (!staff?.studio) throw new AppError('Studio assignment required', 403);
  return staff.studio;
}

export async function attachStudioScope(req: Request, _res: Response, next: NextFunction) {
  try {
    const studio = await resolveStaffStudio((req as any).userId as string);
    (req as any).studioId = studio.id;
    (req as any).studio = studio;
    next();
  } catch (error) {
    next(error);
  }
}
