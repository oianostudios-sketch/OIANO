import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';

// A staff user may belong to more than one studio (StudioStaff is a real
// (user_id, studio_id) membership, not a 1:1). Which one a request is
// scoped to is resolved via User.active_studio_id — set automatically the
// first time a user with exactly one membership resolves (zero-friction for
// the common case), and changed explicitly via PATCH /api/studio/active for
// anyone staffing more than one.
export async function resolveStaffStudio(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { active_studio_id: true },
  });

  if (user?.active_studio_id) {
    const active = await prisma.studioStaff.findUnique({
      where: { user_id_studio_id: { user_id: userId, studio_id: user.active_studio_id } },
      include: { studio: true },
    });
    if (active?.studio) return active.studio;
    // active_studio_id pointed at a membership that no longer exists (staff
    // removed from that studio) — fall through to re-resolve below rather
    // than hard-failing on stale state.
  }

  const memberships = await prisma.studioStaff.findMany({
    where: { user_id: userId },
    include: { studio: true },
    orderBy: { created_at: 'asc' },
    take: 2,
  });
  const first = memberships[0];
  if (!first?.studio) throw new AppError('Studio assignment required', 403);
  if (memberships.length > 1) {
    throw new AppError('Active studio selection required', 409);
  }

  await prisma.user.update({ where: { id: userId }, data: { active_studio_id: first.studio_id } }).catch(() => {});
  return first.studio;
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
