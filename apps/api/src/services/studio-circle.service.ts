import { prisma } from '../lib/prisma';

export async function syncStudioCircleMembership(studioId: string, artistId: string) {
  const completed = await prisma.booking.findMany({
    where: { studio_id: studioId, artist_id: artistId, status: 'COMPLETED' },
    orderBy: { starts_at: 'asc' },
    select: { starts_at: true },
  });
  if (!completed.length) return null;

  return prisma.studioCircleMember.upsert({
    where: { studio_id_artist_id: { studio_id: studioId, artist_id: artistId } },
    create: {
      studio_id: studioId,
      artist_id: artistId,
      session_count: completed.length,
      first_session_at: completed[0].starts_at,
      last_session_at: completed[completed.length - 1].starts_at,
    },
    update: {
      session_count: completed.length,
      first_session_at: completed[0].starts_at,
      last_session_at: completed[completed.length - 1].starts_at,
    },
  });
}
