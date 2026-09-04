import { describe, expect, it } from 'vitest';
import { CREATIVE_DISCIPLINES, disciplineLabel } from './creativeDisciplines';

describe('creative disciplines', () => {
  it('offers a unique, non-empty option set', () => {
    const ids = CREATIVE_DISCIPLINES.map((discipline) => discipline.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const discipline of CREATIVE_DISCIPLINES) {
      expect(discipline.label.trim()).not.toBe('');
      expect(discipline.description.trim()).not.toBe('');
    }
  });

  // The API's signup and profile schemas validate against this exact vocabulary
  // (auth.controller.ts). A discipline offered here that the server rejects
  // fails at submit time with no way for the user to recover, so the ids must
  // stay SCREAMING_SNAKE and must include the default the server falls back to.
  it('uses the wire vocabulary the API validates against', () => {
    for (const discipline of CREATIVE_DISCIPLINES) {
      expect(discipline.id, discipline.id).toMatch(/^[A-Z][A-Z_]*$/);
    }
    expect(CREATIVE_DISCIPLINES.some((discipline) => discipline.id === 'PRODUCER')).toBe(true);
  });

  it('labels a known discipline', () => {
    expect(disciplineLabel('SONGWRITER')).toBe('Songwriter');
    expect(disciplineLabel('MIX_ENGINEER')).toBe('Mix engineer');
  });

  // Producer rows created before disciplines existed have no value, and the UI
  // must not render "undefined" at them.
  it('falls back to a readable label for missing or unknown values', () => {
    expect(disciplineLabel(undefined)).toBe('Creative professional');
    expect(disciplineLabel(null)).toBe('Creative professional');
    expect(disciplineLabel('NOT_A_DISCIPLINE')).toBe('Creative professional');
  });

  it('has a label for every listed discipline', () => {
    for (const discipline of CREATIVE_DISCIPLINES) {
      expect(disciplineLabel(discipline.id)).toBe(discipline.label);
    }
  });
});
