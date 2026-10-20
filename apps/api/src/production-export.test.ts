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
  it('abre con la hoja "Pedido" en el formato del cliente', () => {
    const book = read(
      buildProductionExcel({
        ...report,
        base: [
          ...report.base,
          {
            exceptions: [],
            familyName: 'Keto',
            orderCount: 9,
            quantityUnits: 11,
            variantName: '400',
          },
          {
            exceptions: [],
            familyName: 'Menú Anti-Age',
            orderCount: 1,
            quantityUnits: 1,
            variantName: '250',
          },
        ],
        stock: [{ familyName: 'Keto', quantityUnits: 2, variantName: '250' }],
      }),
    );

    expect(book.SheetNames[0]).toBe('Pedido');
    const rows = rowsOf(book, 'Pedido');
    expect(rows[0]?.slice(0, 6)).toEqual([
      'PEDIDO',
      'LUNES',
      'MARTES',
      'MIÉRCOLES',
      'JUEVES',
      'VIERNES',
    ]);
    // Pedidos más stock, las mismas porciones en cada plato.
    expect(rows[1]?.slice(0, 6)).toEqual(['KETO 250', 14, 14, 14, 14, 14]);
    expect(rows[2]?.slice(0, 6)).toEqual(['KETO 400', 11, 11, 11, 11, 11]);
    // Un renglón en blanco entre menús, y los Intuitivos como un menú más.
    expect((rows[3] ?? []).every((cell) => cell === '')).toBe(true);
    expect(rows[4]?.slice(0, 6)).toEqual(['ANTI-AGE 250', 1, 1, 1, 1, 1]);
    expect(rows[6]?.slice(0, 6)).toEqual(['INTUITIVO 400', 3, 3, 3, 3, 3]);
    // El total de porciones, abajo a la derecha: (14 + 11 + 1 + 3) × 5.
    const last = rows.at(-1) as unknown[];
    expect(last[0]).toBe('TOTAL');
    expect(last.at(-1)).toBe(145);
    expect((book.Sheets.Pedido as XLSX.WorkSheet).G9 as XLSX.CellObject).toMatchObject({
      f: 'SUM(B2:F7)',
    });
  });

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
    // Salvo "Pedido", que copia el formato del cliente tal cual: arranca con su encabezado.
    for (const name of book.SheetNames.filter((sheet) => sheet !== 'Pedido')) {
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
      'Pedido',
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

    expect(book.SheetNames).toEqual(['Pedido', 'Conciliado', 'Producción base']);
  });

  it('suma las columnas numéricas al pie de cada hoja', () => {
    const book = read(buildProductionExcel(report));
    const rows = rowsOf(book, 'Conciliado');

    // Un renglón en blanco separa la tabla del total, así que el total es la última fila.
    const total = rows.at(-1);
    expect(total?.[0]).toBe('Total');
    // Keto 12 + los dos Intuitivos (2 y 1) = 15 unidades, en 8 + 2 pedidos.
    expect(total?.[2]).toBe(15);
    expect(total?.[3]).toBe(10);
  });

  /*
   * `SUBTOTAL(109, …)` y no `SUM`: 109 suma ignorando lo que el filtro esconde, así que filtrar por
   * una familia deja el total de esa familia. Con `SUM`, el número de abajo contradiría lo que se
   * está mirando arriba.
   */
  it('escribe el total como fórmula que respeta el autofiltro', () => {
    const book = read(buildProductionExcel(report));
    const sheet = book.Sheets.Conciliado as XLSX.WorkSheet;

    const celda = Object.entries(sheet).find(
      ([reference, cell]) =>
        !reference.startsWith('!') && (cell as XLSX.CellObject).f !== undefined,
    );
    expect((celda?.[1] as XLSX.CellObject | undefined)?.f).toMatch(/^SUBTOTAL\(109,/);
  });

  /*
   * Con la fórmula va el valor ya calculado. Excel y Sheets recalculan al abrir, pero un lector que
   * sólo parsea el archivo no evalúa nada: sin el valor cacheado vería la celda vacía, y esta
   * planilla se reenvía y se abre con cualquier cosa.
   */
  it('deja el total también como número, para quien no recalcula', () => {
    const book = read(buildProductionExcel(report));
    const rows = rowsOf(book, 'Platos a preparar');

    expect(rows.at(-1)).toEqual(['Total', 3]);
  });

  it('no suma columnas que no son cantidades', () => {
    const book = read(buildProductionExcel(report));
    const rows = rowsOf(book, 'Intuitivos');

    const total = rows.at(-1);
    // El "#" es el número de renglón: sumarlo daría 3, un número sin significado.
    expect(total?.[0]).toBe('Total');
    expect(total?.[3]).toBe(3);
    expect(total?.[1]).toBeUndefined();
  });
});
