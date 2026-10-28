import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SLIDE_MS, StatsHeroCarousel } from './StatsHeroCarousel.js';
import { mixSegments, periodPoints } from '../lib/statsPeriods.js';
import type { StatsPeriodRow } from '../lib/operations.js';

const slides = [
  { content: <p>uno</p>, key: 'a', title: 'Ingresos' },
  { content: <p>dos</p>, key: 'b', title: 'Ventas por período' },
  { content: <p>tres</p>, key: 'c', title: 'Cobrado' },
];

describe('StatsHeroCarousel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pasa solo, se frena con el mouse encima y se maneja con las flechas', () => {
    render(<StatsHeroCarousel slides={slides} />);
    expect(screen.getByRole('heading').textContent).toBe('Ingresos');

    act(() => {
      vi.advanceTimersByTime(SLIDE_MS);
    });
    expect(screen.getByRole('heading').textContent).toBe('Ventas por período');

    const carousel = screen.getByRole('region', { name: 'Gráficos' });
    fireEvent.mouseEnter(carousel);
    act(() => {
      vi.advanceTimersByTime(SLIDE_MS * 3);
    });
    expect(screen.getByRole('heading').textContent).toBe('Ventas por período');

    fireEvent.keyDown(carousel, { key: 'ArrowRight' });
    expect(screen.getByRole('heading').textContent).toBe('Cobrado');
    fireEvent.keyDown(carousel, { key: 'ArrowRight' });
    expect(screen.getByRole('heading').textContent).toBe('Ingresos');
  });

  it('el botón de pausa la deja quieta', () => {
    render(<StatsHeroCarousel slides={slides} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar los gráficos' }));
    act(() => {
      vi.advanceTimersByTime(SLIDE_MS * 2);
    });
    expect(screen.getByRole('heading').textContent).toBe('Ingresos');
  });
});

function row(
  input: Partial<StatsPeriodRow> & Pick<StatsPeriodRow, 'salesCycleId'>,
): StatsPeriodRow {
  return {
    adjustmentMinor: 0,
    cancelledCount: 0,
    cancelledMinor: 0,
    cancelledToStockMinor: 0,
    closeAt: '2026-10-01T00:00:00Z',
    customerCount: 1,
    cycleAlias: input.salesCycleId,
    discountMinor: 0,
    fromStockMinor: 0,
    grossMinor: 0,
    methods: [],
    netMinor: 100,
    newCustomerCount: 0,
    openAt: '2026-10-01T00:00:00Z',
    operatingSiteId: 's1',
    operatingSiteName: 'Córdoba',
    orderCount: 1,
    paidMinor: 0,
    pendingMinor: 100,
    surchargeMinor: 0,
    units: 1,
    ...input,
  };
}

describe('periodPoints y mixSegments', () => {
  it('junta las ciudades de un período y ordena del más viejo al más nuevo', () => {
    const periods = {
      currency: 'ARS',
      mix: [
        { familyName: 'Keto', salesCycleId: 'p2', units: 5 },
        { familyName: 'Real', salesCycleId: 'p2', units: 1 },
        { familyName: 'Keto', salesCycleId: 'p1', units: 2 },
      ],
      rows: [
        row({ openAt: '2026-10-08T00:00:00Z', salesCycleId: 'p2' }),
        row({ openAt: '2026-10-08T00:00:00Z', operatingSiteId: 's2', salesCycleId: 'p2' }),
        row({ openAt: '2026-10-01T00:00:00Z', salesCycleId: 'p1' }),
      ],
    };
    const points = periodPoints(periods);
    expect(points.map((point) => [point.salesCycleId, point.netMinor])).toEqual([
      ['p1', 100],
      ['p2', 200],
    ]);
    expect(mixSegments(periods, points).get('p2')).toEqual([
      { label: 'Keto', value: 5 },
      { label: 'Real', value: 1 },
    ]);
  });
});
