import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import { buildCycleReportExcel, type CycleReport } from './cycle-report.js';

const report: CycleReport = {
  cancelled: { count: 1, totalMinor: 7_000_000 },
  cycle: { alias: 'Octubre 3', id: 'c', status: 'CLOSED' },
  generatedAt: '2026-10-22T12:00:00.000Z',
  methods: [
    {
      count: 3,
      isCash: true,
      method: 'Efectivo',
      paidMinor: 14_000_000,
      pendingMinor: 7_000_000,
      totalMinor: 21_000_000,
    },
    {
      count: 1,
      isCash: false,
      method: 'Transferencia',
      paidMinor: 0,
      pendingMinor: 8_000_000,
      totalMinor: 8_000_000,
    },
  ],
  receivables: [
    {
      customer: { displayName: 'Ana Pérez', phone: null, whatsapp: '2994000000' },
      orders: [
        {
          deliveryDate: '2026-10-18',
          items: 'Keto 400 × 1',
          paymentExpectation: 'Transferencia',
          publicNumber: 'NQN-00012',
          totalMinor: 8_000_000,
        },
      ],
      totalMinor: 8_000_000,
    },
  ],
  stock: [
    {
      carriedIn: 0,
      carriedOut: 3,
      familyName: 'Keto',
      planned: 4,
      sold: 1,
      variantName: '250',
      writtenOff: 0,
    },
  ],
  totals: {
    cashMinor: 21_000_000,
    orderCount: 4,
    paidMinor: 14_000_000,
    pendingMinor: 15_000_000,
    totalMinor: 29_000_000,
    transferMinor: 8_000_000,
  },
};

function rowsOf(book: XLSX.WorkBook, name: string): unknown[][] {
  return XLSX.utils.sheet_to_json(book.Sheets[name] as XLSX.WorkSheet, { header: 1 });
}

describe('buildCycleReportExcel', () => {
  const book = XLSX.read(buildCycleReportExcel(report), { type: 'array' });

  it('trae resumen, medios de pago, por cobrar y stock', () => {
    expect(book.SheetNames).toEqual(['Resumen', 'Por medio de pago', 'Por cobrar', 'Stock']);
    expect(rowsOf(book, 'Resumen')[0]?.[0]).toBe('Informe del período Octubre 3');
  });

  it('la plata va como número en pesos, no como texto', () => {
    const resumen = rowsOf(book, 'Resumen');
    // Fila "Total vendido": $290.000 como número, para poder sumarlo en Excel.
    expect(resumen.find((row) => row[0] === 'Total vendido')?.[1]).toBe(290_000);
  });

  it('cierra los medios de pago con el total', () => {
    const rows = rowsOf(book, 'Por medio de pago');
    expect(rows.at(-1)).toEqual(['TOTAL', '', 4, 290_000, 140_000, 150_000]);
  });

  it('lista cada pedido impago con su cliente y su contacto', () => {
    const rows = rowsOf(book, 'Por cobrar');
    expect(rows[3]).toEqual([
      'Ana Pérez',
      '2994000000',
      'NQN-00012',
      '2026-10-18',
      'Keto 400 × 1',
      'Transferencia',
      80_000,
    ]);
  });
});
