import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { attachStudioScope, resolveStaffStudio } from '../middleware/studioScope.middleware';

// The only request body in the API that was read straight off req.body, against
// the project's own rule that Zod validates every body. An unbounded note went
// on to be concatenated into a stored column.
const ActivityPingSchema = z.object({
  note: z.string().trim().max(500).optional(),
  source: z.string().trim().max(40).optional(),
});

type SessionStatus = 'active' | 'ending_soon' | 'overtime' | 'idle';

export const studioClockRouter = Router();

// Short in-memory cache — every mounted <SmartClock/> polls this every 30s
// (see apps/web/src/components/SmartClock/useClockData.ts), and each call
// runs a studio lookup + a joined booking query. A few seconds of staleness
// is invisible to users but avoids duplicate DB round-trips when several
// clocks (or several open tabs) are polling at once.
interface ClockCache { data: unknown; expiresAt: number }
const clockCache = new Map<string, ClockCache>();
const CLOCK_CACHE_TTL = 5_000; // 5 s

// GET /api/studio-clock — the operational clock belongs to the staff user's
// active studio. Session names and schedules are not public tenant data.
studioClockRouter.get('/', authenticate, requireRole('STUDIO_ADMIN', 'ENGINEER'), attachStudioScope, async (req, res, next) => {
  try {
    const studio = (req as any).studio;
    const cached = clockCache.get(studio.id);
    if (cached && Date.now() < cached.expiresAt) {
      return res.json(cached.data);
    }

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const todayBookings = await prisma.booking.findMany({
      where: {
        studio_id: studio.id,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        starts_at: { gte: dayStart, lte: dayEnd },
      },
      include: { artist: true, room: true, engineer: true, service: true },
      orderBy: { starts_at: 'asc' },
    });

    const active = todayBookings.find(
      (b) => b.starts_at <= now && b.ends_at >= now,
    );
    const upcoming = todayBookings.filter((b) => b.starts_at > now);

    // Map every booking to a 24-hour clock arc
    const outerRing = todayBookings.map((b) => {
      const startMins = b.starts_at.getHours() * 60 + b.starts_at.getMinutes();
      const endMins = b.ends_at.getHours() * 60 + b.ends_at.getMinutes();
      const isActive = active != null && b.id === active.id;
      const endsIn = (b.ends_at.getTime() - now.getTime()) / 60_000;
      const status: SessionStatus = isActive
        ? endsIn < 0 ? 'overtime' : endsIn < 30 ? 'ending_soon' : 'active'
        : 'idle';
      return {
        startAngle: (startMins / 1440) * 360,
        endAngle: (endMins / 1440) * 360,
        status,
        minutesRemaining: Math.round(endsIn),
      };
    });

    let activeSession = null;
    if (active) {
      const minutesElapsed = Math.round(
        (now.getTime() - active.starts_at.getTime()) / 60_000,
      );
      const minutesTotal = Math.round(
        (active.ends_at.getTime() - active.starts_at.getTime()) / 60_000,
      );
      const minutesRemaining = minutesTotal - minutesElapsed;

      activeSession = {
        id: active.id,
        artistName: active.artist.name,
        room: active.room?.name ?? 'Studio',
        projectId: null,
        projectTitle: null,
        phase: 'recording',
        phaseLabel: 'Recording',
        overtimeStatus: minutesRemaining < 0 ? 'overtime' : 'none',
        overtimeLoggedMinutes: 0,
        minutesRemaining,
        minutesElapsed,
        minutesTotal,
        scheduledAt: active.starts_at.toISOString(),
        endsAt: active.ends_at.toISOString(),
        estimatedEndTime: active.ends_at.toISOString(),
        recommendedBreakAt: null,
        contributors: [],
      };
    }

    const sessionStatus: SessionStatus = active
      ? activeSession!.minutesRemaining < 0 ? 'overtime'
        : activeSession!.minutesRemaining < 30 ? 'ending_soon'
        : 'active'
      : 'idle';

    const responseData = {
      currentTime: now.toISOString(),
      sessionStatus,
      eventType: 'clock_update',
      activeSession,
      outerRing,
      innerRing: [],
      phaseRing: [],
      milestone: null,
      upcomingDeliverables: upcoming.slice(0, 3).map((b) => ({
        id: b.id,
        title: `${b.artist.name} — ${b.service?.name ?? 'Session'}`,
        type: 'booking',
        status: b.status.toLowerCase(),
        dueAt: b.starts_at.toISOString(),
      })),
      prediction: {
        estimatedEndTime: active ? active.ends_at.toISOString() : null,
        recommendedBreakAt: null,
        remainingWorkloadMinutes: activeSession?.minutesRemaining ?? 0,
        workloadRisk: 'low',
      },
      studioLoad: todayBookings.length,
      bestRecordingWindows: [10, 14, 19],
    };

    clockCache.set(studio.id, { data: responseData, expiresAt: Date.now() + CLOCK_CACHE_TTL });
    return res.json(responseData);
  } catch (err) {
    next(err);
  }
});

// ── DAW Watcher activity ping ─────────────────────────────────────────────────
// POST /api/studio-clock/sessions/:id/activity
// Called by apps/watcher whenever the artist saves a file in their DAW.
// Records the save as a session log note so the studio clock stays live.
studioClockRouter.post('/sessions/:id/activity', authenticate, requireRole('STUDIO_ADMIN', 'ENGINEER'), async (req, res, next) => {
  try {
    const { note, source } = ActivityPingSchema.parse(req.body);
    const bookingId = req.params.id;

    const studio = await resolveStaffStudio((req as any).userId);
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, studio_id: studio.id } });
    if (!booking) return res.status(404).json({ error: 'Session not found' });

    // The clock reports operating state; the session log is owned by the session
    // domain, and the completion flow writes the engineer's real notes into the
    // same column. `notes: { set: ... }` replaced that column outright, so every
    // DAW save destroyed whatever was already recorded — the log only ever held
    // the most recent ping. Append instead, and only ever add a line.
    const entry = note ? `[${new Date().toISOString()}] ${source ?? 'daw'}: ${note}` : null;
    const existing = entry
      ? await prisma.sessionLog.findUnique({ where: { booking_id: bookingId }, select: { notes: true } })
      : null;

    await prisma.sessionLog.upsert({
      where: { booking_id: bookingId },
      update: entry ? { notes: existing?.notes ? `${existing.notes}\n${entry}` : entry } : {},
      create: {
        booking_id: bookingId,
        artist_id: booking.artist_id,
        started_at: booking.starts_at,
        notes: entry ?? '',
      },
    });

    res.json({ ok: true, recorded_at: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

function idleClockData() {
  return {
    currentTime: new Date().toISOString(),
    sessionStatus: 'idle',
    eventType: 'clock_update',
    activeSession: null,
    outerRing: [],
    innerRing: [],
    phaseRing: [],
    milestone: null,
    upcomingDeliverables: [],
    prediction: {
      estimatedEndTime: null,
      recommendedBreakAt: null,
      remainingWorkloadMinutes: 0,
      workloadRisk: 'low',
    },
    studioLoad: 0,
    bestRecordingWindows: [10, 14, 19],
  };
}
