import { describe, expect, it } from 'vitest';
import { greetingName } from './greetingName';
import { SIGNUP_PLACEHOLDER_NAMES } from '../../../../packages/shared/src/placeholderNames';

describe('greetingName', () => {
  it('prefers the alias, then the name', () => {
    expect(greetingName({ alias: 'Nova', name: 'Ana Silva' })).toBe('Nova');
    expect(greetingName({ alias: null, name: 'Ana Silva' })).toBe('Ana Silva');
    expect(greetingName({ alias: '  ', name: 'Ana Silva' })).toBe('Ana Silva');
  });

  it('gives no name rather than reaching for the email', () => {
    expect(greetingName(undefined)).toBeNull();
    expect(greetingName(null)).toBeNull();
    expect(greetingName({ alias: '', name: '' })).toBeNull();
  });

  it('treats the names signup stores when none was given as no name', () => {
    for (const placeholder of Object.values(SIGNUP_PLACEHOLDER_NAMES)) {
      expect(greetingName({ alias: null, name: placeholder })).toBeNull();
    }
    expect(greetingName({ alias: 'Nova', name: SIGNUP_PLACEHOLDER_NAMES.ARTIST })).toBe('Nova');
    // The literal text the API stores, so a change on either side fails here.
    expect(greetingName({ name: 'New artist' })).toBeNull();
  });
});
