import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WeeklyMenu } from './operations.js';
import { currentPeriod, periodsFromMenus, type Period } from './periods.js';

function menu(overrides: {
  alias: string;
  closeAt: string;
  id: string;
  openAt: string;
  operatingSiteId?: string | null;
  status?: string;
}): WeeklyMenu {
  return {
    cycle: {
      alias: overrides.alias,
      closeAt: overrides.closeAt,
      id: overrides.id,
      openAt: overrides.openAt,
      partialKitchenCutoffAt: overrides.closeAt,
      status: overrides.status ?? 'OPEN',
    },
    id: `menu-${overrides.id}-${overrides.operatingSiteId ?? 'master'}`,
    offerings: [],
    operatingSiteId: overrides.operatingSiteId ?? null,
    operatingSiteName: null,
    publishedAt: null,
    revision: 1,
    sourceMenuId: null,
    status: 'PUBLISHED',
  };
}

const semana35 = { alias: 'Semana 35', closeAt: '2026-09-07', id: 'c35', openAt: '2026-09-01' };
const semana36 = { alias: 'Semana 36', closeAt: '2026-09-14', id: 'c36', openAt: '2026-09-08' };

afterEach(() => {
  vi.useRealTimers();
});

describe('periodsFromMenus', () => {
  it('deduplica el mismo ciclo distribuido en varias ciudades', () => {
    // `GET /api/v1/menus` devuelve una fila por ciudad; acá interesa el ciclo, no el menú.
    const periods = periodsFromMenus([
      menu({ ...semana36, operatingSiteId: null }),
      menu({ ...semana36, operatingSiteId: 'neuquen' }),
      menu({ ...semana36, operatingSiteId: 'mendoza' }),
    ]);

    expect(periods).toHaveLength(1);
    expect(periods[0]?.alias).toBe('Semana 36');
  });

  it('ordena del más reciente al más viejo', () => {
    const periods = periodsFromMenus([menu(semana35), menu(semana36)]);

    // El de arriba es sobre el que se está trabajando; el histórico se busca hacia abajo.
    expect(periods.map((period) => period.id)).toEqual(['c36', 'c35']);
  });

  it('devuelve vacío sin menús', () => {
    expect(periodsFromMenus([])).toEqual([]);
  });
});

describe('currentPeriod', () => {
  const periods: Period[] = periodsFromMenus([menu(semana35), menu(semana36)]);

  it('elige el que todavía no cerró', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T12:00:00Z'));

    expect(currentPeriod(periods)?.id).toBe('c36');
  });

  it('sigue eligiendo el vigente el mismo día del cierre', () => {
    // El cierre es una fecha, no un instante: hasta que no pasa, la semana sigue siendo la actual.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T09:00:00Z'));

    expect(currentPeriod(periods)?.id).toBe('c36');
  });

  it('cae al más reciente cuando ya cerraron todos', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-01T12:00:00Z'));

    // Nunca devuelve "todos": tener el histórico entero delante es lo que se quiere evitar.
    expect(currentPeriod(periods)?.id).toBe('c36');
  });

  it('ignora un ciclo cerrado a mano aunque su fecha no haya pasado', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T12:00:00Z'));
    const cerrado = periodsFromMenus([
      menu({ ...semana36, status: 'CLOSED' }),
      menu({ ...semana35, closeAt: '2026-09-30' }),
    ]);

    expect(currentPeriod(cerrado)?.id).toBe('c35');
  });

  it('devuelve null sin períodos', () => {
    expect(currentPeriod([])).toBeNull();
  });
});
