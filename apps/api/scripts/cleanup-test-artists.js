/**
 * One-off: remove dev/test artist accounts that accumulated across many
 * testing sessions (theme re-skin checks, photo-upload debugging, event-flow
 * verification, etc.) so the demo roster only shows real personas.
 *
 * Each artist_id below was individually checked against seed.ts, email
 * domain (@oiano.dev / @example.com / .walkin are all synthetic test
 * domains used during this project's testing), and passport completeness
 * before being listed here — this is NOT a blanket "delete everyone but
 * seed data" sweep.
 *
 * Run: node apps/api/scripts/cleanup-test-artists.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TARGET_ARTIST_IDS = [
  '8b7ea4a1-282f-4bc7-aae6-ab9db1115759', // passport-code-test@example.com
  '51af21eb-0586-4683-993d-f9bd8ba3232b', // phototest2@oiano.dev
  '8bce440c-be38-4ded-bcbb-b55adf5e0705', // syscheck@oiano.dev
  '555d8114-eb6c-4c06-98c4-3c5c6be62216', // theme-test@oiano.dev
  'e7d0bdf3-445d-4840-bf03-ea529a668a26', // store-sync-test@oiano.dev ("Nova Rae")
  '95699ac4-a55d-41e3-91c0-249794802933', // sequence.test@oiano.dev ("Nova Rae")
  'ac6d8ead-cbef-48db-9748-8115e44261fb', // eventflow.test@oiano.dev ("Test Artist Flow")
  '2efbf214-8c41-4abc-bd68-4e7b26d5ac11', // walkin-*@dreamz-music-lab.walkin ("Jordan Test Walk-in")
];

async function deleteArtist(artistId) {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    include: { user: true, wallet: true },
  });
  if (!artist) {
    console.log(`  (skip — not found: ${artistId})`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    const bookings = await tx.booking.findMany({ where: { artist_id: artistId }, select: { id: true } });
    const bookingIds = bookings.map(b => b.id);

    if (bookingIds.length > 0) {
      await tx.payment.deleteMany({ where: { booking_id: { in: bookingIds } } });
      await tx.bookingMessage.deleteMany({ where: { booking_id: { in: bookingIds } } });
    }
    await tx.sessionLog.deleteMany({ where: { artist_id: artistId } });
    if (bookingIds.length > 0) {
      await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
    }

    if (artist.wallet) {
      await tx.walletTransaction.deleteMany({ where: { wallet_id: artist.wallet.id } });
      await tx.walletTopUp.deleteMany({ where: { wallet_id: artist.wallet.id } });
      await tx.wallet.delete({ where: { id: artist.wallet.id } });
    }

    await tx.artistFile.deleteMany({ where: { artist_id: artistId } });
    await tx.activityEvent.deleteMany({ where: { artist_id: artistId } });

    // Projects only ever reference an artist optionally — detach, don't delete
    // the producer's project.
    await tx.project.updateMany({ where: { artist_id: artistId }, data: { artist_id: null } });

    const connections = await tx.passportConnection.findMany({
      where: { OR: [{ initiator_id: artistId }, { recipient_id: artistId }] },
      select: { id: true },
    });
    if (connections.length > 0) {
      // ConnectMessage cascades automatically (onDelete: Cascade on connection_id)
      await tx.passportConnection.deleteMany({ where: { id: { in: connections.map(c => c.id) } } });
    }

    await tx.artistPassport.deleteMany({ where: { artist_id: artistId } });
    await tx.artist.delete({ where: { id: artistId } });

    if (artist.user) {
      await tx.notification.deleteMany({ where: { user_id: artist.user.id } });
      await tx.user.delete({ where: { id: artist.user.id } });
    }
  }, { timeout: 20000 });

  console.log(`  deleted: ${artist.name} (${artist.user?.email ?? 'no user'})`);
}

async function main() {
  for (const id of TARGET_ARTIST_IDS) {
    await deleteArtist(id);
  }
  console.log(`\nDone. ${TARGET_ARTIST_IDS.length} test accounts processed.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
