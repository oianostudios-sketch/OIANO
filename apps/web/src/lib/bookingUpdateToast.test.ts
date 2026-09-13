import { describe, expect, it } from 'vitest';
import { bookingUpdateToast } from './bookingUpdateToast';

describe('bookingUpdateToast', () => {
  it('tells the artist what happened to their session', () => {
    expect(bookingUpdateToast('ARTIST', 'CONFIRMED')).toEqual({ tone: 'success', message: 'Your session is confirmed — see you in the studio.' });
    expect(bookingUpdateToast('ARTIST', 'CANCELLED')?.tone).toBe('error');
    expect(bookingUpdateToast('ARTIST', 'COMPLETED')?.tone).toBe('info');
    expect(bookingUpdateToast('ARTIST', 'NO_SHOW')?.tone).toBe('error');
  });

  // Staff, producers and operators receive the same event to refresh their view.
  // "Your session is confirmed" is not addressed to them.
  it('says nothing to anyone else who receives the update', () => {
    for (const role of ['STUDIO_ADMIN', 'ENGINEER', 'PRODUCER', 'OIANO_ADMIN', null, undefined]) {
      for (const status of ['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']) {
        expect(bookingUpdateToast(role, status), `${role} / ${status}`).toBeNull();
      }
    }
  });

  it('says nothing about a status that needs no announcement', () => {
    for (const status of ['PENDING', 'IN_PROGRESS', undefined]) {
      expect(bookingUpdateToast('ARTIST', status)).toBeNull();
    }
  });
});
