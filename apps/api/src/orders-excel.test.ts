import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import { buildOrdersExcel } from './orders-excel.js';
import type { OrderExportRow } from '@verdeo/orders';

function row(overrides: Partial<OrderExportRow> & { publicNumber: string }): OrderExportRow {
  return {
    createdAt: '2026-09-01T10:00:00.000Z',
    currency: 'ARS',
    customerDisplayName: 'Ana Vega',
    customerWhatsapp: '+542991234567',
    deliveryAddress: 'Calle 1',
    deliveryDate: '2026-09-13',
    deliveryZone: 'Centro',
    dietaryInstructions: [],
    items: [{ dishSelections: [], productName: 'Keto', quantityUnits: 1, variantName: '250' }],
    paidAt: null,
    paymentExpectation: 'Transferencia',
    source: 'whatsapp',
    status: 'CONFIRMED',
    totalMinor: 12_000,
    ...overrides,
  };
}

function rowsOf(built: ArrayBuffer, name: string): unknown[][] {
  const book = XLSX.read(built, { type: 'array' });
  return XLSX.utils.sheet_to_json(book.Sheets[name] as XLSX.WorkSheet, { header: 1 });
}

describe('buildOrdersExcel', () => {
  it('lleva las tres hojas y la semana en el título de cada una', () => {
    const built = buildOrdersExcel([row({ publicNumber: 'NQN-1' })], {
      cycleAlias: 'Septiembre 2',
    });
    const book = XLSX.read(built, { type: 'array' });

    expect(book.SheetNames).toEqual(['Pedidos', 'Conciliado', 'Por zona']);
    // Abierta tres días después, "Pedidos" sola no dice de qué semana es, y el nombre del archivo
    // se pierde apenas alguien la reenvía.
    for (const name of book.SheetNames) {
      expect(rowsOf(built, name)[0]?.[0]).toBe('Pedidos — Septiembre 2');
    }
  });

  it('exporta el total en pesos y no en centavos', () => {
    const rows = rowsOf(
      buildOrdersExcel([row({ publicNumber: 'NQN-1', totalMinor: 12_000 })]),
      'Pedidos',
    );
    const header = rows[1] as string[];
    const total = rows[2]?.[header.indexOf('Total')];

    // Exportar centavos obliga a dividir a mano antes de poder sumar la columna.
    expect(total).toBe(120);
  });

  it('consolida cuántas viandas de cada tipo salen', () => {
    const built = buildOrdersExcel([
      row({ publicNumber: 'NQN-1' }),
      row({
        items: [{ dishSelections: [], productName: 'Keto', quantityUnits: 2, variantName: '250' }],
        publicNumber: 'NQN-2',
      }),
      row({
        items: [
          { dishSelections: [], productName: 'Veggie', quantityUnits: 1, variantName: '400' },
        ],
        publicNumber: 'NQN-3',
      }),
    ]);
    const rows = rowsOf(built, 'Conciliado');

    expect(rows[1]).toEqual(['Menú', 'Tamaño', 'Unidades', 'Pedidos']);
    expect(rows[2]).toEqual(['Keto', '250', 3, 2]);
    expect(rows[3]).toEqual(['Veggie', '400', 1, 1]);
    expect(rows[4]).toEqual(['Total', '', 4, 3]);
  });

  it('deja los cancelados fuera del conciliado pero no de la lista', () => {
    const built = buildOrdersExcel([
      row({ publicNumber: 'NQN-1' }),
      row({ publicNumber: 'NQN-2', status: 'CANCELLED' }),
    ]);

    // Un cancelado no se produce ni se reparte, pero sigue siendo parte de lo que pasó esa semana.
    expect(rowsOf(built, 'Pedidos')).toHaveLength(4);
    expect(rowsOf(built, 'Conciliado')[2]).toEqual(['Keto', '250', 1, 1]);
    expect(rowsOf(built, 'Por zona')[2]).toEqual(['Centro', 1, 1, 120]);
  });

  it('apila la composición de un Intuitivo dentro de la celda', () => {
    const built = buildOrdersExcel([
      row({
        items: [
          {
            dishSelections: ['Guiso', 'Tarta'],
            productName: 'Intuitivo',
            quantityUnits: 1,
            variantName: '400',
          },
          { dishSelections: [], productName: 'Keto', quantityUnits: 1, variantName: '250' },
        ],
        publicNumber: 'NQN-1',
      }),
    ]);
    const rows = rowsOf(built, 'Pedidos');
    const pedido = rows[2]?.[(rows[1] as string[]).indexOf('Pedido')];

    // Dos ítems en una sola línea no se leen; acá sí hay dónde apilarlos.
    expect(pedido).toBe('Intuitivo 400 × 1 (Guiso, Tarta)\nKeto 250 × 1');
  });

  it('agrupa sin zona en su propio renglón en vez de perderlos', () => {
    const built = buildOrdersExcel([row({ deliveryZone: null, publicNumber: 'NQN-1' })]);

    expect(rowsOf(built, 'Por zona')[2]?.[0]).toBe('Sin zona');
  });

  it('dice de qué se trata cuando no se exportó un período', () => {
    const built = buildOrdersExcel([row({ publicNumber: 'NQN-1' })]);

    expect(rowsOf(built, 'Pedidos')[0]?.[0]).toBe('Pedidos — todos los períodos');
  });
});
