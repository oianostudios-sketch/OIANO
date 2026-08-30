// scripts/dev-ecosystem-triggers.ts
// Development-only triggers that change REAL application state through the
// same functions the real controllers call — never a UI-only simulation.
// Pairs with prisma/seed-ecosystem.ts's fixture ids.
//
// Usage (from apps/api, or via `npm run dev:trigger -- <action> [id]`):
//   ts-node -r tsconfig-paths/register ../../scripts/dev-ecosystem-triggers.ts start-session
//   ts-node -r tsconfig-paths/register ../../scripts/dev-ecosystem-triggers.ts complete-session bk-after-sun-2
//   ts-node -r tsconfig-paths/register ../../scripts/dev-ecosystem-triggers.ts confirm-booking bk-night-drive-2
//   ts-node -r tsconfig-paths/register ../../scripts/dev-ecosystem-triggers.ts confirm-credit credit-after-sun-nia
//
// Each action calls the exact same Prisma mutation, emitActivityEvent(), and
// broadcastToUser/broadcastAll() the real API route calls — so a client with
// useSSE() connected genuinely receives the same live update a real user
// action would produce. This intentionally does NOT hit HTTP: no server or
// auth token juggling needed, while still exercising the real side effects
// (DB write, activity event, SSE broadcast) rather than faking the result.

import { PrismaClient } from '@prisma/client';
import { emitActivityEvent } from '../apps/api/src/lib/activityEvents';
import { broadcastToUser, broadcastAll } from '../apps/api/src/routes/notifications.routes';
import { syncStudioCircleMembership } from '../apps/api/src/services/studio-circle.service';

if (process.env.NODE_ENV === 'production') throw new Error('dev-ecosystem-triggers.ts refuses to run when NODE_ENV=production');
if (process.env.ALLOW_DEV_SEED !== 'true') throw new Error('dev-ecosystem-triggers.ts requires ALLOW_DEV_SEED=true, same guard as seed-ecosystem.ts');

const prisma = new PrismaClient();
const [, , action, arg] = process.argv;

async function startSession(bookingId = 'bk-after-sun-2') {
  const existing = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { artist: true } });
  const durationMs = existing.ends_at.getTime() - existing.starts_at.getTime();
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + durationMs);
  const booking = await prisma.booking.update({ where: { id: bookingId }, data: { status: 'IN_PROGRESS', starts_at: startsAt, ends_at: endsAt } });
  broadcastToUser(existing.artist.user_id, { type: 'booking_updated', bookingId: booking.id, status: 'IN_PROGRESS' });
  broadcastAll({ type: 'booking_updated', bookingId: booking.id, status: 'IN_PROGRESS' });
  console.log(`▶ ${bookingId} is now IN_PROGRESS (${startsAt.toISOString()} → ${endsAt.toISOString()})`);
}

async function completeSession(bookingId = 'bk-after-sun-2') {
  const existing = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { artist: true } });
  const booking = await prisma.booking.update({ where: { id: bookingId }, data: { status: 'COMPLETED' } });
  await prisma.sessionLog.upsert({
    where: { booking_id: booking.id },
    update: { ended_at: new Date() },
    create: { booking_id: booking.id, artist_id: booking.artist_id, started_at: booking.starts_at, ended_at: new Date() },
  });
  await emitActivityEvent('session.completed', { artist_id: booking.artist_id, booking_id: booking.id });
  await syncStudioCircleMembership(booking.studio_id, booking.artist_id);
  broadcastToUser(existing.artist.user_id, { type: 'booking_updated', bookingId: booking.id, status: 'COMPLETED' });
  broadcastAll({ type: 'booking_updated', bookingId: booking.id, status: 'COMPLETED' });
  console.log(`✔ ${bookingId} is now COMPLETED — session.completed emitted, Studio Circle membership resynced`);
}

async function confirmBooking(bookingId: string) {
  if (!bookingId) throw new Error('confirm-booking requires a booking id');
  const existing = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { artist: true } });
  const booking = await prisma.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED' } });
  await emitActivityEvent('booking.confirmed', { artist_id: booking.artist_id, booking_id: booking.id });
  broadcastToUser(existing.artist.user_id, { type: 'booking_updated', bookingId: booking.id, status: 'CONFIRMED' });
  broadcastAll({ type: 'booking_updated', bookingId: booking.id, status: 'CONFIRMED' });
  console.log(`✔ ${bookingId} is now CONFIRMED — booking.confirmed emitted`);
}

async function confirmCredit(creditId: string) {
  if (!creditId) throw new Error('confirm-credit requires a credit id');
  const result = await prisma.projectCredit.updateMany({ where: { id: creditId, status: 'DRAFT' }, data: { status: 'CONFIRMED', is_public: true } });
  if (result.count === 0) throw new Error(`Credit ${creditId} was not in DRAFT (already decided, or missing)`);
  console.log(`✔ ${creditId} is now CONFIRMED`);
}

const actions: Record<string, () => Promise<void>> = {
  'start-session':    () => startSession(arg),
  'complete-session': () => completeSession(arg),
  'confirm-booking':  () => confirmBooking(arg),
  'confirm-credit':   () => confirmCredit(arg),
};

async function main() {
  const run = actions[action];
  if (!run) {
    console.error(`Unknown action "${action}". Available: ${Object.keys(actions).join(', ')}`);
    process.exit(1);
  }
  await run();
}

main()
  .catch((e) => { console.error('❌ Trigger failed:', e.message ?? e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
