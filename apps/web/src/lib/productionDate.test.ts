import { describe, expect, it } from 'vitest';

import { periodProductionDate } from './productionDate.js';

// Un período de jueves a miércoles: abre el jueves 19-11-2026 a las 9 (hora argentina).
const WEEK = { closeAt: '2026-11-26T01:00:00Z', openAt: '2026-11-19T12:00:00Z' };

describe('periodProductionDate', () => {
  it('el jueves dentro del período', () => {
    expect(periodProductionDate(WEEK)).toBe('2026-11-19');
  });

  it('un período que abre un lunes toma el jueves de esa semana', () => {
    expect(
      periodProductionDate({ closeAt: '2026-11-22T23:00:00Z', openAt: '2026-11-16T12:00:00Z' }),
    ).toBe('2026-11-19');
  });

  it('usa el día de la operación, no el UTC', () => {
    // 02:00 UTC del viernes es todavía jueves 23:00 en Argentina.
    expect(
      periodProductionDate({ closeAt: '2026-11-26T01:00:00Z', openAt: '2026-11-20T02:00:00Z' }),
    ).toBe('2026-11-19');
  });

  it('sin jueves en el período, el primero después de abrir', () => {
    expect(
      periodProductionDate({ closeAt: '2026-11-17T23:00:00Z', openAt: '2026-11-14T12:00:00Z' }),
    ).toBe('2026-11-19');
  });

  it('otro día y con desfase', () => {
    expect(periodProductionDate(WEEK, 1)).toBe('2026-11-23');
    expect(periodProductionDate(WEEK, 4, 1)).toBe('2026-11-26');
    expect(periodProductionDate(WEEK, 4, -1)).toBe('2026-11-12');
  });
});
