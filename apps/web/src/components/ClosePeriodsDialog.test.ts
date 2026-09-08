import { afterEach, describe, expect, it, vi } from 'vitest';

import { isStale, periodsToOffer } from './ClosePeriodsDialog.js';
import type { Period } from '../lib/periods.js';

function period(overrides: Partial<Period> & { closeAt: string; id: string }): Period {
  return {
    alias: overrides.id,
    openAt: overrides.openAt ?? overrides.closeAt,
    status: 'OPEN',
    ...overrides,
  };
}

/** Los períodos llegan del más reciente al más viejo, como los deja `periodsFromMenus`. */
const nueva = period({ closeAt: '2026-09-20', id: 'nueva' });
const anterior = period({ closeAt: '2026-09-13', id: 'anterior' });
const vieja = period({ closeAt: '2026-08-20', id: 'vieja' });

afterEach(() => {
  vi.useRealTimers();
});

describe('periodsToOffer', () => {
  it('ofrece el anterior inmediato', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));

    // Publicar una semana es cuando la anterior dejó de estar en curso.
    expect(periodsToOffer([nueva, anterior], 'nueva').map((p) => p.id)).toEqual(['anterior']);
  });

  it('nunca ofrece cerrar la semana que se acaba de publicar', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));

    expect(periodsToOffer([nueva, anterior], 'nueva').map((p) => p.id)).not.toContain('nueva');
  });

  it('suma los que llevan más de dos semanas abiertos', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));

    /*
     * "Vieja" cerró el 20 de agosto y sigue abierta: veintiséis días. Sin esto se acumulan como
     * vigentes en el selector de período y "actual" deja de significar algo.
     */
    const offered = periodsToOffer([nueva, anterior, vieja], 'nueva');
    expect(offered.map((p) => p.id)).toEqual(['anterior', 'vieja']);
  });

  it('no ofrece uno intermedio que todavía no venció', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
    const reciente = period({ closeAt: '2026-09-06', id: 'reciente' });

    // Nueve días: se dejó atrás pero todavía puede estar en curso, así que no se molesta con él.
    expect(periodsToOffer([nueva, anterior, reciente], 'nueva').map((p) => p.id)).toEqual([
      'anterior',
    ]);
  });

  it('ignora los que ya están cerrados', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
    const cerrada = period({ closeAt: '2026-08-20', id: 'cerrada', status: 'CLOSED' });

    expect(periodsToOffer([nueva, cerrada], 'nueva')).toEqual([]);
  });

  it('no ofrece nada en la primera semana de una instalación', () => {
    expect(periodsToOffer([nueva], 'nueva')).toEqual([]);
  });
});

describe('isStale', () => {
  it('marca vencido después de dos semanas del cierre, no antes', () => {
    const trece = new Date('2026-09-26T12:00:00Z').getTime();
    const quince = new Date('2026-09-28T12:00:00Z').getTime();

    expect(isStale(anterior, trece)).toBe(false);
    expect(isStale(anterior, quince)).toBe(true);
  });
});
