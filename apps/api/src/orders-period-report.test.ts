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
  source: 'email',
  timeSlot: '10 a 12',
  totalMinor: 160_000_00,
  zone: 'Capital',
  ...overrides,
});

function read(orders: PeriodReportOrder[]) {
  const buffer = buildPeriodReportExcel(buildPeriodReport(orders), { cycleAlias: 'Semana 43' });
  return XLSX.read(buffer, { cellNF: true, cellStyles: true, type: 'array' });
}

function sheetOf(book: ReturnType<typeof read>, name: string) {
  const sheet = book.Sheets[name];
  if (!sheet) throw new Error('sin hoja');
  const cell = (address: string) => sheet[address] as CellObject | undefined;
  const rgb = (address: string) =>
    (cell(address)?.s as { fgColor?: { rgb?: string } } | undefined)?.fgColor?.rgb;
  return { cell, rgb };
}

describe('buildPeriodReportExcel: Pedidos', () => {
  it('sin horario, ruta, zona ni notas; la barra del día, la de carga y un renglón por vianda', () => {
    const book = read([order(), order({ isNew: false, paid: false, publicNumber: 'MZA-00002' })]);
    expect(book.SheetNames).toEqual(['Pedidos', 'Reparto']);
    const { cell } = sheetOf(book, 'Pedidos');
    expect(cell('A2')?.v).toBe('Dirección');
    expect(cell('A3')?.v).toBe('LUNES 26 de octubre');
    expect(cell('A4')?.v).toBe('Carga · Mañana · de 10 a 13h');
    expect(cell('A5')?.v).toBe('Calle 1\nDepto 2');
    expect(cell('B5')?.v).toBe('Ana');
    expect(cell('C5')?.v).toBe(400);
    expect(cell('D5')?.v).toBe('KETO');
    expect(cell('I5')?.v).toBe(160_000);
    expect(cell('I6')?.v).toBe('');
    expect(cell('K2')?.v).toBe('Celular');
    expect(cell('L2')).toBeUndefined();
    // Cuatro viandas (dos pedidos de dos) y el total del día con fórmula.
    expect(cell('C9')?.f).toBe('COUNT(C5:C8)');
    expect(cell('C9')?.v).toBe(4);
    // El resumen general a la derecha.
    expect(cell('M3')?.v).toBe('KETO 400');
    expect(cell('N3')?.v).toBe(4);
  });

  it('el "$" sólo en la venta: ni en el tamaño ni en las cantidades', () => {
    const { cell } = sheetOf(read([order()]), 'Pedidos');
    expect(String(cell('I5')?.z)).toContain('$');
    expect(String(cell('C5')?.z ?? '')).not.toContain('$');
    expect(String(cell('N3')?.z ?? '')).not.toContain('$');
  });

  it('nuevo por mail en naranja, por WhatsApp en marrón; el resto, sin color', () => {
    const book = read([
      order(),
      order({ customerName: 'Beto', publicNumber: 'MZA-00002', source: 'whatsapp' }),
      order({ customerName: 'Caro', isNew: false, paid: false, publicNumber: 'MZA-00003' }),
      order({ customerName: 'Dani', publicNumber: 'MZA-00004', source: 'web' }),
    ]);
    const { cell, rgb } = sheetOf(book, 'Pedidos');
    const rowOf = (name: string) =>
      [5, 6, 7, 8, 9, 10, 11, 12].find((row) => cell(`B${String(row)}`)?.v === name);
    expect(rgb(`B${String(rowOf('Ana'))}`)).toBe('FFC000');
    expect(rgb(`B${String(rowOf('Beto'))}`)).toBe('C65911');
    expect(rgb(`B${String(rowOf('Caro'))}`)).toBeUndefined();
    expect(rgb(`B${String(rowOf('Dani'))}`)).toBeUndefined();
    // La venta de una transferencia: verde cobrada, roja sin cobrar.
    expect(rgb(`I${String(rowOf('Ana'))}`)).toBe('92D050');
    expect(rgb(`I${String(rowOf('Caro'))}`)).toBe('FF0000');
  });
});

describe('buildPeriodReportExcel: Reparto', () => {
  it('tiempo de ruta primero, dirección en una línea, transferencia en $0 y total en efectivo', () => {
    const book = read([
      order(),
      order({
        customerName: 'Beto',
        paymentExpectation: 'Efectivo',
        publicNumber: 'MZA-00002',
        route: { minutes: 55, routeLabel: 'A', sequence: 2 },
        totalMinor: 50_000_00,
      }),
    ]);
    const { cell, rgb } = sheetOf(book, 'Reparto');
    expect(cell('A2')?.v).toBe('Tiempo de ruta');
    expect(cell('A5')?.v).toBe('≈ 40 min');
    expect(cell('B5')?.v).toBe('10 a 12');
    expect(cell('D5')?.v).toBe('Calle 1 · Depto 2');
    expect(cell('E5')?.v).toBe('Ana');
    expect(rgb('E5')).toBeUndefined();
    expect(cell('F5')?.v).toBe(400);
    expect(String(cell('F5')?.z ?? '')).not.toContain('$');
    // La transferencia no la cobra quien reparte.
    expect(cell('H5')?.v).toBe(0);
    expect(cell('H7')?.v).toBe(50_000);
    expect(cell('J2')?.v).toBe('Celular');
    expect(cell('K2')).toBeUndefined();
    expect(cell('H9')?.f).toBe('SUM(H5:H8)');
    expect(cell('H9')?.v).toBe(50_000);
  });

  it('un renglón por bulto y un resumen por día, desde la fila de su día', () => {
    const dishes = Array.from({ length: 6 }, (_, index) => `Plato ${String(index)}`);
    const book = read([
      order({
        customerName: 'Clara',
        items: [
          {
            composable: true,
            dishSelections: dishes,
            familyName: 'Intuitivo',
            mealsPerUnit: 5,
            quantityUnits: 1,
            variantName: '400',
          },
        ],
      }),
      order({ deliveryDate: '2026-10-27', publicNumber: 'MZA-00002' }),
    ]);
    const { cell } = sheetOf(book, 'Reparto');
    // Lunes: dos renglones del Intuitivo de seis platos y el total en la fila 7.
    expect(cell('G5')?.v).toBe('Clara');
    expect(cell('G6')?.v).toBe('Clara');
    expect(cell('F7')?.v).toBe(2);
    expect(cell('L3')?.v).toBe('Producto');
    expect(cell('L4')?.v).toBe('Clara 400');
    expect(cell('M4')?.v).toBe(1);
    expect(cell('L5')?.v).toBe('TOTAL');
    // Martes: su barra en la fila 9 y su resumen ahí.
    expect(cell('A9')?.v).toBe('MARTES 27 de octubre');
    expect(cell('L9')?.v).toBe('Producto');
    expect(cell('L10')?.v).toBe('KETO 400');
    expect(cell('M10')?.v).toBe(2);
  });
});

describe('dayTitle', () => {
  it('el día como en la barra', () => {
    expect(dayTitle('2026-10-27')).toBe('MARTES 27 de octubre');
  });
});
