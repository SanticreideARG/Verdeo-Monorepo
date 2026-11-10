import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Period } from './periods.js';
import {
  chooseWorkingPeriod,
  parseWorkingPeriod,
  returnToCurrentPeriod,
  startingPeriod,
  subscribeToWorkingPeriod,
  workingPeriodSnapshot,
} from './workingPeriod.js';

const period = (id: string, closeAt: string, status = 'OPEN'): Period => ({
  alias: `Semana ${id}`,
  closeAt,
  id,
  openAt: closeAt,
  status,
});
const corriente = period('b', '2999-01-08T00:00:00Z');
const anterior = period('a', '2020-01-01T00:00:00Z', 'CLOSED');
const periodos = [corriente, anterior];

describe('el período de trabajo', () => {
  beforeEach(() => window.localStorage.clear());

  it('sin elegir nada, abre en el corriente', () => {
    expect(startingPeriod(periodos)?.id).toBe('b');
  });

  it('recuerda uno que no es el corriente', () => {
    chooseWorkingPeriod('a', periodos);
    expect(parseWorkingPeriod(workingPeriodSnapshot())).toEqual({ alias: 'Semana a', id: 'a' });
    expect(startingPeriod(periodos)?.id).toBe('a');
  });

  it('elegir el corriente o "todos" borra lo guardado', () => {
    chooseWorkingPeriod('a', periodos);
    chooseWorkingPeriod('b', periodos);
    expect(workingPeriodSnapshot()).toBeNull();
    chooseWorkingPeriod('a', periodos);
    chooseWorkingPeriod('', periodos);
    expect(workingPeriodSnapshot()).toBeNull();
  });

  it('si la pantalla no tiene ese período, abre en el corriente sin olvidarlo', () => {
    chooseWorkingPeriod('a', periodos);
    expect(startingPeriod([corriente])?.id).toBe('b');
    expect(parseWorkingPeriod(workingPeriodSnapshot())?.id).toBe('a');
  });

  it('uno guardado que pasó a ser el corriente deja de estar guardado', () => {
    window.localStorage.setItem(
      'verdeo-periodo-de-trabajo',
      JSON.stringify({ alias: 'Semana b', id: 'b' }),
    );
    expect(startingPeriod(periodos)?.id).toBe('b');
    expect(workingPeriodSnapshot()).toBeNull();
  });

  it('avisa los cambios y "volver al corriente" lo borra', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToWorkingPeriod(listener);
    chooseWorkingPeriod('a', periodos);
    returnToCurrentPeriod();
    unsubscribe();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(workingPeriodSnapshot()).toBeNull();
  });
});
