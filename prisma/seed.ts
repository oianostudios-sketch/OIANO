// prisma/seed.ts
// Run: npx ts-node prisma/seed.ts

import { PrismaClient, UserRole, ServiceCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Dreamz Music Lab...');

  // ── Studio ──────────────────────────────────────────────────────────────────
  const studio = await prisma.studio.upsert({
    where: { slug: 'dreamz-music-lab' },
    update: {},
    create: {
      slug: 'dreamz-music-lab',
      name: 'Dreamz Music Lab',
      timezone: 'America/New_York',
      currency: 'USD',
      address: '123 Studio Row, New York, NY 10001',
      email: 'hello@dreamzmusiclab.com',
      phone: '+1 (555) 000-0000',
    },
  });

  console.log('✅ Studio created:', studio.name);

  // ── Rooms ────────────────────────────────────────────────────────────────────
  const rooms = await Promise.all([
    prisma.room.upsert({
      where: { id: 'room-studio-a' },
      update: {},
      create: {
        id: 'room-studio-a',
        studio_id: studio.id,
        name: 'Studio A',
        capacity: 8,
        description: 'Main tracking room — SSL console, full live room',
        hourly_rate: 45,
      },
    }),
    prisma.room.upsert({
      where: { id: 'room-studio-b' },
      update: {},
      create: {
        id: 'room-studio-b',
        studio_id: studio.id,
        name: 'Studio B',
        capacity: 4,
        description: 'Production suite — Ableton + analog outboard',
        hourly_rate: 30,
      },
    }),
    prisma.room.upsert({
      where: { id: 'room-vocal-booth' },
      update: {},
      create: {
        id: 'room-vocal-booth',
        studio_id: studio.id,
        name: 'Vocal Booth',
        capacity: 2,
        description: 'Dedicated isolation booth — Neumann U87',
        hourly_rate: 25,
      },
    }),
  ]);

  console.log('✅ Rooms created:', rooms.map((r) => r.name).join(', '));

  // ── Engineers ────────────────────────────────────────────────────────────────
  const engineers = await Promise.all([
    prisma.engineer.upsert({
      where: { id: 'eng-marcus' },
      update: {},
      create: {
        id: 'eng-marcus',
        studio_id: studio.id,
        name: 'Marcus Dean',
        specialties: ['Hip-Hop', 'R&B', 'Mixing'],
        hourly_rate_usd: 40,
        bio: '10+ years tracking and mixing. Credits include major label artists across Hip-Hop and R&B.',
      },
    }),
    prisma.engineer.upsert({
      where: { id: 'eng-priya' },
      update: {},
      create: {
        id: 'eng-priya',
        studio_id: studio.id,
        name: 'Priya Nair',
        specialties: ['Pop', 'Electronic', 'Mastering'],
        hourly_rate_usd: 45,
        bio: 'Specialist in modern pop production and loudness-compliant mastering.',
      },
    }),
    prisma.engineer.upsert({
      where: { id: 'eng-torre' },
      update: {},
      create: {
        id: 'eng-torre',
        studio_id: studio.id,
        name: 'Torre Williams',
        specialties: ['Afrobeats', 'Gospel', 'Live Recording'],
        hourly_rate_usd: 35,
        bio: 'Live recording specialist with deep roots in Afrobeats and Gospel.',
      },
    }),
  ]);

  console.log('✅ Engineers created:', engineers.map((e) => e.name).join(', '));

  // ── Services ─────────────────────────────────────────────────────────────────
  const services = await Promise.all([
    prisma.serviceOffering.upsert({
      where: { id: 'svc-recording' },
      update: {},
      create: {
        id: 'svc-recording',
        studio_id: studio.id,
        category: ServiceCategory.RECORDING,
        name: 'Recording Session',
        description: 'Hourly studio time with engineer',
        min_price_usd: 25,
        max_price_usd: 45,
        unit: 'hour',
      },
    }),
    prisma.serviceOffering.upsert({
      where: { id: 'svc-full-day' },
      update: {},
      create: {
        id: 'svc-full-day',
        studio_id: studio.id,
        category: ServiceCategory.FULL_DAY,
        name: 'Full Day Block',
        description: '10-hour studio block — best value',
        min_price_usd: 180,
        max_price_usd: 260,
        unit: 'session',
      },
    }),
    prisma.serviceOffering.upsert({
      where: { id: 'svc-mix-master' },
      update: {},
      create: {
        id: 'svc-mix-master',
        studio_id: studio.id,
        category: ServiceCategory.MIX_MASTER,
        name: 'Mix & Master',
        description: 'Professional mixing and mastering per track',
        min_price_usd: 65,
        max_price_usd: 130,
        unit: 'track',
      },
    }),
    prisma.serviceOffering.upsert({
      where: { id: 'svc-coaching' },
      update: {},
      create: {
        id: 'svc-coaching',
        studio_id: studio.id,
        category: ServiceCategory.COACHING,
        name: 'Artist Coaching',
        description: '1-on-1 coaching: vocal technique, stage presence, artistry',
        min_price_usd: 35,
        max_price_usd: 55,
        unit: 'hour',
      },
    }),
    prisma.serviceOffering.upsert({
      where: { id: 'svc-events' },
      update: {},
      create: {
        id: 'svc-events',
        studio_id: studio.id,
        category: ServiceCategory.EVENT,
        name: 'Event / Private Hire',
        description: 'Studio hire for events, showcases, and listening parties',
        min_price_usd: 50,
        max_price_usd: 100,
        unit: 'hour',
      },
    }),
    prisma.serviceOffering.upsert({
      where: { id: 'svc-membership' },
      update: {},
      create: {
        id: 'svc-membership',
        studio_id: studio.id,
        category: ServiceCategory.MEMBERSHIP,
        name: 'Artist Membership',
        description: 'Monthly plan — priority booking + discounted rates',
        min_price_usd: 85,
        max_price_usd: 150,
        unit: 'month',
      },
    }),
  ]);

  console.log('✅ Services created:', services.map((s) => s.name).join(', '));

  // ── Seed credentials — read from env, never hardcoded ───────────────────────
  // Passwords: read from env for production; fall back to demo defaults for local dev
  const ADMIN_PASSWORD    = process.env.SEED_ADMIN_PASSWORD    ?? 'admin123';
  const ARTIST_PASSWORD   = process.env.SEED_ARTIST_PASSWORD   ?? 'artist123';
  const ENGINEER_PASSWORD = process.env.SEED_ENGINEER_PASSWORD ?? 'engineer123';
  const PRODUCER_PASSWORD = process.env.SEED_PRODUCER_PASSWORD ?? 'producer123';

  // ── Admin User ───────────────────────────────────────────────────────────────
  const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@dreamzmusiclab.com' },
    update: { password_hash: adminPasswordHash },
    create: {
      email: 'admin@dreamzmusiclab.com',
      password_hash: adminPasswordHash,
      role: UserRole.STUDIO_ADMIN,
      studio_staff: {
        create: {
          studio_id: studio.id,
          role: UserRole.STUDIO_ADMIN,
        },
      },
    },
  });

  console.log('✅ Admin user created:', admin.email);

  // ── Demo Artist ──────────────────────────────────────────────────────────────
  const artistPasswordHash = await bcrypt.hash(ARTIST_PASSWORD, 10);
  const artistUser = await prisma.user.upsert({
    where: { email: 'demo@artist.com' },
    update: { password_hash: artistPasswordHash },
    create: {
      email: 'demo@artist.com',
      password_hash: artistPasswordHash,
      role: UserRole.ARTIST,
      artist: {
        create: {
          name: 'Zara Nova',
          alias: 'ZNOVA',
          bio: 'Afro-pop artist blending Lagos rhythms with New York production',
          passport: {
            create: {
              passport_code: 'OIANO-Z001',
              profile_strength: 72,
              creative_dna: {
                genres: ['Afro-pop', 'R&B', 'Electronic'],
                influences: ['Burna Boy', 'Sza', 'Wizkid'],
                vocal_type: 'Mezzo-soprano',
                energy_profile: 'high',
                key_themes: ['Identity', 'Resilience', 'Love'],
              },
            },
          },
          wallet: {
            create: {
              balance_usd: 500.0,
            },
          },
        },
      },
    },
  });

  // Always ensure demo artist has a funded wallet — safe to re-run
  const demoArtist = await prisma.artist.findUnique({ where: { user_id: artistUser.id } });
  if (demoArtist) {
    await prisma.wallet.upsert({
      where: { artist_id: demoArtist.id },
      update: { balance_usd: 500.0 },
      create: { artist_id: demoArtist.id, balance_usd: 500.0 },
    });
  }

  console.log('✅ Demo artist created:', artistUser.email);

  // ── Engineer User ────────────────────────────────────────────────────────────
  const engineerPasswordHash = await bcrypt.hash(ENGINEER_PASSWORD, 10);
  const engineerUser = await prisma.user.upsert({
    where: { email: 'engineer@dreamzmusiclab.com' },
    update: { password_hash: engineerPasswordHash },
    create: {
      email: 'engineer@dreamzmusiclab.com',
      password_hash: engineerPasswordHash,
      role: UserRole.ENGINEER,
      studio_staff: {
        create: {
          studio_id: studio.id,
          role: UserRole.ENGINEER,
        },
      },
    },
  });

  console.log('✅ Engineer user created:', engineerUser.email);

  // Link the login to a real bookable Engineer record — previously the
  // logged-in "engineer" and the Engineer assigned to a booking (Marcus/
  // Priya/Torre) were disconnected, so the dashboard had no way to know
  // which of the studio's engineers was actually signed in.
  await prisma.engineer.update({
    where: { id: 'eng-marcus' },
    data: { user_id: engineerUser.id },
  });
  console.log('✅ Engineer user linked to: Marcus Dean');

  // ── Demo Producer ────────────────────────────────────────────────────────────
  const producerPasswordHash = await bcrypt.hash(PRODUCER_PASSWORD, 10);
  const producerUser = await prisma.user.upsert({
    where: { email: 'producer@dreamzmusiclab.com' },
    update: { password_hash: producerPasswordHash },
    create: {
      email: 'producer@dreamzmusiclab.com',
      password_hash: producerPasswordHash,
      role: UserRole.PRODUCER,
      producer: {
        create: {
          name: 'Kai Beats',
          alias: 'KAI',
          bio: 'Multi-genre producer specialising in Afro-trap and melodic drill.',
          passport: {
            create: {
              passport_code: 'PROD-K001',
              genres_produced: ['Afro-trap', 'Melodic Drill', 'R&B'],
              signature_tags: ['808 bass', 'live strings', 'lo-fi textures'],
              profile_strength: 68,
            },
          },
        },
      },
    },
  });

  console.log('✅ Demo producer created:', producerUser.email);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
