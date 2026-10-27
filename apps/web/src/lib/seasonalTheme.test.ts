import { describe, expect, it } from 'vitest';

import { activeSeason, HALLOWEEN } from './seasonalTheme.js';

describe('activeSeason', () => {
  it('Halloween va del 24 de octubre al 1 de noviembre, en hora de Argentina', () => {
    expect(activeSeason(new Date('2026-10-23T12:00:00-03:00'))).toBeNull();
    expect(activeSeason(new Date('2026-10-24T00:30:00-03:00'))).toBe(HALLOWEEN);
    expect(activeSeason(new Date('2026-10-31T20:00:00-03:00'))).toBe(HALLOWEEN);
    expect(activeSeason(new Date('2026-11-01T23:30:00-03:00'))).toBe(HALLOWEEN);
    // Las 00:30 del 2 de noviembre en Argentina ya son el 2, aunque en UTC sean las 03:30.
    expect(activeSeason(new Date('2026-11-02T00:30:00-03:00'))).toBeNull();
    // El 23 a las 22 en Argentina es el 24 en UTC: todavía no empieza.
    expect(activeSeason(new Date('2026-10-24T01:00:00Z'))).toBeNull();
  });
});
