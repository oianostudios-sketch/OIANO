import { emitActivityEvent } from './activityEvents';
import { syncStudioCircleMembership } from '../services/studio-circle.service';
import { syncConnectionFromBooking } from './weave/sync';

// "This booking completed" is one fact with three writers: the status route,
// the session-completion controller, and file delivery. Each used to repeat the
// downstream consequences by hand, and delivery had quietly dropped two of the
// three — a booking completed that way emitted no session.completed event (so
// no SSE to the artist and no milestone on their activity feed) and never
// updated the studio-circle projection, which then under-counted sessions.
//
// The Booking row stays the authoritative fact. Everything here is derived from
// it, so each effect is isolated: a projection that fails is logged and skipped,
// never allowed to fail the request that recorded the completion. The status
// route previously awaited the circle sync unguarded, so a projection error
// turned a successful domain write into a 500.
export async function recordBookingCompleted(booking: { id: string; artist_id: string; studio_id: string }): Promise<void> {
  await emitActivityEvent('session.completed', {
    artist_id: booking.artist_id,
    booking_id: booking.id,
  }).catch((e: any) => console.error('[activity] session.completed emit failed:', e?.message));

  await syncStudioCircleMembership(booking.studio_id, booking.artist_id)
    .catch((e: any) => console.error('[circle] completion sync failed:', e?.message));

  await syncConnectionFromBooking(booking.id)
    .catch((e: any) => console.error('[weave] connection sync failed:', e?.message));
}
