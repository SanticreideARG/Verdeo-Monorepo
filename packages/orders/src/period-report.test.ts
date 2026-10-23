import { describe, expect, it } from 'vitest';

import {
  buildPeriodReport,
  routeMinutesLabel,
  type PeriodReportItem,
  type PeriodReportOrder,
} from './period-report.js';

const item = (overrides: Partial<PeriodReportItem> = {}): PeriodReportItem => ({
  composable: false,
  dishSelections: [],
  familyName: 'Menú Nuevo Keto',
  mealsPerUnit: 5,
  quantityUnits: 1,
  variantName: '400',
  ...overrides,
});

const order = (overrides: Partial<PeriodReportOrder> = {}): PeriodReportOrder => ({
  addressLine1: 'Calle 1',
  addressLine2: null,
  customerName: 'Ana',
  deliveryDate: '2026-10-26',
  dietaryInstructions: [],
  isNew: false,
  items: [item()],
  notes: null,
  paid: false,
  paymentExpectation: 'Transferencia',
  phone: null,
  publicNumber: 'MZA-00001',
  route: null,
  run: null,
  timeSlot: null,
  totalMinor: 80_000_00,
  zone: 'Capital',
  ...overrides,
});

describe('buildPeriodReport', () => {
  it('un renglón por vianda, la venta sólo en el primero, las comidas en las cinco columnas', () => {
    const report = buildPeriodReport([
      order({ items: [item({ quantityUnits: 2 }), item({ mealsPerUnit: 3, variantName: '250' })] }),
    ]);
    const rows = report.days[0]?.rows ?? [];

    expect(rows.map((row) => [row.first, row.size, row.meals.join(',')])).toEqual([
      [true, '400', 'KETO,KETO,KETO,KETO,KETO'],
      [false, '400', 'KETO,KETO,KETO,KETO,KETO'],
      [false, '250', 'KETO,KETO,KETO,,'],
    ]);
    expect(report.summary).toEqual([
      { label: 'KETO 400', units: 2 },
      { label: 'KETO 250', units: 1 },
    ]);
    expect(report.totalUnits).toBe(3);
  });

  it('el Intuitivo lleva sus platos y, en reparto y resumen, el nombre del cliente', () => {
    const report = buildPeriodReport([
      order({
        customerName: 'Clara',
        items: [
          item({ composable: true, dishSelections: ['Lomo', 'Curry'], familyName: 'Intuitivo' }),
        ],
      }),
      order({ items: [item({ familyName: 'Menú Anti-Age', variantName: '250' })] }),
    ]);
    const rows = report.days[0]?.rows ?? [];

    expect(rows.find((row) => row.composable)?.meals).toEqual(['Lomo', 'Curry', '', '', '']);
    expect(rows.find((row) => row.composable)?.variety).toBe('Clara');
    expect(report.summary.map((line) => line.label)).toEqual(['ANTIAGE 250', 'Clara 400']);
  });

  it('secciones por día y, dentro del día, en el orden de la ruta; sin ruta, al final', () => {
    const report = buildPeriodReport([
      order({ deliveryDate: '2026-10-27', publicNumber: 'MZA-9' }),
      order({ publicNumber: 'MZA-3' }),
      order({ publicNumber: 'MZA-2', route: { minutes: 40, routeLabel: 'A', sequence: 2 } }),
      order({ publicNumber: 'MZA-1', route: { minutes: 10, routeLabel: 'A', sequence: 1 } }),
    ]);

    expect(report.days.map((day) => day.date)).toEqual(['2026-10-26', '2026-10-27']);
    expect(report.days[0]?.rows.map((row) => row.order.publicNumber)).toEqual([
      'MZA-1',
      'MZA-2',
      'MZA-3',
    ]);
  });
});

describe('routeMinutesLabel', () => {
  it('minutos y horas', () => {
    expect(routeMinutesLabel(25)).toBe('≈ 25 min');
    expect(routeMinutesLabel(70)).toBe('≈ 1 h 10');
    expect(routeMinutesLabel(120)).toBe('≈ 2 h');
    expect(routeMinutesLabel(null)).toBe('');
  });
});
