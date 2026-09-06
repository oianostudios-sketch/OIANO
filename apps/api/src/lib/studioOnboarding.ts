import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { AppError } from './errors';

// A studio and its first operator come into existence together. Before this,
// nothing in the API created a Studio at all — `prisma.studio.create` appeared
// only in seed scripts and tests, so every studio had to be inserted by hand by
// someone with database access. That is the single largest reason OIANO could
// not run without an external operator.

export function studioSlugFrom(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  // A name of only punctuation or non-Latin script would otherwise yield an
  // empty slug, and an empty string is a valid unique value exactly once.
  return slug || 'studio';
}

export interface RegisterStudioInput {
  email: string;
  password_hash: string;
  /** Display name of the first operator. */
  ownerName: string;
  studioName: string;
  timezone?: string;
}

// Creates the Studio, its first STUDIO_ADMIN, and the membership binding them, in
// one transaction — a studio with no operator, or an operator with no studio, is
// not a state worth being able to reach.
//
// active_studio_id is set here so resolveStaffStudio() answers immediately. Left
// unset, a brand-new operator whose only membership is this studio would still be
// resolved on first request, but setting it explicitly keeps the multi-studio
// selection prompt for people who genuinely belong to several studios.
export async function registerStudioWithOwner(input: RegisterStudioInput) {
  const base = studioSlugFrom(input.studioName);

  // Slug collisions are expected — two studios may legitimately share a name.
  // Retry on the unique violation rather than pre-checking, which would race.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      return await prisma.$transaction(async (tx) => {
        const studio = await tx.studio.create({
          data: {
            slug,
            name: input.studioName,
            ...(input.timezone ? { timezone: input.timezone } : {}),
          },
        });

        const user = await tx.user.create({
          data: {
            email: input.email,
            password_hash: input.password_hash,
            role: 'STUDIO_ADMIN',
            active_studio_id: studio.id,
            studio_staff: {
              create: { studio_id: studio.id, role: 'STUDIO_ADMIN', position: 'OWNER' },
            },
          },
          include: { studio_staff: true },
        });

        return { user, studio };
      });
    } catch (error) {
      const slugTaken =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (error.meta?.target as string[] | undefined)?.includes('slug');
      if (!slugTaken) throw error;
    }
  }

  throw new AppError('Could not allocate a studio address for that name', 409);
}
