import { describe, expect, it } from 'vitest';
import { isArtistProfileOwner } from './artistProfileOwner';

const owner = { id: 'user-a', role: 'ARTIST' };
const profile = { user_id: 'user-a' };

describe('isArtistProfileOwner', () => {
  it('is true for the artist whose profile it is', () => {
    expect(isArtistProfileOwner(owner, profile)).toBe(true);
  });

  // The regression: every signed-in artist was treated as the owner of any
  // profile they opened, and saw controls that act on their own account.
  it('is false for another artist viewing the profile', () => {
    expect(isArtistProfileOwner({ id: 'user-b', role: 'ARTIST' }, profile)).toBe(false);
  });

  // Staff controls follow their own rule, and the owner controls lead to
  // artist-only routes.
  it('is false for every other role, even with a matching id', () => {
    for (const role of ['STUDIO_ADMIN', 'ENGINEER', 'PRODUCER', 'OIANO_ADMIN', '', null, undefined]) {
      expect(isArtistProfileOwner({ id: 'user-a', role }, profile), String(role)).toBe(false);
    }
  });

  it('never matches two missing ids', () => {
    for (const missing of [undefined, null, '']) {
      expect(isArtistProfileOwner({ id: missing, role: 'ARTIST' }, { user_id: missing }), String(missing)).toBe(false);
    }
    expect(isArtistProfileOwner({ role: 'ARTIST' }, {})).toBe(false);
  });

  it('is false when the viewer or the profile is not known yet', () => {
    expect(isArtistProfileOwner(owner, { user_id: undefined })).toBe(false);
    expect(isArtistProfileOwner(owner, null)).toBe(false);
    expect(isArtistProfileOwner(owner, undefined)).toBe(false);
    expect(isArtistProfileOwner(null, profile)).toBe(false);
    expect(isArtistProfileOwner(undefined, undefined)).toBe(false);
  });
});
