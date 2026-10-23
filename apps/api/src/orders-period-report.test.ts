import { buildPeriodReport, type PeriodReportOrder } from '@verdeo/orders';
import { describe, expect, it } from 'vitest';
import xlsxStyle, { type CellObject } from 'xlsx-js-style';

import { buildPeriodReportExcel, dayTitle } from './orders-period-report.js';

const XLSX = xlsxStyle;

const order = (overrides: Partial<PeriodReportOrder> = {}): PeriodReportOrder => ({
  addressLine1: 'Calle 1',
  addressLine2: 'Depto 2',
  customerName: 'Ana',
  deliveryDate: '2026-10-26',
  dietaryInstructions: ['Sin cebolla'],
  isNew: true,
  items: [
    {
      composable: false,
      dishSelections: [],
      familyName: 'Menú Nuevo Keto',
      mealsPerUnit: 5,
      quantityUnits: 2,
      variantName: '400',
    },
  ],
  notes: null,
  paid: true,
  paymentExpectation: 'Transferencia',
  phone: '2610000000',
  publicNumber: 'MZA-00001',
  route: { minutes: 40, routeLabel: 'A', sequence: 1 },
  run: 'Mañana · de 10 a 13h',
  timeSlot: '10 a 12',
  totalMinor: 160_000_00,
  zone: 'Capital',
  ...overrides,
});

function read(orders: PeriodReportOrder[]) {
  const buffer = buildPeriodReportExcel(buildPeriodReport(orders), { cycleAlias: 'Semana 43' });
  return XLSX.read(buffer, { cellStyles: true, type: 'array' });
}

describe('buildPeriodReportExcel', () => {
  it('arma Pedidos y Reparto con la barra del día, la de carga y un renglón por vianda', () => {
    const book = read([order(), order({ isNew: false, paid: false, publicNumber: 'MZA-00002' })]);
    expect(book.SheetNames).toEqual(['Pedidos', 'Reparto']);

    const sheet = book.Sheets.Pedidos;
    if (!sheet) throw new Error('sin hoja');
    const cell = (address: string) => sheet[address] as CellObject | undefined;
    expect(cell('A3')?.v).toBe('LUNES 26 de octubre');
    expect(cell('A4')?.v).toBe('Carga · Mañana · de 10 a 13h');
    // Primer renglón del pedido: horario, tiempo de ruta, dirección en dos renglones, venta.
    expect(cell('A5')?.v).toBe('10 a 12');
    expect(cell('B5')?.v).toBe('≈ 40 min');
    expect(cell('D5')?.v).toBe('Calle 1\nDepto 2');
    expect(cell('G5')?.v).toBe('KETO');
    expect(cell('L5')?.v).toBe(160_000);
    expect(cell('L6')?.v).toBe('');
    // Cuatro viandas (dos pedidos de dos) y el total del día con fórmula.
    expect(cell('F9')?.f).toBe('COUNT(F5:F8)');
    expect(cell('F9')?.v).toBe(4);
    // El resumen a la derecha.
    expect(cell('R3')?.v).toBe('KETO 400');
    expect(cell('S3')?.v).toBe(4);
  });

  it('pinta la norma de colores: nuevo, cobrado y no cobrado', () => {
    const book = read([order(), order({ isNew: false, paid: false, publicNumber: 'MZA-00002' })]);
    const sheet = book.Sheets.Pedidos;
    if (!sheet) throw new Error('sin hoja');
    const rgb = (address: string) =>
      (sheet[address] as CellObject | undefined)?.s?.fgColor?.rgb as string | undefined;
    expect(rgb('E5')).toBe('C55A11');
    expect(rgb('L5')).toBe('92D050');
    expect(rgb('L7')).toBe('FF0000');
  });
});

describe('dayTitle', () => {
  it('el día como en la barra', () => {
    expect(dayTitle('2026-10-27')).toBe('MARTES 27 de octubre');
  });
});
