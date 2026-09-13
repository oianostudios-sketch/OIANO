// apps/api/src/services/liveUpdates.ts
// Who hears about a change over the live stream (A01).
//
// Booking updates, artist availability and studio announcements used to go to
// every connected user, so booking ids and statuses, an artist's availability
// and a studio's announcements reached people at other studios. Each event now
// goes to the people entitled to what it describes, looked up when it is sent,
// so someone removed from a studio stops hearing about it at once.
//
// These run after the change is saved, so they never throw: a missed live update
// costs a refresh, while an error here would fail a request whose change stands.
import type { BookingStatus, Prisma, StudioAnnouncement } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { broadcastToUsers } from '../routes/notifications.routes';

/** Studio staff as the booking routes recognise them: an admin or engineer holding a membership. */
const staff = (membership: Prisma.StudioStaffWhereInput): Prisma.UserWhereInput => ({
  role: { in: ['STUDIO_ADMIN', 'ENGINEER'] },
  studio_staff: { some: membership },
});

/**
 * Everyone who can read the booking: its artist, its studio's staff, the producer
 * who owns its project, and platform operators, who read every booking. The same
 * people GET /api/bookings and GET /api/bookings/:id let in.
 */
async function bookingReaders(bookingId: string): Promise<string[]> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      studio_id: true,
      artist: { select: { user_id: true } },
      project: { select: { producer: { select: { user_id: true } } } },
    },
  });
  if (!booking) return [];
  const staffAndOperators = await prisma.user.findMany({
    where: { OR: [staff({ studio_id: booking.studio_id }), { role: 'OIANO_ADMIN' }] },
    select: { id: true },
  });
  return [booking.artist.user_id, booking.project?.producer.user_id, ...staffAndOperators.map((user) => user.id)]
    .filter((id): id is string => Boolean(id));
}

/** A studio's staff, and the artists who have booked there. */
async function staffAndClientsOf(studioId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { OR: [staff({ studio_id: studioId }), { artist: { bookings: { some: { studio_id: studioId } } } }] },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

/** Staff at the studios an artist has booked with, whose rosters that artist is on. */
async function staffOfStudiosBookedBy(artistId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: staff({ studio: { bookings: { some: { artist_id: artistId } } } }),
    select: { id: true },
  });
  return users.map((user) => user.id);
}

async function publish(what: string, event: Record<string, unknown>, audience: () => Promise<string[]>) {
  try {
    broadcastToUsers(await audience(), event);
  } catch (error) {
    console.error(`[live-updates] ${what} was not delivered`, error);
  }
}

export function publishBookingUpdate(bookingId: string, status: BookingStatus) {
  return publish(`booking ${bookingId} update`, { type: 'booking_updated', bookingId, status }, () => bookingReaders(bookingId));
}

export function publishStudioAnnouncement(announcement: StudioAnnouncement) {
  return publish(
    `announcement ${announcement.id}`,
    { type: 'studio_announcement', announcement },
    () => staffAndClientsOf(announcement.studio_id),
  );
}

export function publishArtistStatus(artist: { id: string; name: string }, status: string) {
  return publish(
    `artist ${artist.id} status`,
    { type: 'artist_status_changed', artistId: artist.id, artistName: artist.name, status },
    () => staffOfStudiosBookedBy(artist.id),
  );
}
