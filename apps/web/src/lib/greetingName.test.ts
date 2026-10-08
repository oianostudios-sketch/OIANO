import { describe, expect, it } from 'vitest';
import { greetingName } from './greetingName';

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
});
