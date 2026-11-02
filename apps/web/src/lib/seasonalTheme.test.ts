import { afterEach, describe, expect, it } from 'vitest';

import {
  activeSeason,
  HALLOWEEN,
  seasonTurnedOff,
  seasonUntilLabel,
  setSeasonTurnedOff,
  VERANO,
} from './seasonalTheme.js';

describe('activeSeason', () => {
  it('Halloween va del 24 al 31 de octubre, en hora de Argentina', () => {
    expect(activeSeason(new Date('2026-10-23T12:00:00-03:00'))).toBeNull();
    expect(activeSeason(new Date('2026-10-24T00:30:00-03:00'))).toBe(HALLOWEEN);
    expect(activeSeason(new Date('2026-10-31T23:59:00-03:00'))).toBe(HALLOWEEN);
    // El 23 a las 22 en Argentina es el 24 en UTC: todavía no empieza.
    expect(activeSeason(new Date('2026-10-24T01:00:00Z'))).toBeNull();
  });

  it('a las 00:00 del 1 de noviembre arranca Verano, y sigue hasta el 28 de febrero', () => {
    expect(activeSeason(new Date('2026-11-01T00:00:00-03:00'))).toBe(VERANO);
    // Las 22 del 31 en Argentina ya son el 1 en UTC: sigue Halloween.
    expect(activeSeason(new Date('2026-11-01T01:00:00Z'))).toBe(HALLOWEEN);
    expect(activeSeason(new Date('2026-12-31T12:00:00-03:00'))).toBe(VERANO);
    expect(activeSeason(new Date('2027-01-15T12:00:00-03:00'))).toBe(VERANO);
    expect(activeSeason(new Date('2027-02-28T23:30:00-03:00'))).toBe(VERANO);
    expect(activeSeason(new Date('2027-03-01T00:30:00-03:00'))).toBeNull();
    expect(activeSeason(new Date('2027-07-10T12:00:00-03:00'))).toBeNull();
  });

  it('dice hasta cuándo corre', () => {
    expect(seasonUntilLabel(HALLOWEEN)).toBe('31 de octubre');
    expect(seasonUntilLabel(VERANO)).toBe('28 de febrero');
  });
});

describe('sacar la temporada', () => {
  afterEach(() => window.localStorage.clear());

  it('sacar el verano en diciembre lo deja sacado en enero, y vuelve el verano siguiente', () => {
    setSeasonTurnedOff(VERANO, new Date('2026-12-10T12:00:00-03:00'), true);
    expect(seasonTurnedOff(VERANO, new Date('2027-01-20T12:00:00-03:00'))).toBe(true);
    expect(seasonTurnedOff(VERANO, new Date('2027-11-05T12:00:00-03:00'))).toBe(false);
  });

  it('sacar Halloween no saca Verano', () => {
    setSeasonTurnedOff(HALLOWEEN, new Date('2026-10-28T12:00:00-03:00'), true);
    expect(seasonTurnedOff(VERANO, new Date('2026-11-02T12:00:00-03:00'))).toBe(false);
  });
});
