// apps/api/src/services/clockActivityConsumer.ts
// Log-only consumer for now — Clock must never silently drop an event, and a
// bug in here must never break the module that emitted it (bus listeners run
// synchronously inside emit(), so every handler is wrapped in its own try/catch).
import { activityEventBus, ActivityEvent, ActivityEventType } from '../lib/activityEvents';

const CONSUMED_EVENTS: ActivityEventType[] = [
  'profile.created',
  'status.changed',
  'session.booked',
  'session.completed',
];

function handle(type: ActivityEventType) {
  return (event: ActivityEvent) => {
    try {
      console.log(`[clock] ${type}`, {
        id: event.id,
        artist_id: event.artist_id,
        payload: event.payload,
      });
    } catch (err) {
      console.error(`[clock] failed to log ${type} event`, err);
    }
  };
}

let registered = false;

export function registerClockActivityConsumer() {
  if (registered) return; // ts-node-dev respawns can re-import this module
  for (const type of CONSUMED_EVENTS) {
    activityEventBus.on(type, handle(type));
  }
  registered = true;
}
