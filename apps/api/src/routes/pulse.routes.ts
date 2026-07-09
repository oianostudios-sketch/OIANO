import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { DEFAULT_STUDIO_SLUG } from '@oiano/shared/constants';

export const pulseRouter = Router();

// 60-second in-memory cache — pulse data changes at most every few minutes
// and each load fires 8 DB queries, so caching is a significant win.
interface PulseCache { data: unknown; expiresAt: number }
let pulseCache: PulseCache | null = null;
const PULSE_CACHE_TTL = 60_000; // 60 s

pulseRouter.get(
  '/',
  authenticate,
  requireRole('STUDIO_ADMIN'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (pulseCache && Date.now() < pulseCache.expiresAt) {
        return res.json(pulseCache.data);
      }

      const now = new Date();

      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());

      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [
        todayBookings,
        recentBookings,
        weekBookings,
        allArtists,
        pendingCount,
        overduePayments,
        sessionMilestones,
        recentArtistIds,
      ] = await Promise.all([
        // Today's sessions for utilization calc
        prisma.booking.findMany({
          where: {
            studio: { slug: DEFAULT_STUDIO_SLUG },
            starts_at: { gte: todayStart, lt: todayEnd },
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          },
          select: { starts_at: true, ends_at: true },
        }),

        // Last 30 days for genre trending
        prisma.booking.findMany({
          where: {
            studio: { slug: DEFAULT_STUDIO_SLUG },
            starts_at: { gte: thirtyDaysAgo },
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          },
          select: {
            artist: {
              select: {
                id: true,
                passport: { select: { creative_dna: true } },
              },
            },
          },
        }),

        // This week for productivity comparison
        prisma.booking.count({
          where: {
            studio: { slug: DEFAULT_STUDIO_SLUG },
            starts_at: { gte: weekStart },
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          },
        }),

        prisma.artist.findMany({
          select: { id: true, name: true, alias: true },
        }),

        // Unconfirmed upcoming bookings
        prisma.booking.count({
          where: {
            studio: { slug: DEFAULT_STUDIO_SLUG },
            status: 'PENDING',
            starts_at: { gte: now },
          },
        }),

        // Overdue payments: completed/confirmed with unpaid payment
        prisma.payment.count({
          where: {
            status: { in: ['UNPAID', 'FAILED'] },
            booking: {
              studio: { slug: DEFAULT_STUDIO_SLUG },
              status: { in: ['COMPLETED', 'CONFIRMED'] },
            },
          },
        }),

        // Session milestone check
        prisma.booking.groupBy({
          by: ['artist_id'],
          where: {
            studio: { slug: DEFAULT_STUDIO_SLUG },
            status: { in: ['CONFIRMED', 'COMPLETED', 'IN_PROGRESS'] },
          },
          _count: { _all: true },
        }),

        // Artists active in last 30 days (IDs only)
        prisma.booking.findMany({
          where: {
            studio: { slug: DEFAULT_STUDIO_SLUG },
            starts_at: { gte: thirtyDaysAgo },
          },
          select: { artist_id: true },
          distinct: ['artist_id'],
        }),
      ]);

      // ── Utilization ────────────────────────────────────────────────────────
      const bookedMins = todayBookings.reduce((sum, b) => {
        return sum + (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000;
      }, 0);
      const AVAILABLE_MINS = 3 * 14 * 60; // 3 rooms × 14h (8am–10pm)
      const today_pct = Math.min(100, Math.round((bookedMins / AVAILABLE_MINS) * 100));

      // ── Trending genre ─────────────────────────────────────────────────────
      const genreCounts: Record<string, number> = {};
      let totalGenreEntries = 0;
      for (const b of recentBookings) {
        const dna = b.artist?.passport?.creative_dna as Record<string, unknown> | null;
        const genres: string[] = Array.isArray(dna?.genres) ? (dna!.genres as string[]) : [];
        for (const g of genres) {
          genreCounts[g] = (genreCounts[g] ?? 0) + 1;
          totalGenreEntries++;
        }
      }
      const sortedGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);
      const trending_genre =
        sortedGenres.length > 0
          ? {
              genre: sortedGenres[0][0],
              count: sortedGenres[0][1],
              pct: totalGenreEntries > 0 ? Math.round((sortedGenres[0][1] / totalGenreEntries) * 100) : 0,
              runner_up: sortedGenres[1]
                ? { genre: sortedGenres[1][0], pct: Math.round((sortedGenres[1][1] / totalGenreEntries) * 100) }
                : null,
            }
          : null;

      // ── Wins ───────────────────────────────────────────────────────────────
      const MILESTONES = [3, 5, 10, 25, 50, 100];
      const wins: Array<{ type: string; message: string; artist_name: string; icon: string }> = [];
      const artistMap = new Map(allArtists.map((a) => [a.id, a]));

      for (const { artist_id, _count } of sessionMilestones) {
        const count = _count._all;
        if (MILESTONES.includes(count)) {
          const artist = artistMap.get(artist_id);
          if (artist) {
            const displayName = artist.alias ?? artist.name;
            wins.push({
              type: 'milestone',
              message: `${displayName} hit their ${count}${count === 1 ? 'st' : count === 2 ? 'nd' : count === 3 ? 'rd' : 'th'} session`,
              artist_name: displayName,
              icon: count >= 50 ? '★' : count >= 25 ? '◆' : '●',
            });
          }
        }
      }

      // Revenue win: if this week's sessions >= 10
      if (weekBookings >= 10) {
        wins.push({ type: 'revenue', message: `Strong week — ${weekBookings} sessions booked`, artist_name: '', icon: '↑' });
      }

      // ── Next moves ─────────────────────────────────────────────────────────
      const activeArtistIdSet = new Set(recentArtistIds.map((r) => r.artist_id));
      const inactiveCount = allArtists.filter((a) => !activeArtistIdSet.has(a.id)).length;

      const next_moves: Array<{ type: string; message: string; count: number; severity: string }> = [];

      if (pendingCount > 0) {
        next_moves.push({
          type: 'unconfirmed',
          message: `${pendingCount} booking${pendingCount > 1 ? 's' : ''} awaiting confirmation`,
          count: pendingCount,
          severity: 'action',
        });
      }
      if (overduePayments > 0) {
        next_moves.push({
          type: 'overdue',
          message: `${overduePayments} outstanding payment${overduePayments > 1 ? 's' : ''} to collect`,
          count: overduePayments,
          severity: 'warning',
        });
      }
      if (inactiveCount > 0) {
        next_moves.push({
          type: 'inactive',
          message: `${inactiveCount} artist${inactiveCount > 1 ? 's' : ''} haven't been in for 30+ days`,
          count: inactiveCount,
          severity: 'info',
        });
      }
      if (next_moves.length === 0) {
        next_moves.push({ type: 'clear', message: 'All clear — studio is running clean', count: 0, severity: 'good' });
      }

      const responseData = {
        utilization: {
          today_pct,
          today_booked_hours: parseFloat((bookedMins / 60).toFixed(1)),
          today_available_hours: AVAILABLE_MINS / 60,
          week_sessions: weekBookings,
        },
        trending_genre,
        wins: wins.slice(0, 3),
        next_moves: next_moves.slice(0, 4),
      };

      pulseCache = { data: responseData, expiresAt: Date.now() + PULSE_CACHE_TTL };
      res.json(responseData);
    } catch (err) {
      next(err);
    }
  },
);
