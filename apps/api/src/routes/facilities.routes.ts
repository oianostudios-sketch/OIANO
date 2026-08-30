// apps/api/src/routes/facilities.routes.ts
// Studio-level physical maintenance (rooms/equipment/faults) — distinct from
// the OIANO_ADMIN platform-operations console mounted at /api/maintenance.
// See the "Studio Body Audit" — readiness is always derived live from open
// (non-RESTORED) issues, never stored as its own mutable field, so it can
// never drift from the facts that produced it.
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { attachStudioScope } from '../middleware/studioScope.middleware';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { broadcastToUser } from './notifications.routes';

export const facilitiesRouter = Router();
facilitiesRouter.use(authenticate);

type OpenIssue = { id: string; severity: 'CRITICAL' | 'DEGRADED' | 'MINOR'; status: string; symptom: string };

// READY unless an open (non-RESTORED) issue says otherwise — CRITICAL wins
// over DEGRADED/MINOR when a room or asset has more than one open issue.
function deriveReadiness(openIssues: OpenIssue[]): 'READY' | 'LIMITED' | 'OUT_OF_SERVICE' {
  if (openIssues.some((issue) => issue.severity === 'CRITICAL')) return 'OUT_OF_SERVICE';
  if (openIssues.length > 0) return 'LIMITED';
  return 'READY';
}

const managerOnly = [attachStudioScope, requireRole('STUDIO_ADMIN', 'ENGINEER')];

facilitiesRouter.get('/rooms', ...managerOnly, async (req: any, res, next) => {
  try {
    const [rooms, openIssues] = await Promise.all([
      prisma.room.findMany({ where: { studio_id: req.studioId }, orderBy: { name: 'asc' } }),
      prisma.maintenanceIssue.findMany({
        where: { studio_id: req.studioId, room_id: { not: null }, status: { not: 'RESTORED' } },
        select: { id: true, room_id: true, severity: true, status: true, symptom: true },
      }),
    ]);
    res.json(rooms.map((room) => {
      const issues = openIssues.filter((issue) => issue.room_id === room.id);
      return { id: room.id, name: room.name, readiness: deriveReadiness(issues), open_issues: issues };
    }));
  } catch (error) { next(error); }
});

facilitiesRouter.get('/equipment', ...managerOnly, async (req: any, res, next) => {
  try {
    const [equipment, openIssues] = await Promise.all([
      prisma.equipment.findMany({ where: { studio_id: req.studioId }, include: { room: { select: { id: true, name: true } } }, orderBy: { name: 'asc' } }),
      prisma.maintenanceIssue.findMany({
        where: { studio_id: req.studioId, equipment_id: { not: null }, status: { not: 'RESTORED' } },
        select: { id: true, equipment_id: true, severity: true, status: true, symptom: true },
      }),
    ]);
    res.json(equipment.map((item) => {
      const issues = openIssues.filter((issue) => issue.equipment_id === item.id);
      return {
        id: item.id, name: item.name, type: item.type, serial: item.serial,
        room: item.room, last_service_at: item.last_service_at, next_service_at: item.next_service_at,
        readiness: deriveReadiness(issues), open_issues: issues,
      };
    }));
  } catch (error) { next(error); }
});

const CreateEquipmentSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  room_id: z.string().optional(),
  serial: z.string().optional(),
  notes: z.string().optional(),
});
facilitiesRouter.post('/equipment', attachStudioScope, requireRole('STUDIO_ADMIN'), async (req: any, res, next) => {
  try {
    const data = CreateEquipmentSchema.parse(req.body);
    const equipment = await prisma.equipment.create({ data: { ...data, studio_id: req.studioId } });
    res.status(201).json(equipment);
  } catch (error) { next(error); }
});

facilitiesRouter.get('/issues', ...managerOnly, async (req: any, res, next) => {
  try {
    const issues = await prisma.maintenanceIssue.findMany({
      where: { studio_id: req.studioId },
      orderBy: { created_at: 'desc' },
      take: 100,
      include: {
        room: { select: { id: true, name: true } },
        equipment: { select: { id: true, name: true } },
        reporter: { select: { id: true, email: true } },
        assignee: { select: { id: true, email: true } },
        booking: { select: { id: true, starts_at: true, service: { select: { name: true } } } },
      },
    });
    res.json(issues);
  } catch (error) { next(error); }
});

// Report is deliberately fast (§15) — infer studio/room from the booking
// when one is given, so a producer mid-session never re-types facts the
// system already knows.
const ReportIssueSchema = z.object({
  room_id: z.string().optional(),
  equipment_id: z.string().optional(),
  booking_id: z.string().optional(),
  symptom: z.string().min(1).max(280),
  severity: z.enum(['CRITICAL', 'DEGRADED', 'MINOR']),
  notes: z.string().max(2000).optional(),
});
facilitiesRouter.post('/issues', requireRole('ARTIST', 'ENGINEER', 'STUDIO_ADMIN'), async (req: any, res, next) => {
  try {
    const data = ReportIssueSchema.parse(req.body);
    let studioId: string;
    let roomId = data.room_id ?? null;

    if (data.booking_id) {
      const booking = await prisma.booking.findUnique({
        where: { id: data.booking_id },
        include: { artist: { select: { user_id: true } }, engineer: { select: { user_id: true } } },
      });
      if (!booking) throw new AppError('Booking not found', 404);
      const isReporterOnBooking = booking.artist.user_id === req.userId || booking.engineer?.user_id === req.userId;
      if (!isReporterOnBooking && req.userRole !== 'STUDIO_ADMIN') throw new AppError('Not part of this booking', 403);
      studioId = booking.studio_id;
      roomId = roomId ?? booking.room_id;
    } else {
      // No booking context — only studio staff can report directly against
      // a room/asset (an artist/engineer always has a booking to anchor to).
      if (req.userRole !== 'STUDIO_ADMIN' && req.userRole !== 'ENGINEER') {
        throw new AppError('Reporting without a booking requires studio staff access', 403);
      }
      if (data.equipment_id) {
        const equipment = await prisma.equipment.findUnique({ where: { id: data.equipment_id }, select: { studio_id: true, room_id: true } });
        if (!equipment) throw new AppError('Equipment not found', 404);
        studioId = equipment.studio_id;
        roomId = roomId ?? equipment.room_id;
      } else if (roomId) {
        const room = await prisma.room.findUnique({ where: { id: roomId }, select: { studio_id: true } });
        if (!room) throw new AppError('Room not found', 404);
        studioId = room.studio_id;
      } else {
        throw new AppError('room_id, equipment_id, or booking_id is required', 400);
      }
    }

    const issue = await prisma.maintenanceIssue.create({
      data: {
        studio_id: studioId, room_id: roomId, equipment_id: data.equipment_id ?? null,
        booking_id: data.booking_id ?? null, reported_by: req.userId,
        symptom: data.symptom, severity: data.severity, notes: data.notes ?? null,
      },
      include: { room: { select: { name: true } }, equipment: { select: { name: true } } },
    });

    const staff = await prisma.studioStaff.findMany({ where: { studio_id: studioId }, select: { user_id: true } });
    const staffUserIds = staff.map((member) => member.user_id);
    if (staffUserIds.length) {
      const title = data.severity === 'CRITICAL' ? 'Critical facility issue reported' : 'Facility issue reported';
      const body = `${issue.room?.name ?? issue.equipment?.name ?? 'A facility'}: ${data.symptom}`;
      await prisma.notification.createMany({
        data: staffUserIds.map((user_id) => ({ user_id, type: 'FACILITY_ISSUE_REPORTED', title, body, payload: { issue_id: issue.id, severity: data.severity } })),
      });
      staffUserIds.forEach((userId) => broadcastToUser(userId, { type: 'facility_issue_updated', issueId: issue.id, status: 'REPORTED', severity: data.severity }));
    }
    res.status(201).json(issue);
  } catch (error) { next(error); }
});

const UpdateIssueSchema = z.object({
  status: z.enum(['ASSIGNED', 'REPAIRING', 'VERIFY', 'RESTORED']),
  assigned_to: z.string().optional(),
  notes: z.string().max(2000).optional(),
});
facilitiesRouter.patch('/issues/:id', attachStudioScope, requireRole('STUDIO_ADMIN'), async (req: any, res, next) => {
  try {
    const data = UpdateIssueSchema.parse(req.body);
    const existing = await prisma.maintenanceIssue.findFirst({ where: { id: req.params.id, studio_id: req.studioId } });
    if (!existing) throw new AppError('Issue not found', 404);

    const issue = await prisma.maintenanceIssue.update({
      where: { id: existing.id },
      data: {
        status: data.status,
        assigned_to: data.status === 'ASSIGNED' ? (data.assigned_to ?? req.userId) : existing.assigned_to,
        notes: data.notes ?? existing.notes,
        resolved_at: data.status === 'RESTORED' ? new Date() : existing.resolved_at,
        verified_by: data.status === 'RESTORED' ? req.userId : existing.verified_by,
      },
    });

    const staff = await prisma.studioStaff.findMany({ where: { studio_id: req.studioId }, select: { user_id: true } });
    staff.forEach((member) => broadcastToUser(member.user_id, { type: 'facility_issue_updated', issueId: issue.id, status: issue.status }));
    res.json(issue);
  } catch (error) { next(error); }
});
