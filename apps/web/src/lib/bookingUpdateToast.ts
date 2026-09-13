// What a booking_updated event says to the person receiving it.
//
// The event reaches everyone who can read the booking: its artist, the studio's
// staff, the project's producer and platform operators (A01). The messages speak
// to the artist whose session it is, so only the artist sees one; everyone else
// just has their view refreshed.

export interface BookingUpdateToast {
  tone: 'success' | 'error' | 'info';
  message: string;
}

export function bookingUpdateToast(viewerRole: string | null | undefined, status: unknown): BookingUpdateToast | null {
  if (viewerRole !== 'ARTIST') return null;
  switch (status) {
    case 'CONFIRMED':
      return { tone: 'success', message: 'Your session is confirmed — see you in the studio.' };
    case 'CANCELLED':
      return { tone: 'error', message: 'A booking was cancelled. Check your sessions for details.' };
    case 'COMPLETED':
      return { tone: 'info', message: 'Session marked complete. Check your profile for the update.' };
    case 'NO_SHOW':
      return { tone: 'error', message: 'A session was marked as no-show.' };
    default:
      return null;
  }
}
