// apps/api/src/lib/activityEvents.ts
import { EventEmitter } from 'events';
import { prisma } from './prisma';

export type ActivityEventType =
  | 'profile.created'
  | 'status.changed'
  | 'session.booked'
  | 'session.completed';

export interface ActivityEvent {
  id: string;
  type: string;
  artist_id: string | null;
  payload: unknown;
  created_at: Date;
}

// Clock owns no business logic — modules emit events here, Clock only consumes.
class ActivityEventBus extends EventEmitter {}
export const activityEventBus = new ActivityEventBus();

export async function emitActivityEvent(
  type: ActivityEventType,
  payload: { artist_id?: string; [key: string]: unknown } = {},
): Promise<ActivityEvent> {
  const { artist_id, ...rest } = payload;
  const event = await prisma.activityEvent.create({
    data: { type, artist_id: artist_id ?? null, payload: rest },
  });
  activityEventBus.emit(type, event);
  return event;
}
