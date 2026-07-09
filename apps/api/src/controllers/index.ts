// Barrel — import controllers from a single entry point
export { signup, login, getMe } from './auth.controller';
export {
  getBookings,
  getBookingById,
  createBooking,
  updateBookingStatus,
  updateSessionNotes,
} from './bookings.controller';
