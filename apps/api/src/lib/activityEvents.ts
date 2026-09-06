// apps/api/src/lib/activityEvents.ts
import { EventEmitter } from 'events';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

// Past tense, always. An event records what happened; a command asks for change.
// Nothing here is a request, an intention, or a thing that ought to occur.
export type ActivityEventType =
  | 'profile.created'
  | 'status.changed'
  | 'session.booked'
  | 'session.completed'
  | 'booking.confirmed'
  | 'booking.cancelled'
  | 'payment.received'
  // Previously impossible to record: the subject was an Artist FK, so nothing
  // about a studio or a payout could be an event at all.
  | 'studio.registered'
  | 'payout.paid';

// What an event is about. ARTIST is the default because every event recorded
// before this existed was about one.
export type ActivitySubjectType = 'ARTIST' | 'STUDIO' | 'PRODUCER' | 'PLATFORM';

export interface ActivityEvent {
  id: string;
  type: string;
  subject_type: string;
  subject_id: string | null;
  actor_id: string | null;
  version: number;
  artist_id: string | null;
  payload: unknown;
  created_at: Date;
}

export interface EmitOptions {
  /** What the event is about. Defaults to the artist when only artist_id is given. */
  subject?: { type: ActivitySubjectType; id: string };
  /** The User who caused it. Absent for system-derived events. */
  actorId?: string;
  /** Bump only when a payload's meaning changes; add fields freely without it. */
  version?: number;
  artist_id?: string;
  [key: string]: unknown;
}

// Clock owns no business logic — modules emit events here, Clock only consumes.
class ActivityEventBus extends EventEmitter {}
export const activityEventBus = new ActivityEventBus();

export async function emitActivityEvent(
  type: ActivityEventType,
  payload: EmitOptions = {},
): Promise<ActivityEvent> {
  const { artist_id, subject, actorId, version, ...rest } = payload;

  // Callers that only know about an artist keep working exactly as before: the
  // artist becomes the subject. New callers name a subject explicitly, which is
  // what lets a studio or a payout be the thing an event is about.
  const resolvedSubject = subject ?? (artist_id ? { type: 'ARTIST' as const, id: artist_id } : null);

  const event = await prisma.activityEvent.create({
    data: {
      type,
      subject_type: resolvedSubject?.type ?? 'ARTIST',
      subject_id: resolvedSubject?.id ?? null,
      actor_id: actorId ?? null,
      version: version ?? 1,
      // Only a real Artist may go here — it is a foreign key, and a studio id
      // in this column would not resolve.
      artist_id: resolvedSubject?.type === 'ARTIST' ? resolvedSubject.id : null,
      payload: rest as Prisma.InputJsonValue,
    },
  });
  activityEventBus.emit(type, event);
  return event;
}
