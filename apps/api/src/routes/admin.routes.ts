import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { DEFAULT_STUDIO_SLUG } from '@oiano/shared';
import { broadcastAll } from './notifications.routes';
import { attachStudioScope } from '../middleware/studioScope.middleware';

export const adminRouter = Router();

// POST /api/admin/credit-request — artist-facing; no admin role required
// Must be declared BEFORE the adminRouter.use(authenticate, requireRole) middleware
const creditRequestRouter = Router();
creditRequestRouter.use(authenticate);
creditRequestRouter.post('/credit-request', async (req, res, next) => {
  try {
    const userId = (req as any).userId;
    const artist = await prisma.artist.findUnique({ where: { user_id: userId } });
    if (!artist) throw new AppError('Artist not found', 404);

    let wallet = await prisma.wallet.findUnique({ where: { artist_id: artist.id } });
    if (!wallet) {
      wallet = await prisma.wallet.create({ data: { artist_id: artist.id, balance_usd: 0 } });
    }

    await prisma.walletTransaction.create({
      data: {
        wallet_id: wallet.id,
        amount_usd: 0,
        type: 'credit_request',
        description: `${artist.name} requested studio credit`,
      },
    });

    res.json({ success: true, message: 'Credit request sent to studio admin' });
  } catch (err) { next(err); }
});

// Artist-facing read endpoint. Posting announcements remains admin-only.
creditRequestRouter.get('/announcements', async (_req, res, next) => {
  try {
    const db = prisma as any;
    const studio = await prisma.studio.findUnique({ where: { slug: DEFAULT_STUDIO_SLUG } });
    if (!studio) throw new AppError('Studio not found', 404);
    const announcements = await db.studioAnnouncement.findMany({
      where: { studio_id: studio.id },
      orderBy: { created_at: 'desc' },
      take: 10,
    });
    res.json(announcements);
  } catch (err) { next(err); }
});

export { creditRequestRouter };

adminRouter.use(authenticate, requireRole('STUDIO_ADMIN'), attachStudioScope);

adminRouter.get('/analytics', async (req, res, next) => {
  try {
    const studio = (req as any).studio;

    // Build UTC day boundaries for the last 14 days
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const fourteenDaysAgo = new Date(todayUTC.getTime() - 13 * 86_400_000);

    const [totalArtists, totalBookings, revenue, todayBookings, recentPayments, recentBookings, funnelCounts] = await Promise.all([
      prisma.artist.count({ where: { bookings: { some: { studio_id: studio.id } } } }),
      prisma.booking.count({ where: { studio_id: studio.id } }),
      prisma.payment.aggregate({
        where: { status: 'PAID', booking: { studio_id: studio.id } },
        _sum: { amount_usd: true },
      }),
      prisma.booking.findMany({
        where: {
          studio_id: studio.id,
          starts_at: {
            gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
            lte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)),
          },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        include: { artist: true, room: true, engineer: true },
        orderBy: { starts_at: 'asc' },
      }),
      // Payments for last 14 days — for 7-day sparkline + prior-week comparison
      prisma.payment.findMany({
        where: {
          status: 'PAID',
          booking: { studio_id: studio.id },
          paid_at: { gte: fourteenDaysAgo },
        },
        select: { amount_usd: true, paid_at: true },
      }),
      // Bookings (non-cancelled) for last 14 days — for session-count sparkline
      prisma.booking.findMany({
        where: {
          studio_id: studio.id,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          starts_at: { gte: fourteenDaysAgo },
        },
        select: { starts_at: true },
      }),
      // All-time funnel counts
      prisma.booking.groupBy({
        by: ['status'],
        where: { studio_id: studio.id },
        _count: { _all: true },
      }),
    ]);

    // Build 7-day arrays: index 0 = 6 days ago, index 6 = today
    type DayBucket = { date: string; revenue_usd: number; booking_count: number };
    const days: DayBucket[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(todayUTC.getTime() - (6 - i) * 86_400_000);
      return { date: d.toISOString().slice(0, 10), revenue_usd: 0, booking_count: 0 };
    });

    for (const p of recentPayments) {
      const date = new Date(p.paid_at!).toISOString().slice(0, 10);
      const bucket = days.find((d) => d.date === date);
      if (bucket) bucket.revenue_usd += Number(p.amount_usd);
    }
    for (const b of recentBookings) {
      const date = new Date(b.starts_at).toISOString().slice(0, 10);
      const bucket = days.find((d) => d.date === date);
      if (bucket) bucket.booking_count += 1;
    }

    const weekly  = days.slice(7);   // last 7 days (today + 6 prior)
    const prevWeek = days.slice(0, 7); // the 7 days before that
    const weekRevenue  = weekly.reduce((s, d) => s + d.revenue_usd, 0);
    const prevRevenue  = prevWeek.reduce((s, d) => s + d.revenue_usd, 0);
    const weekSessions = weekly.reduce((s, d) => s + d.booking_count, 0);
    const prevSessions = prevWeek.reduce((s, d) => s + d.booking_count, 0);

    // Funnel
    const funnelMap = Object.fromEntries(funnelCounts.map((r) => [r.status, r._count._all]));

    res.json({
      total_artists: totalArtists,
      total_bookings: totalBookings,
      total_revenue_usd: revenue._sum.amount_usd ?? 0,
      todays_bookings: todayBookings,
      weekly_days: days,          // 7-element array for sparkline
      week_revenue_usd: weekRevenue,
      prev_week_revenue_usd: prevRevenue,
      week_sessions: weekSessions,
      prev_week_sessions: prevSessions,
      funnel: {
        pending:   funnelMap['PENDING']     ?? 0,
        confirmed: funnelMap['CONFIRMED']   ?? 0,
        completed: funnelMap['COMPLETED']   ?? 0,
        no_show:   funnelMap['NO_SHOW']     ?? 0,
        cancelled: funnelMap['CANCELLED']   ?? 0,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/admin/wallet/credit — add funds to an artist's wallet
const WalletCreditSchema = z.object({
  artist_id: z.string().uuid(),
  amount_usd: z.number().positive().max(10000),
  description: z.string().optional(),
});

adminRouter.post('/wallet/credit', async (req, res, next) => {
  try {
    const { artist_id, amount_usd, description } = WalletCreditSchema.parse(req.body);

    const studioId = (req as any).studioId as string;
    const artist = await prisma.artist.findFirst({
      where: { id: artist_id, bookings: { some: { studio_id: studioId } } },
    });
    if (!artist) throw new AppError('Artist not found', 404);

    const wallet = await prisma.wallet.upsert({
      where: { artist_id },
      update: { balance_usd: { increment: amount_usd } },
      create: { artist_id, balance_usd: amount_usd },
    });

    await prisma.walletTransaction.create({
      data: {
        wallet_id: wallet.id,
        amount_usd,
        type: 'credit',
        description: description ?? `Admin credit — $${amount_usd}`,
      },
    });

    res.json({ success: true, artist_id, new_balance_usd: wallet.balance_usd });
  } catch (err) { next(err); }
});

// GET /api/admin/runsheet?date=YYYY-MM-DD — printable daily runsheet
// Also accessible to ENGINEER (they see all sessions, used as their daily schedule)
const RunsheetQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

adminRouter.get('/runsheet', async (req, res, next) => {
  try {
    const { date } = RunsheetQuery.parse(req.query);
    const target = date ? new Date(date) : new Date();
    const dayStart = new Date(target);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(target);
    dayEnd.setHours(23, 59, 59, 999);

    const studio = (req as any).studio;

    const bookings = await prisma.booking.findMany({
      where: {
        studio_id: studio.id,
        starts_at: { gte: dayStart, lte: dayEnd },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      include: {
        artist:   { select: { id: true, name: true, alias: true } },
        room:     { select: { id: true, name: true } },
        engineer: { select: { id: true, name: true } },
        service:  { select: { id: true, name: true } },
        payment:  { select: { status: true } },
      },
      orderBy: { starts_at: 'asc' },
    });

    // Detect room conflicts (same room, overlapping time)
    const conflictIds = new Set<string>();
    for (let i = 0; i < bookings.length; i++) {
      for (let j = i + 1; j < bookings.length; j++) {
        const a = bookings[i], bk = bookings[j];
        if (a.room?.id && a.room.id === bk.room?.id) {
          const aEnd = new Date(a.ends_at).getTime();
          const bStart = new Date(bk.starts_at).getTime();
          const bEnd = new Date(bk.ends_at).getTime();
          const aStart = new Date(a.starts_at).getTime();
          if (aStart < bEnd && aEnd > bStart) {
            conflictIds.add(a.id);
            conflictIds.add(bk.id);
          }
        }
      }
    }

    const mapped = bookings.map((b) => {
      // Call time = 15 min before session
      const callTime = new Date(b.starts_at);
      callTime.setMinutes(callTime.getMinutes() - 15);
      return {
        id: b.id,
        starts_at: b.starts_at,
        ends_at: b.ends_at,
        call_time: callTime.toISOString(),
        artist_name: b.artist.alias ?? b.artist.name,
        artist_id: b.artist.id,
        room: b.room?.name ?? '—',
        room_type: '',  // room_type not in schema — reserved for future
        room_id: b.room?.id ?? null,
        engineer: b.engineer?.name ?? '—',
        engineer_id: b.engineer?.id ?? null,
        service: b.service?.name ?? '—',
        status: b.status,
        payment_status: b.payment?.status ?? 'UNPAID',
        total_usd: Number(b.total_usd ?? 0),
        notes: b.notes ?? '',
        conflict: conflictIds.has(b.id),
      };
    });

    const totalExpected    = mapped.reduce((s, b) => s + b.total_usd, 0);
    const totalPaid        = mapped.filter(b => b.payment_status === 'PAID').reduce((s, b) => s + b.total_usd, 0);
    const totalOutstanding = totalExpected - totalPaid;

    res.json({
      date: dayStart.toISOString().split('T')[0],
      studio_name: studio.name,
      generated_at: new Date().toISOString(),
      revenue: { expected: totalExpected, paid: totalPaid, outstanding: totalOutstanding },
      bookings: mapped,
    });
  } catch (err) { next(err); }
});

// ── POST /api/admin/walkin — book a walk-in with no existing account ─────────
// Booking.artist_id is required by the schema, so we create a lightweight
// guest User+Artist (no password — password_hash stays null, so login is
// impossible for this account) and attach the booking to it. Payment is
// recorded as "cash" / UNPAID since walk-ins pay at the desk, not via wallet.
const WalkInSchema = z.object({
  name:              z.string().min(1).max(120),
  phone:             z.string().max(40).optional(),
  // Room ids are plain strings, not enforced-UUID — seeded rooms use
  // human-readable ids like "room-studio-a" (see prisma/seed.ts).
  room_id:           z.string().min(1),
  starts_at:         z.string().datetime(),
  duration_minutes:  z.number().int().positive().max(24 * 60),
  notes:             z.string().max(2000).optional(),
});

adminRouter.post('/walkin', async (req, res, next) => {
  try {
    const data = WalkInSchema.parse(req.body);

    const studio = (req as any).studio;

    const room = await prisma.room.findFirst({ where: { id: data.room_id, studio_id: studio.id } });
    if (!room) throw new AppError('Room not found', 404);

    // Default walk-ins onto the base hourly "Recording Session" service;
    // fall back to the cheapest hourly offering if the seed name changed.
    const service =
      (await prisma.serviceOffering.findFirst({ where: { studio_id: studio.id, category: 'RECORDING' } })) ??
      (await prisma.serviceOffering.findFirst({ where: { studio_id: studio.id }, orderBy: { min_price_usd: 'asc' } }));
    if (!service) throw new AppError('No service offerings configured for this studio', 500);

    const starts_at = new Date(data.starts_at);
    const ends_at   = new Date(starts_at.getTime() + data.duration_minutes * 60_000);

    // Conflict check — same room, overlapping time
    const conflict = await prisma.booking.findFirst({
      where: {
        room_id: data.room_id,
        status:  { notIn: ['CANCELLED', 'NO_SHOW'] },
        OR: [
          { starts_at: { lte: starts_at }, ends_at: { gt: starts_at } },
          { starts_at: { lt: ends_at },    ends_at: { gte: ends_at } },
        ],
      },
    });
    if (conflict) throw new AppError('That room is already booked for this time', 409);

    const hours = data.duration_minutes / 60;
    const total = Number(service.min_price_usd) * (service.unit === 'hour' ? hours : 1);

    // Create a guest account for the walk-in — no password, can't log in
    const guestEmail = `walkin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${studio.slug}.walkin`;
    const guestUser = await prisma.user.create({
      data: {
        email: guestEmail,
        password_hash: null,
        role: 'ARTIST',
        artist: {
          create: {
            name: data.name,
            bio: data.phone ? `Walk-in guest — phone: ${data.phone}` : 'Walk-in guest',
          },
        },
      },
      include: { artist: true },
    });
    const artist = guestUser.artist!;

    const booking = await prisma.booking.create({
      data: {
        studio_id:  studio.id,
        artist_id:  artist.id,
        room_id:    data.room_id,
        service_id: service.id,
        starts_at,
        ends_at,
        status:     'CONFIRMED',
        total_usd:  total,
        notes:      data.notes,
        payment: {
          create: {
            provider:   'cash',
            amount_usd: total,
            status:     'UNPAID',
          },
        },
      },
      include: { room: true, service: true, payment: true, artist: true },
    });

    broadcastAll({ type: 'booking_updated', bookingId: booking.id, status: booking.status });

    res.status(201).json(booking);
  } catch (err) { next(err); }
});

// ── GET /api/admin/credit-requests — pending credit requests ─────────────────
adminRouter.get('/credit-requests', async (req, res, next) => {
  try {
    const db = prisma as any;
    // credit_request transactions with amount 0 — join wallet → artist
    const requests = await db.walletTransaction.findMany({
      where: {
        type: 'credit_request',
        wallet: { artist: { bookings: { some: { studio_id: (req as any).studioId } } } },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
      include: {
        wallet: {
          include: {
            artist: { select: { id: true, name: true, alias: true } },
          },
        },
      },
    });

    const shaped = requests.map((r: any) => ({
      id: r.id,
      artist_id: r.wallet?.artist?.id,
      artist_name: r.wallet?.artist?.alias ?? r.wallet?.artist?.name ?? 'Unknown',
      requested_at: r.created_at,
      description: r.description,
    }));

    res.json(shaped);
  } catch (err) { next(err); }
});

// ── POST /api/admin/announcements — post a studio-wide message ────────────────
adminRouter.post('/announcements', requireRole('STUDIO_ADMIN'), async (req: any, res, next) => {
  try {
    const db = prisma as any;
    const { title, body } = z.object({
      title: z.string().min(1).max(120),
      body:  z.string().min(1).max(500),
    }).parse(req.body);

    const studio = req.studio;

    const announcement = await db.studioAnnouncement.create({
      data: { title, body, studio_id: studio.id, created_by: req.userId },
    });

    // Broadcast to ALL connected clients
    broadcastAll({ type: 'studio_announcement', announcement });

    res.status(201).json(announcement);
  } catch (err) { next(err); }
});

// ── GET /api/admin/announcements — last 10 announcements ─────────────────────
adminRouter.get('/announcements', async (req, res, next) => {
  try {
    const db = prisma as any;
    const studio = (req as any).studio;

    const announcements = await db.studioAnnouncement.findMany({
      where:   { studio_id: studio.id },
      orderBy: { created_at: 'desc' },
      take:    10,
    });
    res.json(announcements);
  } catch (err) { next(err); }
});
