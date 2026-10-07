import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { publishBookingUpdate, publishStudioAnnouncement } from '../services/liveUpdates';
import { attachStudioScope } from '../middleware/studioScope.middleware';
import { Prisma } from '@prisma/client';
import { CASH_PLATFORM_FEE_BPS, recordBookingPayment, recordStudioCollectedCash } from '../lib/financialLedger';
import { transitionBookingStatus } from '../lib/bookingTransitions';
import { writeAdminAudit } from '../lib/adminAudit';
import { addCalendarDays, studioDate, studioDateBounds } from '../lib/studioClock';
import { findRoomClash, isRoomClash } from '../lib/roomSchedule';
export const adminRouter = Router();

// Artist-facing routes, mounted before adminRouter, whose role check would refuse
// artists. Studios no longer put money in wallets, or take requests for it: a
// studio's credit reached no ledger and was spent at any studio, so OIANO came to
// owe another studio money nobody paid in. Only a paid top-up funds a wallet.
const artistAdminRouter = Router();
artistAdminRouter.use(authenticate);

// Artist-facing read endpoint. Posting announcements remains admin-only.
// An artist reads only a studio they have booked with, the same artists who hear
// announcements live (services/liveUpdates.ts): the studio_id they name, or else
// the studio of their latest booking. Staff go on to adminRouter's own route,
// which this one, mounted first, used to answer with "Artist not found".
artistAdminRouter.get('/announcements', async (req, res, next) => {
  try {
    if ((req as any).userRole !== 'ARTIST') return next();
    const db = prisma;
    const artist = await prisma.artist.findUnique({ where: { user_id: (req as any).userId } });
    if (!artist) throw new AppError('Artist not found', 404);
    const booking = await prisma.booking.findFirst({
      where: {
        artist_id: artist.id,
        ...(typeof req.query.studio_id === 'string' && { studio_id: req.query.studio_id }),
      },
      orderBy: { starts_at: 'desc' },
      select: { studio_id: true },
    });
    if (!booking) return res.json([]);
    const announcements = await db.studioAnnouncement.findMany({
      where: { studio_id: booking.studio_id },
      orderBy: { created_at: 'desc' },
      take: 10,
    });
    res.json(announcements);
  } catch (err) { next(err); }
});

export { artistAdminRouter };

adminRouter.use(authenticate, requireRole('STUDIO_ADMIN'), attachStudioScope);

adminRouter.get('/analytics', async (req, res, next) => {
  try {
    const studio = (req as any).studio;

    // Days are the studio's own, in its own zone (C29): a 23:00 session west of UTC
    // used to count on the next UTC day. Index 0 is 13 studio days ago, 13 is today.
    const now = new Date();
    const today = studioDate(now, studio.timezone);
    const { start: todayStart, end: todayEnd } = studioDateBounds(today, studio.timezone);
    const fourteenDaysAgo = studioDateBounds(addCalendarDays(today, -13), studio.timezone).start;

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
          starts_at: { gte: todayStart, lt: todayEnd },
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

    // 14 studio days: the last 7 are this week, the 7 before it the prior week. Only
    // seven were built, so this week sliced to nothing and always read zero.
    type DayBucket = { date: string; revenue_usd: number; booking_count: number };
    const days: DayBucket[] = Array.from({ length: 14 }, (_, i) => (
      { date: addCalendarDays(today, i - 13), revenue_usd: 0, booking_count: 0 }
    ));

    for (const p of recentPayments) {
      const date = studioDate(new Date(p.paid_at!), studio.timezone);
      const bucket = days.find((d) => d.date === date);
      if (bucket) bucket.revenue_usd += Number(p.amount_usd);
    }
    for (const b of recentBookings) {
      const date = studioDate(new Date(b.starts_at), studio.timezone);
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
      weekly_days: weekly,        // 7-element array for sparkline
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

// GET /api/admin/runsheet?date=YYYY-MM-DD — printable daily runsheet
// Also accessible to ENGINEER (they see all sessions, used as their daily schedule)
const RunsheetQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

adminRouter.get('/runsheet', async (req, res, next) => {
  try {
    const { date } = RunsheetQuery.parse(req.query);
    const studio = (req as any).studio;

    // The studio's own day, as on the engineer runsheet (C29).
    const day = date ?? studioDate(new Date(), studio.timezone);
    const { start: dayStart, end: dayEnd } = studioDateBounds(day, studio.timezone);

    const bookings = await prisma.booking.findMany({
      where: {
        studio_id: studio.id,
        starts_at: { lt: dayEnd },
        ends_at: { gt: dayStart },
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
      date: day,
      timezone: studio.timezone,
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

    const hours = data.duration_minutes / 60;
    const total = Number(service.min_price_usd) * (service.unit === 'hour' ? hours : 1);

    // The room is checked under its lock, and the guest and the booking are written in the
    // same transaction, so a refused walk-in leaves no guest account behind.
    const booking = await prisma.$transaction(async (tx) => {
      if (await findRoomClash(tx, { roomId: data.room_id, slots: [{ startsAt: starts_at, endsAt: ends_at }] })) {
        throw new AppError('That room is already booked for this time', 409);
      }

      // Create a guest account for the walk-in — no password, can't log in
      const guestEmail = `walkin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${studio.slug}.walkin`;
      const guestUser = await tx.user.create({
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

      return tx.booking.create({
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
    }).catch((error) => {
      throw isRoomClash(error) ? new AppError('That room is already booked for this time', 409) : error;
    });

    await publishBookingUpdate(booking.id, booking.status);

    res.status(201).json(booking);
  } catch (err) { next(err); }
});

// ── POST /api/admin/bookings/:id/cash-payment — record cash taken at the desk ──
// A walk-in pays cash, and until this route nothing could record it: PAID was
// written only by the wallet, the Stripe webhook and payouts (C26). The amount is
// the booking's stored total, never the caller's. The payment posts through the
// booking-payment posting with no platform fee (owner decision, 2026-10-06), and
// because the studio is holding the cash, the cash it kept is set against what
// OIANO owes it (financialLedger.ts, recordStudioCollectedCash): the studio's
// payable is unchanged and a payout never pays the cash again.
//
// Permission: the studio membership's MANAGE_BOOKINGS capability, or a
// STUDIO_ADMIN membership with no capabilities at all (the legacy owner, as in
// studio-policy.routes.ts). VIEW_FINANCE reads money; it does not record it.
const CashPaymentSchema = z.object({}).strict();
const PAYABLE_IN_CASH = new Set(['UNPAID']);

adminRouter.post('/bookings/:id/cash-payment', async (req, res, next) => {
  try {
    // Nothing the caller sends decides the payment; an amount is refused, not ignored.
    CashPaymentSchema.parse(req.body ?? {});
    const userId = (req as any).userId as string;
    const studio = (req as any).studio;

    const membership = await prisma.studioStaff.findUnique({ where: { user_id_studio_id: { user_id: userId, studio_id: studio.id } } });
    const mayRecord = !!membership && (membership.capabilities.includes('MANAGE_BOOKINGS')
      || (membership.capabilities.length === 0 && membership.role === 'STUDIO_ADMIN'));
    if (!mayRecord) throw new AppError('Booking management permission required', 403);

    const result = await prisma.$transaction(async (tx) => {
      // The booking row is locked first, so two recordings of the same payment take
      // turns and the second sees the first one's PAID. Payment.booking_id is also
      // unique, so two payment rows for one booking cannot exist either way.
      const [locked] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM bookings WHERE id = ${req.params.id} AND studio_id = ${studio.id} FOR UPDATE`;
      if (!locked) throw new AppError('Booking not found', 404);
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: locked.id }, include: { payment: true } });

      if (booking.status === 'CANCELLED' || booking.status === 'NO_SHOW') {
        throw new AppError(`This booking is ${booking.status === 'CANCELLED' ? 'cancelled' : 'marked no-show'}; no payment can be recorded for it`, 409);
      }
      const existing = booking.payment;
      if (existing && existing.status === 'PAID') throw new AppError('This booking is already paid', 409);
      // A payment that was ever sent to a checkout may still be paid there, and one
      // that was refunded has its own history; neither becomes a cash payment.
      if (existing && (!PAYABLE_IN_CASH.has(existing.status) || existing.provider_ref || existing.payment_intent_id)) {
        throw new AppError('This booking has a payment in another state; it cannot be recorded as cash', 409);
      }
      const amountUsd = Number(booking.total_usd);
      if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new AppError('This booking has no amount to pay', 409);

      const paidAt = new Date();
      let paymentId: string;
      if (existing) {
        const claimed = await tx.payment.updateMany({
          where: { id: existing.id, status: 'UNPAID', provider_ref: null, payment_intent_id: null },
          data: { provider: 'cash', amount_usd: booking.total_usd, status: 'PAID', paid_at: paidAt },
        });
        if (claimed.count !== 1) throw new AppError('This booking\'s payment changed while it was being recorded. Refresh and try again.', 409);
        paymentId = existing.id;
      } else {
        try {
          paymentId = (await tx.payment.create({
            data: { booking_id: booking.id, provider: 'cash', amount_usd: booking.total_usd, status: 'PAID', paid_at: paidAt },
          })).id;
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new AppError('This booking is already paid', 409);
          throw err;
        }
      }

      const posted = await recordBookingPayment(tx, { paymentId, provider: 'cash', amountUsd, platformFeeBps: CASH_PLATFORM_FEE_BPS, artistId: booking.artist_id, studioId: studio.id, bookingId: booking.id });
      await recordStudioCollectedCash(tx, { paymentId, amountUsd, studioId: studio.id, bookingId: booking.id });

      // Payment confirms a booking only while it is waiting to be confirmed (A03).
      const confirmation = await transitionBookingStatus(tx, { bookingId: booking.id, to: 'CONFIRMED', studioId: studio.id, onlyFrom: ['PENDING'] });
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      const after = await tx.booking.findUniqueOrThrow({ where: { id: booking.id }, select: { status: true } });
      return { payment, bookingStatus: after.status, confirmedNow: confirmation.outcome === 'APPLIED', ledgerTransactionId: posted.id };
    });

    await writeAdminAudit(userId, 'booking.payment.cash_recorded', req, {
      studio_id: studio.id, booking_id: req.params.id, payment_id: result.payment.id,
      amount_usd: Number(result.payment.amount_usd), ledger_transaction_id: result.ledgerTransactionId,
    }).catch((error) => console.error('[audit] cash payment write failed:', error?.message));
    if (result.confirmedNow) await publishBookingUpdate(req.params.id, result.bookingStatus);

    res.status(201).json({ payment: result.payment, booking_status: result.bookingStatus });
  } catch (err) { next(err); }
});

// ── POST /api/admin/announcements — post a studio-wide message ────────────────
adminRouter.post('/announcements', requireRole('STUDIO_ADMIN'), async (req: any, res, next) => {
  try {
    const db = prisma;
    const { title, body } = z.object({
      title: z.string().min(1).max(120),
      body:  z.string().min(1).max(500),
    }).parse(req.body);

    const studio = req.studio;

    const announcement = await db.studioAnnouncement.create({
      data: { title, body, studio_id: studio.id, created_by: req.userId },
    });

    // To this studio's staff and the artists who have booked here (A01).
    await publishStudioAnnouncement(announcement);

    res.status(201).json(announcement);
  } catch (err) { next(err); }
});

// ── GET /api/admin/announcements — last 10 announcements ─────────────────────
adminRouter.get('/announcements', async (req, res, next) => {
  try {
    const db = prisma;
    const studio = (req as any).studio;

    const announcements = await db.studioAnnouncement.findMany({
      where:   { studio_id: studio.id },
      orderBy: { created_at: 'desc' },
      take:    10,
    });
    res.json(announcements);
  } catch (err) { next(err); }
});
