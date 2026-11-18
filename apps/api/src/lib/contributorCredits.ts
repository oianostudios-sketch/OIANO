import { prisma } from './prisma';

// A contributor's credits on other people's projects, for their Passport.
//
// A credit is theirs through the participation they claimed with its invitation
// link (participant_ref_id), the same link that let them confirm it, never through
// a matching name. Only CONFIRMED credits count.
//
// Publication needs two consents that already exist, and both must hold:
//   - ProjectCredit.is_public: set only by the credited person's own CONFIRM
//     (contributions.routes.ts); studio staff and leads cannot set it.
//   - Project.is_public: the project's artist choosing to show the work on a
//     Passport (PATCH /passport/projects/:id/visibility).
// A confirmed credit on a private project therefore stays private. The public view
// carries the project's title and nothing else about the project.
export async function contributorCredits(userId: string, view: 'own' | 'public') {
  const participations = await prisma.projectParticipant.findMany({
    where: { participant_ref_id: userId },
    select: { id: true },
  });
  if (!participations.length) return [];
  const credits = await prisma.projectCredit.findMany({
    where: {
      status: 'CONFIRMED',
      participant_id: { in: participations.map(({ id }) => id) },
      ...(view === 'public' ? { is_public: true, project: { is_public: true } } : {}),
    },
    select: {
      id: true, role: true, credited_name: true, scope: true, is_public: true, created_at: true,
      project: { select: { id: true, title: true, is_public: true } },
    },
    orderBy: { created_at: 'desc' },
  });
  return credits.map((credit) => {
    const published = credit.is_public && credit.project.is_public;
    return view === 'public'
      ? { id: credit.id, role: credit.role, credited_name: credit.credited_name, scope: credit.scope, project: { title: credit.project.title } }
      : { id: credit.id, role: credit.role, credited_name: credit.credited_name, scope: credit.scope, published, project: { id: credit.project.id, title: credit.project.title } };
  });
}
