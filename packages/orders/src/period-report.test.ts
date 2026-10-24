import { describe, expect, it } from 'vitest';

import {
  buildPeriodReport,
  composableRows,
  isTransfer,
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
  source: 'whatsapp',
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

    // Sin menú de origen conocido, el plato va con su nombre en el primer día libre.
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

describe('composableRows', () => {
  it('el menú de cada plato en la columna de su día, un renglón por menú', () => {
    const veg = (slot: number) => ({ familyName: 'Menú Vegetariano', slot });
    const rows = composableRows(
      item({
        composable: true,
        dishSelections: ['a', 'b', 'c', 'd', 'e'],
        dishSources: [veg(1), { familyName: 'Menú Nuevo Keto', slot: 2 }, veg(3), veg(4), veg(5)],
        familyName: 'Intuitivo',
      }),
    );
    // Keto primero, por la jerarquía; vegetariano en su renglón.
    expect(rows).toEqual([
      ['', 'KETO', '', '', ''],
      ['VEGETARIANO', '', 'VEGETARIANO', 'VEGETARIANO', 'VEGETARIANO'],
    ]);
  });

  it('dos platos del mismo menú el mismo día abren otro renglón', () => {
    const real = (slot: number) => ({ familyName: 'Menú Real', slot });
    const rows = composableRows(
      item({
        composable: true,
        dishSelections: ['a', 'b', 'c'],
        dishSources: [real(1), real(2), real(2)],
        familyName: 'Intuitivo',
      }),
    );
    expect(rows).toEqual([
      ['REAL', 'REAL', '', '', ''],
      ['', 'REAL', '', '', ''],
    ]);
  });
});

describe('isTransfer', () => {
  it('reconoce la transferencia', () => {
    expect(isTransfer('Transferencia')).toBe(true);
    expect(isTransfer('Efectivo')).toBe(false);
  });
});
