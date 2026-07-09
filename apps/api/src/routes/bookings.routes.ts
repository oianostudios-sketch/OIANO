// apps/api/src/routes/bookings.routes.ts
import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import {
  createBooking,
  getBookings,
  getBookingById,
  updateBookingStatus,
  updateSessionNotes,
  deliverSessionFiles,
  rescheduleBooking,
} from '../controllers/bookings.controller';

export const bookingsRouter = Router();

bookingsRouter.use(authenticate);

bookingsRouter.get('/', getBookings);
bookingsRouter.get('/:id', getBookingById);
bookingsRouter.post('/', requireRole('ARTIST'), createBooking);
bookingsRouter.patch('/:id/status', requireRole('STUDIO_ADMIN'), updateBookingStatus);
bookingsRouter.patch('/:id/session-notes', requireRole('ENGINEER', 'STUDIO_ADMIN'), updateSessionNotes);
// POST /:id/deliver — engineer marks session delivered + attaches file URLs
bookingsRouter.post('/:id/deliver', requireRole('ENGINEER', 'STUDIO_ADMIN'), deliverSessionFiles);
// PATCH /:id/reschedule — artist moves their booking to a new time slot
bookingsRouter.patch('/:id/reschedule', requireRole('ARTIST'), rescheduleBooking);
