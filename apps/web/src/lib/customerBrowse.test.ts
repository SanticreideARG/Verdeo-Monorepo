import { describe, expect, it } from 'vitest';

import {
  NO_FILTERS,
  activeFilterCount,
  customerMetrics,
  customerListParams,
  shortDate,
  sinceLabel,
} from './customerBrowse.js';

describe('lista de Clientes 2', () => {
  it('arma la consulta con orden, desplazamiento y sólo los filtros puestos', () => {
    const params = customerListParams({
      filters: { ...NO_FILTERS, inactiveWeeks: 4, withDebt: true, zoneId: 'z1' },
      limit: 100,
      offset: 200,
      search: '  Núñez ',
      sort: 'last_order',
    });
    expect(Object.fromEntries(params)).toEqual({
      inactiveWeeks: '4',
      limit: '100',
      offset: '200',
      search: 'Núñez',
      sort: 'last_order',
      withDebt: 'true',
      zoneId: 'z1',
    });
  });

  it('calcula las métricas de la ficha sin los cancelados', () => {
    const pedido = (deliveryDate: string, status = 'CONFIRMED') => ({
      currency: 'ARS',
      deliveryDate,
      status,
      totalMinor: 1000,
    });
    expect(customerMetrics([])).toMatchObject({ count: 0, frequency: null, lastOrderDate: null });
    expect(
      customerMetrics([
        pedido('2026-10-01'),
        pedido('2026-10-01'),
        pedido('2026-10-22'),
        pedido('2026-11-05', 'CANCELLED'),
      ]),
    ).toEqual({
      count: 3,
      currency: 'ARS',
      frequency: 'cada 3 sem.',
      lastOrderDate: '2026-10-22',
      spentMinor: 3000,
    });
    expect(customerMetrics([pedido('2026-10-01'), pedido('2026-10-04')]).frequency).toBe(
      'cada 3 días',
    );
  });

  it('cuenta los filtros activos', () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...NO_FILTERS, isNew: 'false', unlocated: true })).toBe(2);
  });

  it('dice cuánto hace del último pedido en palabras cortas', () => {
    const hoy = new Date('2026-11-07T15:00:00');
    expect(sinceLabel(null, hoy)).toBe('sin pedidos');
    expect(sinceLabel('2026-11-07', hoy)).toBe('hoy');
    expect(sinceLabel('2026-11-06', hoy)).toBe('ayer');
    expect(sinceLabel('2026-11-02', hoy)).toBe('hace 5 días');
    expect(sinceLabel('2026-10-17', hoy)).toBe('hace 3 sem.');
    expect(sinceLabel('2026-06-01', hoy)).toBe('hace 5 meses');
    expect(sinceLabel('2026-11-10', hoy)).toBe('para el 10/11/26');
    expect(shortDate('2026-09-15T00:00:00Z')).toBe('15/09/26');
  });
});
