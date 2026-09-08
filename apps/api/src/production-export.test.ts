import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import { buildProductionExcel, type ProductionReport } from './production-export.js';

const report: ProductionReport = {
  actuals: [],
  base: [
    {
      exceptions: [],
      familyName: 'Keto',
      orderCount: 8,
      quantityUnits: 12,
      variantName: '250',
    },
  ],
  custom: [
    {
      customerDisplayName: 'Lola',
      dietaryInstructions: [],
      dishSelections: ['Guiso', 'Tarta', 'Wok', 'Milanesa', 'Ensalada'],
      familyName: 'Intuitivo',
      orderPublicNumber: 'NQN-00030',
      quantityUnits: 2,
      sequence: 1,
      variantName: '400',
    },
    {
      customerDisplayName: 'Rosa',
      dietaryInstructions: [],
      dishSelections: ['Guiso', 'Tarta', 'Wok', 'Milanesa', 'Ensalada'],
      familyName: 'Intuitivo',
      orderPublicNumber: 'NQN-00031',
      quantityUnits: 1,
      sequence: 2,
      variantName: '400',
    },
  ],
  cycle: { alias: 'Semana 36', id: '00000000-0000-4000-8000-000000000001' },
  delta: null,
  dishTally: [{ dishName: 'Guiso', portions: 3 }],
  subtitle: 'Consolidado al momento',
  totalOrders: 10,
  totalUnits: 15,
};

function read(built: ArrayBuffer) {
  return XLSX.read(built, { cellStyles: true, type: 'array' });
}

function rowsOf(book: XLSX.WorkBook, name: string): unknown[][] {
  return XLSX.utils.sheet_to_json(book.Sheets[name] as XLSX.WorkSheet, { header: 1 });
}

describe('buildProductionExcel', () => {
  it('cuenta los Intuitivos en el conciliado, que la hoja base no tiene', () => {
    const book = read(buildProductionExcel(report));
    const rows = rowsOf(book, 'Conciliado');

    /*
     * Un Intuitivo lleva su propia composición, así que el consolidado lo saca aparte, uno por
     * pedido, y la hoja base no lo incluye. Sin esta hoja, "¿cuántos menús de cada tipo salen esta
     * semana?" había que sumarlo a mano.
     */
    expect(rows[1]).toEqual(['Menú', 'Tamaño', 'Unidades', 'Pedidos']);
    // Dos pedidos de Intuitivo 400, de dos y una unidad.
    expect(rows[2]).toEqual(['Intuitivo', '400', 3, 2]);
    expect(rows[3]).toEqual(['Keto', '250', 12, 8]);
  });

  it('pone la semana en el título de cada hoja', () => {
    const book = read(buildProductionExcel(report));

    // Abierta tres días después, "Producción base" sola no dice de qué semana es, y el nombre del
    // archivo se pierde apenas alguien la reenvía.
    for (const name of book.SheetNames) {
      expect(rowsOf(book, name)[0]?.[0]).toBe('Producción — Semana 36 · Consolidado al momento');
    }
  });

  it('separa unidades de pedidos en la hoja base', () => {
    const book = read(buildProductionExcel(report));
    const rows = rowsOf(book, 'Producción base');

    // Antes decía "Unidades planificadas" sobre lo que en realidad es la demanda, y las columnas
    // salían en orden alfabético: Delta primero, Familia cuarta.
    expect(rows[1]).toEqual([
      'Familia',
      'Tamaño',
      'Unidades',
      'Pedidos',
      'Producción real',
      'Delta',
      'Excepciones',
    ]);
    expect(rows[2]?.slice(0, 4)).toEqual(['Keto', '250', 12, 8]);
  });

  it('lleva las cuatro hojas y les da ancho de columna', () => {
    const book = read(buildProductionExcel(report));

    expect(book.SheetNames).toEqual([
      'Conciliado',
      'Producción base',
      'Platos a preparar',
      'Intuitivos',
    ]);
    // Los anchos sí llegan al archivo; la negrita y los paneles fijos no los escribe esta versión.
    expect(book.Sheets.Conciliado?.['!cols']).toHaveLength(4);
  });

  it('omite las hojas que no tienen nada que mostrar', () => {
    const book = read(buildProductionExcel({ ...report, custom: [], dishTally: [] }));

    expect(book.SheetNames).toEqual(['Conciliado', 'Producción base']);
  });
});
