// apps/api/src/routes/studio-setup.routes.ts
// A studio's rooms and services: what it can be booked for, and at what price.
//
// A booking needs one of each (controllers/bookings.controller.ts), and until now no
// route created either, so a studio that registered itself could not take its first
// booking without someone editing the database (C06). These routes let the studio set
// them up itself, on today's Room and ServiceOffering tables; migration step 6 moves
// them to Resource and Offering with every other row.
//
// Prices here are what the next booking is charged. A booking stores its own total when
// it is made, so changing a price never changes a booking already made. A room or
// service that has been booked is part of that booking's record and cannot be deleted.
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { resolveStaffStudio } from '../middleware/studioScope.middleware';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { writeAdminAudit } from '../lib/adminAudit';
import { keepIdentityInStep } from '../lib/identity/backfill';

export const studioSetupRouter = Router();
studioSetupRouter.use(authenticate);

// Rooms, services and prices are the studio's standing terms, so they follow the same
// authority as its standards (routes/studio-policy.routes.ts): MANAGE_POLICIES, which the
// owner and manager presets carry, or a STUDIO_ADMIN membership with no explicit
// capabilities, which is how a self-registered owner is created. Every member of the
// studio's staff may read them.
async function setupContext(userId: string) {
  const studio = await resolveStaffStudio(userId);
  const membership = await prisma.studioStaff.findUnique({ where: { user_id_studio_id: { user_id: userId, studio_id: studio.id } } });
  if (!membership) throw new AppError('Studio assignment required', 403);
  const canManage = membership.capabilities.length
    ? membership.capabilities.includes('MANAGE_POLICIES')
    : membership.role === 'STUDIO_ADMIN';
  return { studio, canManage };
}

async function managerContext(userId: string) {
  const context = await setupContext(userId);
  if (!context.canManage) throw new AppError('Only staff who manage the studio\'s standards can change its rooms and services', 403);
  return context;
}

const money = z.number().finite().min(0).max(100_000).refine((value) => Math.round(value * 100) === value * 100, 'Use at most two decimal places');
const text = (max: number) => z.string().trim().max(max);

const RoomInput = z.object({
  name: text(80).min(1),
  capacity: z.number().int().min(1).max(500).nullable().optional(),
  description: text(500).nullable().optional(),
  hourly_rate: money.nullable().optional(),
  amenities: z.array(text(40).min(1)).max(20).optional(),
}).strict();

const UNITS = ['hour', 'session', 'track', 'month'] as const;
const ServiceInput = z.object({
  name: text(120).min(1),
  category: z.enum(['RECORDING', 'FULL_DAY', 'MIX_MASTER', 'COACHING', 'EVENT', 'MEMBERSHIP']),
  description: text(500).nullable().optional(),
  unit: z.enum(UNITS),
  // The price a booking is charged: per hour for an hourly service, otherwise once.
  min_price_usd: money,
  // An upper figure shown to artists for work that varies; never charged.
  max_price_usd: money.optional(),
}).strict();

const roomSelect = { id: true, name: true, capacity: true, description: true, hourly_rate: true, amenities: true, _count: { select: { bookings: true } } } satisfies Prisma.RoomSelect;
const serviceSelect = { id: true, name: true, category: true, description: true, unit: true, min_price_usd: true, max_price_usd: true, _count: { select: { bookings: true } } } satisfies Prisma.ServiceOfferingSelect;

function presentRoom(room: Prisma.RoomGetPayload<{ select: typeof roomSelect }>) {
  const { _count, hourly_rate, ...rest } = room;
  return { ...rest, hourly_rate: hourly_rate == null ? null : Number(hourly_rate), booking_count: _count.bookings };
}
function presentService(service: Prisma.ServiceOfferingGetPayload<{ select: typeof serviceSelect }>) {
  const { _count, min_price_usd, max_price_usd, ...rest } = service;
  return { ...rest, min_price_usd: Number(min_price_usd), max_price_usd: Number(max_price_usd), booking_count: _count.bookings };
}

// Names are how artists choose, so two rooms or two services may not share one.
async function assertNameFree(kind: 'room' | 'service', studioId: string, name: string, exceptId?: string) {
  const where = { studio_id: studioId, name: { equals: name, mode: 'insensitive' as const }, ...(exceptId ? { id: { not: exceptId } } : {}) };
  const taken = kind === 'room' ? await prisma.room.findFirst({ where, select: { id: true } }) : await prisma.serviceOffering.findFirst({ where, select: { id: true } });
  if (taken) throw new AppError(`This studio already has a ${kind} called ${name}`, 409);
}

function priceRange(min: number, max: number | undefined) {
  const upper = max ?? min;
  if (upper < min) throw new AppError('The upper price cannot be below the price charged', 400);
  return { min_price_usd: min, max_price_usd: upper };
}

// A row with bookings, or with equipment, issues or availability attached, is part of
// the studio's record. The check runs before the delete, and the foreign keys still
// refuse a booking that lands in between, which is reported the same way.
async function deleteUnlessUsed(run: () => Promise<unknown>, inUse: string) {
  try {
    await run();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new AppError(inUse, 409);
    throw error;
  }
}

studioSetupRouter.get('/', async (req: any, res, next) => {
  try {
    const { studio, canManage } = await setupContext(req.userId);
    const [rooms, services, engineers] = await Promise.all([
      prisma.room.findMany({ where: { studio_id: studio.id }, select: roomSelect, orderBy: { name: 'asc' } }),
      prisma.serviceOffering.findMany({ where: { studio_id: studio.id }, select: serviceSelect, orderBy: { name: 'asc' } }),
      prisma.engineer.findMany({ where: { studio_id: studio.id }, select: engineerSelect, orderBy: { name: 'asc' } }),
    ]);
    res.json({
      studio: { id: studio.id, name: studio.name, currency: 'USD' },
      can_manage: canManage,
      bookable: rooms.length > 0 && services.length > 0,
      rooms: rooms.map(presentRoom),
      services: services.map(presentService),
      engineers: engineers.map(presentEngineer),
    });
  } catch (error) { next(error); }
});

studioSetupRouter.post('/rooms', async (req: any, res, next) => {
  try {
    const { studio } = await managerContext(req.userId);
    const data = RoomInput.parse(req.body);
    await assertNameFree('room', studio.id, data.name);
    const room = await prisma.room.create({ data: { ...data, studio_id: studio.id }, select: roomSelect });
    await writeAdminAudit(req.userId, 'studio.room.created', req, { studio_id: studio.id, room_id: room.id, name: room.name });
    res.status(201).json(presentRoom(room));
  } catch (error) { next(error); }
});

studioSetupRouter.patch('/rooms/:id', async (req: any, res, next) => {
  try {
    const { studio } = await managerContext(req.userId);
    const data = RoomInput.partial().parse(req.body);
    const existing = await prisma.room.findFirst({ where: { id: req.params.id, studio_id: studio.id }, select: { id: true } });
    if (!existing) throw new AppError('Room not found', 404);
    if (data.name) await assertNameFree('room', studio.id, data.name, existing.id);
    const room = await prisma.room.update({ where: { id: existing.id }, data, select: roomSelect });
    await writeAdminAudit(req.userId, 'studio.room.updated', req, { studio_id: studio.id, room_id: room.id, fields: Object.keys(data) });
    res.json(presentRoom(room));
  } catch (error) { next(error); }
});

studioSetupRouter.delete('/rooms/:id', async (req: any, res, next) => {
  try {
    const { studio } = await managerContext(req.userId);
    const room = await prisma.room.findFirst({
      where: { id: req.params.id, studio_id: studio.id },
      select: { id: true, name: true, _count: { select: { bookings: true, equipment: true, issues: true, availability: true } } },
    });
    if (!room) throw new AppError('Room not found', 404);
    const inUse = `${room.name} has been booked or has equipment or maintenance history, so it stays on the studio's record. Rename or edit it instead.`;
    if (Object.values(room._count).some((count) => count > 0)) throw new AppError(inUse, 409);
    await deleteUnlessUsed(() => prisma.room.delete({ where: { id: room.id } }), inUse);
    await writeAdminAudit(req.userId, 'studio.room.deleted', req, { studio_id: studio.id, room_id: room.id, name: room.name });
    res.json({ success: true });
  } catch (error) { next(error); }
});

studioSetupRouter.post('/services', async (req: any, res, next) => {
  try {
    const { studio } = await managerContext(req.userId);
    const { min_price_usd, max_price_usd, ...data } = ServiceInput.parse(req.body);
    await assertNameFree('service', studio.id, data.name);
    const service = await prisma.serviceOffering.create({
      data: { ...data, ...priceRange(min_price_usd, max_price_usd), studio_id: studio.id },
      select: serviceSelect,
    });
    await writeAdminAudit(req.userId, 'studio.service.created', req, { studio_id: studio.id, service_id: service.id, name: service.name, price_usd: min_price_usd, unit: service.unit });
    res.status(201).json(presentService(service));
  } catch (error) { next(error); }
});

studioSetupRouter.patch('/services/:id', async (req: any, res, next) => {
  try {
    const { studio } = await managerContext(req.userId);
    const data = ServiceInput.partial().parse(req.body);
    const existing = await prisma.serviceOffering.findFirst({ where: { id: req.params.id, studio_id: studio.id } });
    if (!existing) throw new AppError('Service not found', 404);
    if (data.name) await assertNameFree('service', studio.id, data.name, existing.id);
    const { min_price_usd, max_price_usd, ...rest } = data;
    // A new price alone keeps the upper figure, raised to the price if it would sit below it.
    const min = min_price_usd ?? Number(existing.min_price_usd);
    const prices = min_price_usd !== undefined || max_price_usd !== undefined
      ? priceRange(min, max_price_usd ?? Math.max(min, Number(existing.max_price_usd)))
      : {};
    const service = await prisma.serviceOffering.update({ where: { id: existing.id }, data: { ...rest, ...prices }, select: serviceSelect });
    await writeAdminAudit(req.userId, 'studio.service.updated', req, {
      studio_id: studio.id, service_id: service.id, fields: Object.keys(data),
      ...(min_price_usd !== undefined ? { price_usd_from: Number(existing.min_price_usd), price_usd_to: min_price_usd } : {}),
    });
    res.json(presentService(service));
  } catch (error) { next(error); }
});

studioSetupRouter.delete('/services/:id', async (req: any, res, next) => {
  try {
    const { studio } = await managerContext(req.userId);
    const service = await prisma.serviceOffering.findFirst({
      where: { id: req.params.id, studio_id: studio.id },
      select: { id: true, name: true, _count: { select: { bookings: true } } },
    });
    if (!service) throw new AppError('Service not found', 404);
    const inUse = `${service.name} has been booked, so it stays on the studio's record. Edit it instead.`;
    if (service._count.bookings > 0) throw new AppError(inUse, 409);
    await deleteUnlessUsed(() => prisma.serviceOffering.delete({ where: { id: service.id } }), inUse);
    await writeAdminAudit(req.userId, 'studio.service.deleted', req, { studio_id: studio.id, service_id: service.id, name: service.name });
    res.json({ success: true });
  } catch (error) { next(error); }
});

// ── Engineers ───────────────────────────────────────────────────────────────
// Owner decision 2026-10-05: a studio may schedule engineers who have no OIANO login.
// Nobody can sign up as an engineer today, and an engineer invited as staff joins with an
// artist or producer account that grants no engineer access (C01, C04), so until the
// Identity migration a studio lists the people it schedules here. Each listed engineer is
// a studio-held record, not an identity; the Identity migration turns it into an
// unclaimed membership the person can claim.
//
// An engineer record linked to an account (user_id) belongs to that person: the studio
// may set their rate and specialties here, but not their name or bio, and cannot delete it.
const EngineerInput = z.object({
  name: text(80).min(1),
  specialties: z.array(text(40).min(1)).max(12).optional(),
  hourly_rate_usd: money.nullable().optional(),
  bio: text(500).nullable().optional(),
}).strict();

const engineerSelect = {
  id: true, name: true, specialties: true, hourly_rate_usd: true, bio: true, user_id: true,
  _count: { select: { bookings: true, preferred_bookings: true, availability: true } },
} satisfies Prisma.EngineerSelect;

function presentEngineer(engineer: Prisma.EngineerGetPayload<{ select: typeof engineerSelect }>) {
  const { _count, hourly_rate_usd, user_id, ...rest } = engineer;
  return {
    ...rest,
    hourly_rate_usd: hourly_rate_usd == null ? null : Number(hourly_rate_usd),
    has_login: user_id !== null,
    booking_count: _count.bookings + _count.preferred_bookings,
  };
}

async function assertEngineerNameFree(studioId: string, name: string, exceptId?: string) {
  const taken = await prisma.engineer.findFirst({
    where: { studio_id: studioId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (taken) throw new AppError(`This studio already lists an engineer called ${name}`, 409);
}

studioSetupRouter.post('/engineers', async (req: any, res, next) => {
  try {
    const { studio } = await managerContext(req.userId);
    const data = EngineerInput.parse(req.body);
    await assertEngineerNameFree(studio.id, data.name);
    const engineer = await prisma.engineer.create({
      data: { ...data, specialties: data.specialties ?? [], studio_id: studio.id },
      select: engineerSelect,
    });
    await keepIdentityInStep({ legacyIds: [engineer.id] });
    await writeAdminAudit(req.userId, 'studio.engineer.listed', req, { studio_id: studio.id, engineer_id: engineer.id, name: engineer.name });
    res.status(201).json(presentEngineer(engineer));
  } catch (error) { next(error); }
});

studioSetupRouter.patch('/engineers/:id', async (req: any, res, next) => {
  try {
    const { studio } = await managerContext(req.userId);
    const data = EngineerInput.partial().parse(req.body);
    const existing = await prisma.engineer.findFirst({ where: { id: req.params.id, studio_id: studio.id }, select: { id: true, user_id: true } });
    if (!existing) throw new AppError('Engineer not found', 404);
    if (existing.user_id && (data.name !== undefined || data.bio !== undefined)) {
      throw new AppError('This engineer has an OIANO login, so their name and bio are theirs to change', 403);
    }
    if (data.name) await assertEngineerNameFree(studio.id, data.name, existing.id);
    const engineer = await prisma.engineer.update({ where: { id: existing.id }, data, select: engineerSelect });
    await keepIdentityInStep({ legacyIds: [engineer.id] });
    await writeAdminAudit(req.userId, 'studio.engineer.updated', req, { studio_id: studio.id, engineer_id: engineer.id, fields: Object.keys(data) });
    res.json(presentEngineer(engineer));
  } catch (error) { next(error); }
});

studioSetupRouter.delete('/engineers/:id', async (req: any, res, next) => {
  try {
    const { studio } = await managerContext(req.userId);
    const engineer = await prisma.engineer.findFirst({ where: { id: req.params.id, studio_id: studio.id }, select: engineerSelect });
    if (!engineer) throw new AppError('Engineer not found', 404);
    if (engineer.user_id) throw new AppError(`${engineer.name} has an OIANO login, so the studio cannot remove their record`, 409);
    const inUse = `${engineer.name} has been booked or requested, so they stay on the studio's record. Edit them instead.`;
    if (Object.values(engineer._count).some((count) => count > 0)) throw new AppError(inUse, 409);
    await deleteUnlessUsed(() => prisma.engineer.delete({ where: { id: engineer.id } }), inUse);
    await keepIdentityInStep({ legacyIds: [engineer.id] });
    await writeAdminAudit(req.userId, 'studio.engineer.removed', req, { studio_id: studio.id, engineer_id: engineer.id, name: engineer.name });
    res.json({ success: true });
  } catch (error) { next(error); }
});
