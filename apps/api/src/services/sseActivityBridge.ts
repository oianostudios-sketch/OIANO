// apps/api/src/services/sseActivityBridge.ts
// Bridges the persisted activity-event bus (lib/activityEvents.ts) to the
// existing SSE transport (routes/notifications.routes.ts) so that any module
// which calls emitActivityEvent() automatically reaches the acting artist's
// own browser — without each call site having to know about SSE.
//
// Deliberately narrow: this only reaches the one artist the event is about
// (via their own user_id), never broadcastAll — an activity event describing
// one artist's own booking/profile/session is not something every connected
// user should see. Modeled on clockActivityConsumer.ts's safety contract:
// bus listeners run synchronously inside emit(), so a bug here must never
// throw back into the module that emitted the event.
import { activityEventBus, ActivityEvent, ActivityEventType } from '../lib/activityEvents';
import { broadcastToUser } from '../routes/notifications.routes';
import { prisma } from '../lib/prisma';

const BRIDGED_EVENTS: ActivityEventType[] = [
  'profile.created',
  'status.changed',
  'session.booked',
  'session.completed',
  'booking.confirmed',
  'booking.cancelled',
  'payment.received',
];

function handle(type: ActivityEventType) {
  return (event: ActivityEvent) => {
    (async () => {
      try {
        if (!event.artist_id) return;
        const artist = await prisma.artist.findUnique({ where: { id: event.artist_id }, select: { user_id: true } });
        if (!artist) return;
        broadcastToUser(artist.user_id, { type: 'activity', activityType: type, payload: event.payload });
      } catch (err) {
        console.error(`[sse-activity-bridge] failed to forward ${type}`, err);
      }
    })();
  };
}

let registered = false;

export function registerSseActivityBridge() {
  if (registered) return; // ts-node-dev respawns can re-import this module
  for (const type of BRIDGED_EVENTS) {
    activityEventBus.on(type, handle(type));
  }
  registered = true;
}
