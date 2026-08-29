// apps/api/src/routes/bookings.routes.ts
import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { auditSuccessfulMutation } from '../lib/adminAudit';
import {
  createBooking,
  getBookings,
  getBookingById,
  getBookingNextAction,
  getBookingSessionSummary,
  updateBookingStatus,
  deliverSessionFiles,
  assignBookingEngineer,
  reviewDeliverable,
} from '../controllers/bookings.controller';
import { completeSession } from '../controllers/bookings/complete-session.controller';
import { rescheduleBooking, updateSessionNotes } from '../controllers/bookings/session-management.controller';

export const bookingsRouter = Router();

bookingsRouter.use(authenticate);
bookingsRouter.use(auditSuccessfulMutation);

bookingsRouter.get('/', getBookings);
bookingsRouter.get('/:id', getBookingById);
// Rate-limited independently of the auth-route limiter above — this hits a
// paid external API per call, so it gets its own, tighter budget.
const nextActionLimiter = rateLimit({ max: 30, windowMs: 60_000, message: 'Too many suggestion requests — wait a minute and try again.' });
bookingsRouter.get('/:id/next-action', nextActionLimiter, getBookingNextAction);
const sessionSummaryLimiter = rateLimit({ max: 30, windowMs: 60_000, message: 'Too many summary requests — wait a minute and try again.' });
bookingsRouter.get('/:id/session-summary', sessionSummaryLimiter, getBookingSessionSummary);
// Booking creation was previously unrated — the highest-traffic write path
// in the app has no reason to be less protected than a suggestion endpoint.
const createBookingLimiter = rateLimit({ max: 20, windowMs: 60_000, message: 'Too many booking attempts — wait a minute and try again.' });
bookingsRouter.post('/', requireRole('ARTIST'), createBookingLimiter, createBooking);
bookingsRouter.patch('/:id/status', requireRole('STUDIO_ADMIN'), updateBookingStatus);
bookingsRouter.patch('/:id/engineer', requireRole('STUDIO_ADMIN'), assignBookingEngineer);
bookingsRouter.patch('/:id/session-notes', requireRole('ENGINEER', 'STUDIO_ADMIN'), updateSessionNotes);
// POST /:id/deliver — engineer marks session delivered + attaches file URLs
bookingsRouter.post('/:id/deliver', requireRole('ENGINEER', 'STUDIO_ADMIN'), deliverSessionFiles);
bookingsRouter.patch('/:id/deliverables/:deliverableId/review', requireRole('ARTIST'), reviewDeliverable);
// POST /:id/complete — the session completion screen: deliverables + credits + rights + notes in one submit
bookingsRouter.post('/:id/complete', requireRole('ENGINEER', 'STUDIO_ADMIN'), completeSession);
// PATCH /:id/reschedule — artist moves their booking to a new time slot
bookingsRouter.patch('/:id/reschedule', requireRole('ARTIST'), rescheduleBooking);
