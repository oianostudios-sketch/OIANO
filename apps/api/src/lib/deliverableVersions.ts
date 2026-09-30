import type { Prisma } from '@prisma/client';
import { AppError } from './errors';

const REVIEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// A booking's delivered files are one Deliverable, and each delivery is a new,
// immutable version of it. Both the delivery route and the completion screen add
// versions through here.
//
// The booking row is locked first, so two deliveries for the same booking take
// turns: the second sees the first's version and numbers its own after it. Without
// the lock both read version N and both wrote N+1, and the loser hit the version's
// unique key; two first deliveries each created a Deliverable for one booking.
export async function addDeliverableVersion(tx: Prisma.TransactionClient, input: {
  bookingId: string;
  userId: string;
  file_urls: string[];
  notes?: string | null;
  title: string;
  visibility?: string;
}) {
  await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${input.bookingId} FOR NO KEY UPDATE`;

  const existing = await tx.deliverable.findFirst({
    where: { booking_id: input.bookingId },
    orderBy: { created_at: 'asc' },
  });
  const version = { file_urls: input.file_urls, notes: input.notes ?? null, created_by: input.userId };
  const review_due_at = new Date(Date.now() + REVIEW_WINDOW_MS);

  if (!existing) {
    return tx.deliverable.create({
      data: {
        booking_id: input.bookingId,
        title: input.title,
        status: 'PENDING_REVIEW',
        visibility: input.visibility,
        current_version: 1,
        review_due_at,
        created_by: input.userId,
        versions: { create: { version_number: 1, ...version } },
      },
      include: { versions: { orderBy: { version_number: 'desc' } } },
    });
  }

  const nextVersion = existing.current_version + 1;
  return tx.deliverable.update({
    where: { id: existing.id },
    data: {
      current_version: nextVersion,
      status: 'PENDING_REVIEW',
      visibility: input.visibility,
      reviewed_at: null,
      review_due_at,
      versions: { create: { version_number: nextVersion, ...version } },
    },
    include: { versions: { orderBy: { version_number: 'desc' } } },
  });
}

// The artist's answer to one version. It is written only if that version is still
// the current one and the deliverable is not already approved, in the same
// statement, so an approval can never land on a version delivered after the one
// the artist looked at, and two approvals at once record one.
export async function recordDeliverableReview(tx: Prisma.TransactionClient, input: {
  deliverableId: string;
  versionNumber: number;
  decision: 'APPROVED' | 'CHANGES_REQUESTED';
  note?: string;
  reviewedBy: string;
}) {
  const claimed = await tx.deliverable.updateMany({
    where: { id: input.deliverableId, current_version: input.versionNumber, status: { not: 'APPROVED' } },
    data: { status: input.decision, reviewed_at: new Date() },
  });
  if (claimed.count !== 1) {
    const now = await tx.deliverable.findUnique({ where: { id: input.deliverableId }, select: { current_version: true, status: true } });
    if (now && now.current_version !== input.versionNumber) {
      throw new AppError(`Version ${now.current_version} was delivered after the version you reviewed. Review the new version.`, 409);
    }
    throw new AppError('This deliverable is already approved', 409);
  }
  await tx.deliverableReview.create({
    data: {
      deliverable_id: input.deliverableId,
      version_number: input.versionNumber,
      decision: input.decision,
      note: input.note,
      reviewed_by: input.reviewedBy,
    },
  });
  return tx.deliverable.findUniqueOrThrow({
    where: { id: input.deliverableId },
    include: { versions: { orderBy: { version_number: 'desc' } }, reviews: { orderBy: { created_at: 'desc' } } },
  });
}
