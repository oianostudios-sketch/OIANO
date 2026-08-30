// prisma/seed-ecosystem.ts
// Development-only test creative ecosystem for OIANO StudioOS.
//
// Builds a small, believable network of real work relationships — a studio,
// a manager, two producers, two specialist collaborators, and six artists at
// six different maturity levels — connected entirely through real Projects,
// Bookings and ProjectCredits. Nothing here manually fakes a relationship
// that should be derivable from work: Studio Circle membership is produced
// by calling the exact same syncStudioCircleMembership() the booking-status
// controller calls on every real COMPLETED booking, not a hand-inserted row.
//
// SAFETY: refuses to run unless ALLOW_DEV_SEED=true is explicitly set, and
// always refuses when NODE_ENV=production. This is a stronger guard than the
// existing prisma/seed.ts (which only checks NODE_ENV) — deliberately, since
// this script creates a much larger fictional population and is meant to be
// re-run often during development, not once at project setup.
//
// Run:   npm run db:seed:ecosystem   (from repo root or apps/api)
// Idempotent: every entity uses a stable fixture id/email and upsert, so
// re-running never duplicates people, studios or projects.

import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { applyWalletDelta } from '../apps/api/src/lib/walletLedger';
import { syncStudioCircleMembership } from '../apps/api/src/services/studio-circle.service';

if (process.env.NODE_ENV === 'production') {
  throw new Error('seed-ecosystem.ts refuses to run when NODE_ENV=production');
}
if (process.env.ALLOW_DEV_SEED !== 'true') {
  throw new Error(
    'seed-ecosystem.ts requires ALLOW_DEV_SEED=true to be set explicitly.\n' +
    'This creates ~11 fictional accounts, 6 projects and real booking history —\n' +
    'set ALLOW_DEV_SEED=true only when you are certain DATABASE_URL points at a\n' +
    'development/shared-test database you are willing to populate with fixtures.',
  );
}

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_ECOSYSTEM_PASSWORD ?? 'ecosystem123';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * DAY);
const daysFromNow = (n: number) => new Date(now + n * DAY);

async function hash(pw: string) { return bcrypt.hash(pw, 10); }

async function main() {
  console.log('🌐 Seeding OIANO test creative ecosystem...\n');

  // ── Studio: OIANO Studios ────────────────────────────────────────────────
  const studio = await prisma.studio.upsert({
    where: { slug: 'oiano-studios' },
    update: {},
    create: {
      slug: 'oiano-studios',
      name: 'OIANO Studios',
      timezone: 'Africa/Freetown',
      currency: 'USD',
      address: '14 Wilkinson Road, Freetown, Sierra Leone',
      email: 'hello@oianostudios.example.test',
    },
  });
  const [roomA, roomB] = await Promise.all([
    prisma.room.upsert({ where: { id: 'oiano-room-a' }, update: {}, create: { id: 'oiano-room-a', studio_id: studio.id, name: 'Room A', capacity: 6, description: 'Main tracking room', hourly_rate: 40 } }),
    prisma.room.upsert({ where: { id: 'oiano-room-b' }, update: {}, create: { id: 'oiano-room-b', studio_id: studio.id, name: 'Room B', capacity: 3, description: 'Mix and mastering suite', hourly_rate: 32 } }),
  ]);
  const [svcRecording, svcMix] = await Promise.all([
    prisma.serviceOffering.upsert({ where: { id: 'oiano-svc-recording' }, update: {}, create: { id: 'oiano-svc-recording', studio_id: studio.id, category: 'RECORDING', name: 'Recording Session', description: 'Tracking time with an engineer', min_price_usd: 30, max_price_usd: 40, unit: 'hour' } }),
    prisma.serviceOffering.upsert({ where: { id: 'oiano-svc-mixmaster' }, update: {}, create: { id: 'oiano-svc-mixmaster', studio_id: studio.id, category: 'MIX_MASTER', name: 'Mix & Master', description: 'Mixing and mastering per track', min_price_usd: 60, max_price_usd: 90, unit: 'track' } }),
  ]);
  // Bookable engineer *resources* for Booking.engineer_id — deliberately not
  // linked to Musa/Kaan's own logins (user_id left null). Their own login
  // identity is the Producer account below; this is only the studio-side
  // "who's assigned to this session" resource, same shape as the existing
  // seed.ts's Marcus/Priya/Torre.
  const [engMusaResource, engKaanResource] = await Promise.all([
    prisma.engineer.upsert({ where: { id: 'oiano-eng-musa' }, update: {}, create: { id: 'oiano-eng-musa', studio_id: studio.id, name: 'Musa Conteh', specialties: ['Afrofusion', 'R&B', 'Tracking'] } }),
    prisma.engineer.upsert({ where: { id: 'oiano-eng-kaan' }, update: {}, create: { id: 'oiano-eng-kaan', studio_id: studio.id, name: 'Kaan Demir', specialties: ['Mixing', 'Hip-Hop', 'Drill'] } }),
  ]);
  console.log(`✅ Studio: ${studio.name} (${roomA.name}, ${roomB.name})`);

  // Cross-studio realism for the ESTABLISHED artist — reuse the existing
  // primary seed studio if it exists (from prisma/seed.ts); if not, this
  // block is skipped and Leo simply has one studio instead of two.
  const dreamz = await prisma.studio.findUnique({ where: { slug: 'dreamz-music-lab' } });

  // ── People ───────────────────────────────────────────────────────────────
  const passwordHash = await hash(PASSWORD);

  async function upsertUser(email: string, role: UserRole) {
    return prisma.user.upsert({ where: { email }, update: { password_hash: passwordHash, role }, create: { email, password_hash: passwordHash, role } });
  }

  // Manager
  const aminaUser = await upsertUser('amina.manager@example.test', 'STUDIO_ADMIN');
  await prisma.studioStaff.upsert({
    where: { user_id_studio_id: { user_id: aminaUser.id, studio_id: studio.id } },
    update: { position: 'MANAGER', capabilities: ['MANAGE_BOOKINGS', 'MANAGE_CALENDAR', 'MANAGE_STAFF', 'MANAGE_POLICIES', 'VIEW_FINANCE'] },
    create: { user_id: aminaUser.id, studio_id: studio.id, role: 'STUDIO_ADMIN', position: 'MANAGER', capabilities: ['MANAGE_BOOKINGS', 'MANAGE_CALENDAR', 'MANAGE_STAFF', 'MANAGE_POLICIES', 'VIEW_FINANCE'] },
  });
  console.log('✅ Manager: Amina Kamara <amina.manager@example.test>');

  // Producers (Musa, Kaan) + specialist collaborators (Nia, Daniel) — all
  // represented as Producer accounts, the platform's existing "creative
  // professional, not tied to one studio" identity. Closest existing
  // representation for "specialist collaborator" per the brief's own
  // instruction not to invent a new role just for seed fixtures.
  async function upsertProducer(email: string, name: string, alias: string, primary: string, disciplines: string[], bio: string) {
    const user = await upsertUser(email, 'PRODUCER');
    const producer = await prisma.producer.upsert({
      where: { user_id: user.id },
      update: { name, alias, bio, primary_discipline: primary, disciplines: disciplines as any, onboarding_complete: true },
      create: { user_id: user.id, name, alias, bio, primary_discipline: primary, disciplines: disciplines as any, onboarding_complete: true },
    });
    await prisma.producerPassport.upsert({
      where: { producer_id: producer.id },
      update: {},
      create: { producer_id: producer.id, passport_code: `PROD-${alias.toUpperCase().slice(0, 4)}`, profile_strength: 60 },
    });
    return { user, producer };
  }

  const musa = await upsertProducer('musa.producer@example.test', 'Musa Conteh', 'MUSA', 'PRODUCER', ['PRODUCER', 'RECORDING_ENGINEER'], 'Producer and recording engineer, Freetown-rooted, credits across Afrofusion and R&B.');
  const kaan = await upsertProducer('kaan.producer@example.test', 'Kaan Demir', 'KAAN', 'MIX_ENGINEER', ['MIX_ENGINEER', 'PRODUCER'], 'Mix engineer and producer working across Hip-Hop and Drill.');
  const nia = await upsertProducer('nia.collaborator@example.test', 'Nia Roberts', 'NIA', 'SONGWRITER', ['SONGWRITER', 'VOCALIST'], 'Songwriter and vocal arranger, specialist session collaborator.');
  const daniel = await upsertProducer('daniel.collaborator@example.test', 'Daniel Okoro', 'DANIEL', 'MASTERING_ENGINEER', ['MASTERING_ENGINEER'], 'Mastering engineer, final-stage specialist across genres.');
  console.log('✅ Producers/collaborators: Musa Conteh, Kaan Demir, Nia Roberts, Daniel Okoro');

  // Artists — six people, six different maturity levels.
  async function upsertArtist(email: string, name: string, alias: string, bio: string, genres: string[]) {
    const user = await upsertUser(email, 'ARTIST');
    const artist = await prisma.artist.upsert({
      where: { user_id: user.id },
      update: { name, alias, bio },
      create: { user_id: user.id, name, alias, bio },
    });
    await prisma.artistPassport.upsert({
      where: { artist_id: artist.id },
      update: {},
      create: { artist_id: artist.id, passport_code: `OIANO-${alias.toUpperCase().slice(0, 4)}`, profile_strength: genres.length ? 55 : 15, creative_dna: genres.length ? { genres, vocal_type: null, energy_profile: null, key_themes: [] } : {} },
    });
    const wallet = await prisma.wallet.upsert({ where: { artist_id: artist.id }, update: {}, create: { artist_id: artist.id, balance_usd: 0 } });
    return { user, artist, wallet };
  }

  const joseph  = await upsertArtist('joseph.artist@example.test',  'Joseph Test',   'JOSEPH',  'Songwriter blending R&B, Soul and Afrofusion.', ['R&B', 'Soul', 'Afrofusion']);
  const mariama = await upsertArtist('mariama.artist@example.test', 'Mariama Cole',  'MARIAMA', 'Singer-songwriter, Afropop.',                    ['Afropop']);
  const ibrahim = await upsertArtist('ibrahim.artist@example.test', 'Ibrahim Sesay', 'IBRAHIM', 'Rapper — Hip-Hop and Drill.',                     ['Hip-Hop', 'Drill']);
  const ada     = await upsertArtist('ada.artist@example.test',     'Ada Mensah',    'ADA',     '',                                                []); // BLANK on purpose
  const leo     = await upsertArtist('leo.artist@example.test',     'Leo Martin',    'LEO',     'Pop songwriter with a multi-studio catalogue.',   ['Pop']);
  const sorie   = await upsertArtist('sorie.artist@example.test',   'Sorie Bangura', 'SORIE',   'Afrobeats artist, currently between projects.',   ['Afrobeats']);
  console.log('✅ Artists: Joseph (active), Mariama (early), Ibrahim (active), Ada (blank), Leo (established), Sorie (dormant)\n');

  // ── Wallets — real test values, never touching Stripe ───────────────────
  async function fund(walletId: string, amount: number, label: string) {
    const w = await prisma.wallet.findUnique({ where: { id: walletId } });
    if (!w || Number(w.balance_usd) !== 0) return; // don't stack on re-run
    await prisma.$transaction((tx) => applyWalletDelta(tx, walletId, amount, 'initial_grant', label));
  }
  await fund(joseph.wallet.id, 300, 'Ecosystem fixture funding');
  await fund(mariama.wallet.id, 5, 'Ecosystem fixture funding (intentionally low)');
  await fund(leo.wallet.id, 150, 'Ecosystem fixture funding');
  await fund(sorie.wallet.id, 40, 'Ecosystem fixture funding');
  // ibrahim and ada stay at 0 — ibrahim to prove an outstanding-payment path,
  // ada because a blank artist has no reason to hold studio credit yet.
  console.log('✅ Wallets funded (Joseph $300, Mariama $5 — insufficient on purpose, Leo $150, Sorie $40; Ibrahim & Ada $0)\n');

  // ── Projects + real work relationships ───────────────────────────────────
  type Studio = typeof studio;
  async function upsertProject(id: string, title: string, producerId: string, artistId: string | null, phase: string, studioForBookings: Studio) {
    return prisma.project.upsert({
      where: { id },
      update: { title, phase: phase as any },
      create: { id, title, producer_id: producerId, artist_id: artistId, phase: phase as any, is_active: phase !== 'DELIVERED' },
    });
  }

  const afterSun     = await upsertProject('proj-after-sun',     'After Sun',      musa.producer.id, joseph.artist.id,  'MIXING',        studio);
  const twoWorlds     = await upsertProject('proj-two-worlds',    'Two Worlds',     musa.producer.id, mariama.artist.id, 'EDITING',       studio);
  const nightDrive    = await upsertProject('proj-night-drive',   'Night Drive',    kaan.producer.id, ibrahim.artist.id, 'TRACKING',      studio);
  const solarFlare    = await upsertProject('proj-solar-flare',   'Solar Flare',    kaan.producer.id, joseph.artist.id,  'MASTERING',     studio);
  const drillTape     = await upsertProject('proj-drill-tape',    'Drill Tape Vol.1', musa.producer.id, ibrahim.artist.id, 'TRACKING',    studio);
  const goldenHour    = await upsertProject('proj-golden-hour',   'Golden Hour',    musa.producer.id, leo.artist.id,      'DELIVERED',    dreamz ?? studio);
  const midnightCalls = await upsertProject('proj-midnight-calls','Midnight Calls', kaan.producer.id, leo.artist.id,      'MASTERING',    studio);
  const homebound     = await upsertProject('proj-homebound',     'Homebound',      musa.producer.id, sorie.artist.id,    'DELIVERED',    studio);
  console.log('✅ Projects: After Sun, Two Worlds, Night Drive, Solar Flare, Drill Tape Vol.1, Golden Hour, Midnight Calls, Homebound');

  // Participants — the collaborators who aren't the project's producer/artist
  // of record, exactly the ProjectParticipant shape the app already uses.
  async function addParticipant(id: string, projectId: string, displayName: string, role: string, participantType: string, refId: string) {
    await prisma.projectParticipant.upsert({
      where: { id },
      update: {},
      create: { id, project_id: projectId, display_name: displayName, role, participant_type: participantType, participant_ref_id: refId, status: 'ACTIVE', added_by: musa.user.id },
    });
  }
  await addParticipant('pp-after-sun-kaan', afterSun.id, 'Kaan Demir', 'Recording Engineer', 'PRODUCER', kaan.producer.id);
  await addParticipant('pp-after-sun-nia',  afterSun.id, 'Nia Roberts', 'Vocal Arrangement', 'PRODUCER', nia.producer.id);
  await addParticipant('pp-two-worlds-daniel', twoWorlds.id, 'Daniel Okoro', 'Mastering', 'PRODUCER', daniel.producer.id);
  await addParticipant('pp-night-drive-joseph', nightDrive.id, 'Joseph Test', 'Featured Vocals', 'ARTIST', joseph.artist.id);
  await addParticipant('pp-midnight-calls-daniel', midnightCalls.id, 'Daniel Okoro', 'Mastering', 'PRODUCER', daniel.producer.id);
  console.log('✅ Project participants: Kaan+Nia on After Sun, Daniel on Two Worlds & Midnight Calls, Joseph featured on Night Drive');

  // Credits — real provenance states that exist in the app today (DRAFT →
  // CONFIRMED/DISPUTED via /api/contributions), not invented ones.
  async function upsertCredit(id: string, projectId: string, name: string, role: string, status: string, refId?: string) {
    await prisma.projectCredit.upsert({
      where: { id },
      update: { status },
      create: { id, project_id: projectId, credited_name: name, role, status, participant_id: refId, added_by: musa.user.id, is_public: status === 'CONFIRMED' },
    });
  }
  await upsertCredit('credit-after-sun-musa', afterSun.id, 'Musa Conteh', 'PRODUCER', 'CONFIRMED');
  await upsertCredit('credit-after-sun-kaan', afterSun.id, 'Kaan Demir', 'RECORDING_ENGINEER', 'CONFIRMED');
  await upsertCredit('credit-after-sun-nia', afterSun.id, 'Nia Roberts', 'VOCAL_ARRANGEMENT', 'DRAFT'); // still mixing — unconfirmed on purpose
  await upsertCredit('credit-two-worlds-musa', twoWorlds.id, 'Musa Conteh', 'PRODUCER', 'CONFIRMED');
  await upsertCredit('credit-night-drive-kaan', nightDrive.id, 'Kaan Demir', 'PRODUCER', 'CONFIRMED');
  await upsertCredit('credit-night-drive-joseph', nightDrive.id, 'Joseph Test', 'FEATURED_VOCALS', 'DRAFT');
  await upsertCredit('credit-solar-flare-kaan', solarFlare.id, 'Kaan Demir', 'PRODUCER', 'CONFIRMED');
  await upsertCredit('credit-drill-tape-musa', drillTape.id, 'Musa Conteh', 'PRODUCER', 'CONFIRMED');
  await upsertCredit('credit-golden-hour-musa', goldenHour.id, 'Musa Conteh', 'PRODUCER', 'CONFIRMED');
  await upsertCredit('credit-midnight-calls-kaan', midnightCalls.id, 'Kaan Demir', 'PRODUCER', 'CONFIRMED');
  await upsertCredit('credit-midnight-calls-daniel', midnightCalls.id, 'Daniel Okoro', 'MASTERING_ENGINEER', 'CONFIRMED');
  await upsertCredit('credit-homebound-musa', homebound.id, 'Musa Conteh', 'PRODUCER', 'CONFIRMED');
  console.log('✅ Credits: mix of CONFIRMED and DRAFT across PRODUCER, RECORDING_ENGINEER, VOCAL_ARRANGEMENT, FEATURED_VOCALS, MASTERING_ENGINEER roles\n');

  // ── Bookings — the actual work that produces Studio Circle membership ───
  // studio_circle_members rows are NEVER created directly below — every one
  // comes from calling the real syncStudioCircleMembership() after a booking
  // is marked COMPLETED, exactly like updateBookingStatus() does in
  // production. This is the concrete proof that "work creates the network."
  async function booking(id: string, artistId: string, roomId: string, engineerId: string | null, serviceId: string, projectId: string | null, startsAt: Date, endsAt: Date, status: string, totalUsd: number, studioId: string) {
    const b = await prisma.booking.upsert({
      where: { id },
      update: { status: status as any },
      create: { id, studio_id: studioId, artist_id: artistId, room_id: roomId, engineer_id: engineerId, service_id: serviceId, project_id: projectId, starts_at: startsAt, ends_at: endsAt, status: status as any, total_usd: totalUsd },
    });
    if (status === 'COMPLETED') await syncStudioCircleMembership(studioId, artistId);
    return b;
  }

  // After Sun — Joseph: one completed tracking session, one confirmed
  // upcoming mixing session (the natural "current live scenario" candidate;
  // flip it live with scripts/dev-ecosystem-triggers.ts start-session).
  await booking('bk-after-sun-1', joseph.artist.id, roomA.id, engMusaResource.id, svcRecording.id, afterSun.id, daysAgo(9), daysAgo(8.6), 'COMPLETED', 120, studio.id);
  await booking('bk-after-sun-2', joseph.artist.id, roomB.id, engKaanResource.id, svcMix.id, afterSun.id, daysFromNow(2), daysFromNow(2.15), 'CONFIRMED', 180, studio.id);
  await prisma.payment.upsert({ where: { booking_id: 'bk-after-sun-2' }, update: {}, create: { booking_id: 'bk-after-sun-2', provider: 'wallet', status: 'PAID', amount_usd: 180, paid_at: daysAgo(1) } });

  // Two Worlds — Mariama: exactly 2 completed sessions (early-artist spec).
  await booking('bk-two-worlds-1', mariama.artist.id, roomA.id, engMusaResource.id, svcRecording.id, twoWorlds.id, daysAgo(14), daysAgo(13.7), 'COMPLETED', 90, studio.id);
  await booking('bk-two-worlds-2', mariama.artist.id, roomA.id, engMusaResource.id, svcRecording.id, twoWorlds.id, daysAgo(10), daysAgo(9.7), 'COMPLETED', 90, studio.id);

  // Night Drive — Ibrahim: completed + upcoming (unpaid, on purpose) + the
  // one cancelled booking the brief asks for.
  await booking('bk-night-drive-1', ibrahim.artist.id, roomA.id, engKaanResource.id, svcRecording.id, nightDrive.id, daysAgo(11), daysAgo(10.6), 'COMPLETED', 100, studio.id);
  await booking('bk-night-drive-cancelled', ibrahim.artist.id, roomA.id, engKaanResource.id, svcRecording.id, nightDrive.id, daysAgo(5), daysAgo(4.7), 'CANCELLED', 100, studio.id);
  const ndUpcoming = await booking('bk-night-drive-2', ibrahim.artist.id, roomB.id, engKaanResource.id, svcMix.id, nightDrive.id, daysFromNow(4), daysFromNow(4.2), 'CONFIRMED', 150, studio.id);
  await prisma.payment.upsert({ where: { booking_id: ndUpcoming.id }, update: {}, create: { booking_id: ndUpcoming.id, provider: 'wallet', status: 'UNPAID', amount_usd: 150 } });

  // Solar Flare — Joseph + Kaan (second owned project → real two-producer orbit)
  await booking('bk-solar-flare-1', joseph.artist.id, roomB.id, engKaanResource.id, svcMix.id, solarFlare.id, daysAgo(3), daysAgo(2.85), 'COMPLETED', 130, studio.id);

  // Drill Tape — Ibrahim + Musa (second owned project)
  await booking('bk-drill-tape-1', ibrahim.artist.id, roomA.id, engMusaResource.id, svcRecording.id, drillTape.id, daysAgo(2), daysAgo(1.7), 'COMPLETED', 90, studio.id);

  // Golden Hour — Leo, at Dreamz Music Lab if it exists (multi-studio orbit)
  await booking('bk-golden-hour-1', leo.artist.id, (dreamz ? (await prisma.room.findFirst({ where: { studio_id: dreamz.id } }))?.id ?? roomA.id : roomA.id), null, svcRecording.id, goldenHour.id, daysAgo(60), daysAgo(59.6), 'COMPLETED', 110, dreamz?.id ?? studio.id);
  await booking('bk-golden-hour-2', leo.artist.id, (dreamz ? (await prisma.room.findFirst({ where: { studio_id: dreamz.id } }))?.id ?? roomA.id : roomA.id), null, svcMix.id, goldenHour.id, daysAgo(50), daysAgo(49.8), 'COMPLETED', 140, dreamz?.id ?? studio.id);
  const ghPayment = await prisma.booking.findUnique({ where: { id: 'bk-golden-hour-2' } });
  if (ghPayment) await prisma.payment.upsert({ where: { booking_id: ghPayment.id }, update: {}, create: { booking_id: ghPayment.id, provider: 'stripe', status: 'PAID', amount_usd: 140, paid_at: daysAgo(49) } });

  // Midnight Calls — Leo + Kaan, at OIANO Studios (second producer relationship)
  await booking('bk-midnight-calls-1', leo.artist.id, roomA.id, engKaanResource.id, svcRecording.id, midnightCalls.id, daysAgo(20), daysAgo(19.7), 'COMPLETED', 100, studio.id);
  await booking('bk-midnight-calls-2', leo.artist.id, roomB.id, engKaanResource.id, svcMix.id, midnightCalls.id, daysAgo(12), daysAgo(11.8), 'COMPLETED', 160, studio.id);

  // Homebound — Sorie: history exists, nothing recent (dormant proof)
  await booking('bk-homebound-1', sorie.artist.id, roomA.id, engMusaResource.id, svcRecording.id, homebound.id, daysAgo(90), daysAgo(89.6), 'COMPLETED', 95, studio.id);
  await booking('bk-homebound-2', sorie.artist.id, roomA.id, engMusaResource.id, svcRecording.id, homebound.id, daysAgo(80), daysAgo(79.7), 'COMPLETED', 95, studio.id);

  console.log('✅ Bookings: past completed, one upcoming paid, one upcoming unpaid, one cancelled — Studio Circle membership derived live from each COMPLETED one\n');

  console.log('🌐 Ecosystem seed complete.\n');
}

main()
  .catch((e) => { console.error('❌ Ecosystem seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
