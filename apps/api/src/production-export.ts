/*
 * `xlsx-js-style` y no `xlsx`: es el mismo SheetJS con la escritura de estilos (relleno, bordes,
 * negrita), que la versión libre de `xlsx` descarta. La hoja "Pedido" copia el formato del cliente y
 * sin estilos no se parecía.
 */
import xlsxStyle, { type CellObject, type WorkSheet } from 'xlsx-js-style';

// El paquete es CommonJS: en Node, sus funciones llegan por el export por defecto, no por nombre.
const XLSX = xlsxStyle;

import type { ProductionSnapshotSchema } from '@verdeo/contracts';
import { compareFamilies, compareSizes } from '@verdeo/orders';
import type { z } from 'zod';

type ProductionSnapshot = z.infer<typeof ProductionSnapshotSchema>;

/**
 * Lo que se exporta, venga de un snapshot congelado o del consolidado en vivo.
 *
 * Los dos informes son el mismo informe: uno se sacó el martes a las 20:00 y el otro es lo que hay
 * ahora. `actuals` y `delta` sólo tienen contenido en el congelado —producción real informada y
 * cuánto se movió contra el parcial—, y en el vivo llegan vacíos, que es más simple que sostener
 * dos juegos de constructores para la misma tabla.
 */
export interface ProductionReport {
  actuals: ProductionSnapshot['payload']['actuals'];
  base: ProductionSnapshot['payload']['base'];
  custom: ProductionSnapshot['payload']['custom'];
  cycle: ProductionSnapshot['payload']['cycle'];
  delta: ProductionSnapshot['payload']['delta'];
  dishTally: ProductionSnapshot['payload']['dishTally'];
  /** Las variedades en el orden del menú; sin esto, alfabético. */
  familyOrder?: readonly string[];
  /** El stock del período: también se cocina, así que entra en la hoja "Pedido". */
  stock?: readonly { familyName: string; quantityUnits: number; variantName: string }[];
  /** "Parcial (martes 20:00)", "Final" o "Consolidado al momento". */
  subtitle: string;
  totalOrders: number;
  totalUnits: number;
}

export function reportFromSnapshot(snapshot: ProductionSnapshot): ProductionReport {
  return {
    ...snapshot.payload,
    subtitle: snapshot.kind === 'partial' ? 'Parcial (martes 20:00)' : 'Final (miércoles 19:00)',
  };
}

/**
 * Turns a stored production snapshot into the three hand-off formats the spec asks for
 * (WEEKLY_MENU_AND_PRODUCTION.md "Snapshots"): Excel for the kitchen sheet, a WhatsApp-ready text
 * block, and a print-ready page. "PDF" is deliberately the print page rather than a generated
 * binary: adding a PDF-rendering library to a Vercel Function bundle for one report is a real
 * dependency and font-bundling risk, and every browser already turns a print-styled page into a
 * PDF via its native print dialog — so that is the adapter here instead of a new one.
 */

function lineLabel(familyName: string, variantName: string): string {
  return `${familyName} ${variantName}`;
}

/** "Menú Anti-Age" → "Anti-Age": en una lista de platos, el "Menú" repetido es ruido. */
function shortFamily(familyName: string): string {
  return familyName.replace(/^men[uú]\s+/i, '');
}

/**
 * Los platos de un Intuitivo con su menú: "Guiso (Keto)". Dos platos con el mismo nombre en dos
 * menús son dos platos distintos, así que sin el menú no se sabe cuál cocinar.
 */
function dishesWithOrigin(item: ProductionReport['custom'][number]): string[] {
  return item.dishSelections.map((dish, index) => {
    const source = item.dishSources?.[index] ?? null;
    return source ? `${dish} (${shortFamily(source.familyName)})` : dish;
  });
}

function tallyLabel(entry: ProductionReport['dishTally'][number]): string {
  return entry.familyName ? `${entry.dishName} (${shortFamily(entry.familyName)})` : entry.dishName;
}

export function productionSnapshotFilenameBase(snapshot: ProductionSnapshot): string {
  const alias = snapshot.payload.cycle.alias.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return `produccion-${alias}-${snapshot.kind}`;
}

/**
 * Una hoja con su título arriba y los encabezados debajo.
 *
 * El título en la fila 1 dice de qué semana es la planilla: abierta tres días después, "Producción
 * base" sola no lo dice, y el nombre del archivo se pierde apenas alguien la reenvía.
 *
 * Estas hojas van sin estilos a propósito (la que los lleva es "Pedido"). Con `xlsx` 0.18 no se
 * podían escribir —la negrita era de la versión paga—, y tampoco se escriben paneles fijos,
 * ni por `!freeze` ni por `!views`. Comprobado, no supuesto. Queda lo que sí llega al archivo:
 * anchos de columna pensados por contenido y el autofiltro sobre la fila de encabezados, que es lo
 * que permite ordenar y filtrar sin tocar nada.
 */
function sheetWithTitle(
  title: string,
  rows: Record<string, number | string>[],
  widths: number[],
  /** Encabezados cuya columna se suma al pie. Los que no son números se ignoran. */
  totalColumns: readonly string[] = [],
): WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([[title], []]);
  XLSX.utils.sheet_add_json(sheet, rows, { origin: 'A2' });
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  const lastColumn = XLSX.utils.encode_col(Math.max(0, widths.length - 1));
  // El autofiltro cubre encabezados y datos, y termina antes del total: adentro, filtrar u ordenar
  // se lo llevaría al medio de la tabla como si fuera un renglón más.
  sheet['!autofilter'] = { ref: `A2:${lastColumn}${String(rows.length + 2)}` };

  const headers = Object.keys(rows[0] ?? {});
  if (totalColumns.length === 0 || rows.length === 0) return sheet;

  /*
   * Los totales van al pie, separados por un renglón en blanco.
   *
   * Cada uno es un `SUBTOTAL(109, …)` y no un `SUM`: 109 es "sumar ignorando lo que el filtro
   * esconde", así que filtrar por una familia deja el total de esa familia en vez del de la
   * planilla entera. Con `SUM` el número de abajo contradiría lo que se está mirando.
   *
   * Se escribe la fórmula y además el valor ya calculado. Excel y Sheets recalculan al abrir, pero
   * un lector que sólo parsea el archivo no evalúa nada: sin el valor cacheado vería la celda
   * vacía, y esta planilla se reenvía y se abre con cualquier cosa.
   */
  const totalRow = rows.length + 4;
  sheet[`A${String(totalRow)}`] = { t: 's', v: 'Total' };
  for (const header of totalColumns) {
    const index = headers.indexOf(header);
    if (index < 0) continue;
    const column = XLSX.utils.encode_col(index);
    const sum = rows.reduce((accumulated, row) => {
      const value = row[header];
      return accumulated + (typeof value === 'number' ? value : 0);
    }, 0);
    sheet[`${column}${String(totalRow)}`] = {
      f: `SUBTOTAL(109,${column}3:${column}${String(rows.length + 2)})`,
      t: 'n',
      v: sum,
    };
  }
  sheet['!ref'] = `A1:${lastColumn}${String(totalRow)}`;
  return sheet;
}

/** Una columna por plato del menú, en su orden: el plato 1 se cocina el lunes, el 5 el viernes. */
export const ORDER_SHEET_DAYS = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES'] as const;

/**
 * La hoja "Pedido", con el formato que usa el cliente para cocina.
 *
 * Un renglón por menú y tamaño ("KETO 250"), agrupados por menú con un renglón en blanco entre uno y
 * otro; cinco columnas, una por plato en el orden del menú (columna 1 = lunes … 5 = viernes), con
 * las porciones de ese plato; y el total de porciones abajo a la derecha. Los Intuitivos van como
 * un menú más ("INTUITIVO 250"), sin detallar sus platos: eso sigue en su hoja.
 *
 * Suma lo pedido y el stock del período, que también se cocina. Cada plato de un menú fijo lleva
 * las mismas porciones —el sistema no sabe de cambios plato por plato—, así que las cinco columnas
 * de un renglón salen iguales; si cocina cambia alguna, la corrige en la planilla.
 *
 * Las variedades y los tamaños van en la jerarquía de productos (PRODUCT_ORDER.md): Keto 400,
 * Keto 250, Antiage, Real, Vegetariano, Intuitivos. Antes iban en el orden en que se cargó el menú.
 */

/** "Menú Anti-Age" sale "ANTI-AGE 250", como en las planillas del cliente. */
function sheetLabel(familyName: string, variantName: string): string {
  return `${familyName.replace(/^men[uú]\s+/i, '')} ${variantName}`.toUpperCase();
}

/**
 * La hoja "Conciliado", con el formato de la planilla del cliente: cuántos menús de cada uno.
 *
 * Una sola columna de cantidades. Primero los menús estándar, en el orden del menú y de mayor a
 * menor tamaño, con un renglón vacío entre variedades; el stock del período suma (se cocina). Después
 * los Intuitivos, uno por pedido, con el nombre de quien lo pidió y el tamaño. Al pie, el total.
 */
export function conciliadoRows(report: ProductionReport): (number | string)[][] {
  const families = new Map<string, Map<string, number>>();
  const add = (familyName: string, variantName: string, units: number) => {
    const variants = families.get(familyName) ?? new Map<string, number>();
    families.set(familyName, variants);
    variants.set(variantName, (variants.get(variantName) ?? 0) + units);
  };
  for (const line of report.base) add(line.familyName, line.variantName, line.quantityUnits);
  for (const line of report.stock ?? []) add(line.familyName, line.variantName, line.quantityUnits);

  const rows: (number | string)[][] = [];
  let total = 0;
  for (const familyName of [...families.keys()].sort((left, right) =>
    compareFamilies(left, right),
  )) {
    const variants = families.get(familyName) ?? new Map<string, number>();
    for (const variantName of [...variants.keys()].sort(compareSizes)) {
      const units = variants.get(variantName) ?? 0;
      rows.push([sheetLabel(familyName, variantName), units]);
      total += units;
    }
    rows.push(['', '']);
  }
  for (const item of report.custom) {
    rows.push([`${item.customerDisplayName} ${item.variantName}`, item.quantityUnits]);
    total += item.quantityUnits;
  }
  if (report.custom.length > 0) rows.push(['', '']);
  rows.push(['TOTAL', total]);
  return rows;
}

function conciliadoSheet(report: ProductionReport): WorkSheet {
  const rows = conciliadoRows(report);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 38 }, { wch: 9 }];
  // El total como fórmula, con su valor: si cocina corrige un número, el total lo sigue.
  const last = rows.length;
  const value = rows.at(-1)?.[1];
  sheet[`B${String(last)}`] = {
    f: `SUM(B1:B${String(last - 1)})`,
    t: 'n',
    v: typeof value === 'number' ? value : 0,
  };
  rows.forEach((row, rowIndex) => {
    for (let column = 0; column < 2; column += 1) {
      const address = XLSX.utils.encode_cell({ c: column, r: rowIndex });
      const cell = (sheet[address] ?? { t: 's', v: '' }) as CellObject;
      sheet[address] = cell;
      cell.s = {
        alignment: { horizontal: column === 0 ? 'left' : 'right', vertical: 'center' },
        border: BORDER,
        font: { bold: true, name: 'Arial', sz: 16 },
      };
    }
  });
  sheet['!rows'] = rows.map(() => ({ hpt: 30 }));
  return sheet;
}

export function orderSheetRows(report: ProductionReport): (number | string)[][] {
  const width = ORDER_SHEET_DAYS.length;
  // Menú → tamaño → porciones por día (plato 1 … plato 5).
  const families = new Map<string, Map<string, number[]>>();
  const portions = (familyName: string, variantName: string) => {
    const variants = families.get(familyName) ?? new Map<string, number[]>();
    families.set(familyName, variants);
    const days = variants.get(variantName) ?? Array.from({ length: width }, () => 0);
    variants.set(variantName, days);
    return days;
  };
  const addAll = (familyName: string, variantName: string, units: number) => {
    const days = portions(familyName, variantName);
    for (let day = 0; day < width; day += 1) days[day] = (days[day] ?? 0) + units;
  };
  for (const line of report.base) addAll(line.familyName, line.variantName, line.quantityUnits);
  for (const line of report.stock ?? []) {
    addAll(line.familyName, line.variantName, line.quantityUnits);
  }

  /*
   * El Intuitivo se desarma (DISH_IDENTITY_AND_DEBTORS_PLAN.md): cada plato elegido suma en el
   * renglón de su menú con el tamaño del Intuitivo, en la columna de su posición. Un Intuitivo 400
   * con el plato 3 de Keto suma una porción en KETO 400, miércoles. Los platos sin origen (pedidos
   * viejos con un nombre que estaba en dos menús) van a un renglón aparte, con el total de porciones
   * en la última columna, para resolverlos a mano.
   */
  const unknown = new Map<string, number>();
  for (const item of report.custom) {
    if (item.dishSelections.length === 0) {
      unknown.set(
        item.variantName,
        (unknown.get(item.variantName) ?? 0) + item.quantityUnits * width,
      );
      continue;
    }
    item.dishSelections.forEach((_, index) => {
      const source = item.dishSources?.[index] ?? null;
      if (source && source.slot >= 1 && source.slot <= width) {
        const days = portions(source.familyName, item.variantName);
        days[source.slot - 1] = (days[source.slot - 1] ?? 0) + item.quantityUnits;
      } else {
        unknown.set(item.variantName, (unknown.get(item.variantName) ?? 0) + item.quantityUnits);
      }
    });
  }

  const blank = () => Array.from({ length: width + 2 }, () => '');
  const rows: (number | string)[][] = [['PEDIDO', ...ORDER_SHEET_DAYS, '']];
  let total = 0;
  let first = true;
  for (const familyName of [...families.keys()].sort((left, right) =>
    compareFamilies(left, right),
  )) {
    const variants = families.get(familyName) ?? new Map<string, number[]>();
    if (!first) rows.push(blank());
    first = false;
    for (const variantName of [...variants.keys()].sort(compareSizes)) {
      const days = variants.get(variantName) ?? [];
      rows.push([
        // "Menú Anti-Age" sale "ANTI-AGE 250", como en la planilla del cliente.
        `${familyName.replace(/^men[uú]\s+/i, '')} ${variantName}`.toUpperCase(),
        ...days,
        '',
      ]);
      total += days.reduce((sum, value) => sum + value, 0);
    }
  }
  if (unknown.size > 0) {
    rows.push(blank());
    for (const [variantName, count] of unknown) {
      rows.push([
        `SIN MENÚ DE ORIGEN ${variantName}`.toUpperCase(),
        ...Array.from({ length: width }, () => ''),
        count,
      ]);
      total += count;
    }
  }
  rows.push(blank());
  rows.push(['TOTAL', ...Array.from({ length: width }, () => ''), total]);
  return rows;
}

function orderSheet(report: ProductionReport): WorkSheet {
  const rows = orderSheetRows(report);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 26 }, ...ORDER_SHEET_DAYS.map(() => ({ wch: 11 })), { wch: 10 }];
  /*
   * El total de abajo a la derecha como fórmula, con su valor ya calculado: suma las cinco columnas
   * de todos los renglones, así que si cocina corrige un número a mano, el total lo sigue.
   */
  const lastDataRow = rows.length - 2;
  // Hasta la última columna: ahí van las porciones sin menú de origen (vacía en el resto).
  const lastDay = XLSX.utils.encode_col(ORDER_SHEET_DAYS.length + 1);
  const totalCell = `${XLSX.utils.encode_col(ORDER_SHEET_DAYS.length + 1)}${String(rows.length)}`;
  const totalValue = rows.at(-1)?.at(-1);
  sheet[totalCell] = {
    f: `SUM(B2:${lastDay}${String(lastDataRow)})`,
    t: 'n',
    v: typeof totalValue === 'number' ? totalValue : 0,
  };
  styleOrderSheet(sheet, rows);
  return sheet;
}

const THIN = { style: 'thin', color: { rgb: '000000' } } as const;
const BORDER = { bottom: THIN, left: THIN, right: THIN, top: THIN };

/**
 * El formato de la planilla del cliente: encabezado gris oscuro con letra blanca, la última columna
 * del encabezado en negro, el nombre de cada menú sobre gris claro, bordes finos en toda la grilla y
 * los números alineados a la derecha.
 */
function styleOrderSheet(sheet: WorkSheet, rows: readonly (number | string)[][]): void {
  const lastColumn = ORDER_SHEET_DAYS.length + 1;
  rows.forEach((row, rowIndex) => {
    for (let columnIndex = 0; columnIndex <= lastColumn; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ c: columnIndex, r: rowIndex });
      const cell = (sheet[address] ?? { t: 's', v: '' }) as CellObject;
      sheet[address] = cell;
      const isHeader = rowIndex === 0;
      const isTotal = rowIndex === rows.length - 1;
      const isLabel = columnIndex === 0 && !isHeader && !isTotal && row[0] !== '';
      cell.s = {
        alignment: { horizontal: columnIndex === 0 ? 'left' : 'right', vertical: 'center' },
        border: BORDER,
        font: {
          bold: isHeader || isTotal,
          color: { rgb: isHeader ? 'FFFFFF' : '000000' },
          name: 'Arial',
          sz: 11,
        },
        ...(isHeader
          ? {
              fill: {
                fgColor: { rgb: columnIndex === lastColumn ? '000000' : '808080' },
                patternType: 'solid',
              },
            }
          : isLabel
            ? { fill: { fgColor: { rgb: 'F2F2F2' }, patternType: 'solid' } }
            : {}),
      };
    }
  });
}

export function buildProductionExcel(report: ProductionReport): ArrayBuffer {
  const { actuals, base, delta } = report;
  const actualByKey = new Map(
    actuals.map((actual) => [
      lineLabel(actual.familyName, actual.variantName),
      actual.quantityUnits,
    ]),
  );
  const deltaByKey = new Map(
    (delta ?? []).map((line) => [lineLabel(line.familyName, line.variantName), line.deltaUnits]),
  );

  const title = `Producción — ${report.cycle.alias} · ${report.subtitle}`;
  const workbook = XLSX.utils.book_new();
  // La primera hoja es la del cliente: es la que se abre al descargar.
  XLSX.utils.book_append_sheet(workbook, orderSheet(report), 'Pedido');

  // La segunda, el conciliado con el formato del cliente.
  XLSX.utils.book_append_sheet(workbook, conciliadoSheet(report), 'Conciliado');

  XLSX.utils.book_append_sheet(
    workbook,
    sheetWithTitle(
      title,
      base.map((line) => {
        const key = lineLabel(line.familyName, line.variantName);
        return {
          Familia: line.familyName,
          Tamaño: line.variantName,
          // Unidades y pedidos son dos números distintos: ocho unidades pueden ser ocho pedidos de
          // una o dos de cuatro, y eso cambia cuántos paquetes se arman.
          Unidades: line.quantityUnits,
          Pedidos: line.orderCount,
          'Producción real': actualByKey.get(key) ?? '',
          Delta: delta ? (deltaByKey.get(key) ?? 0) : '',
          Excepciones: line.exceptions
            .map(
              (exception) =>
                `${exception.quantityUnits} (${exception.customerDisplayName} · ${exception.orderPublicNumber}): ${exception.dietaryInstructions.join(' · ')}`,
            )
            .join(' | '),
        };
      }),
      [24, 10, 12, 10, 16, 8, 60],
      ['Unidades', 'Pedidos', 'Producción real', 'Delta'],
    ),
    'Producción base',
  );

  // Los platos de los Intuitivos, sumados: es la hoja con la que se va a comprar.
  if (report.dishTally.length > 0) {
    XLSX.utils.book_append_sheet(
      workbook,
      sheetWithTitle(
        title,
        report.dishTally.map((entry) => ({
          Plato: entry.dishName,
          Menú: entry.familyName ? shortFamily(entry.familyName) : 'Sin menú de origen',
          Porciones: entry.portions,
        })),
        [40, 18, 12],
        ['Porciones'],
      ),
      'Platos a preparar',
    );
  }

  if (report.custom.length > 0) {
    XLSX.utils.book_append_sheet(
      workbook,
      sheetWithTitle(
        title,
        report.custom.map((item) => ({
          '#': item.sequence,
          Familia: item.familyName,
          Tamaño: item.variantName,
          Unidades: item.quantityUnits,
          Cliente: item.customerDisplayName,
          Pedido: item.orderPublicNumber,
          Composición: dishesWithOrigin(item).join(' · '),
          Indicaciones: item.dietaryInstructions.join(' · '),
        })),
        [6, 16, 10, 10, 28, 14, 60, 30],
        // El `#` no se suma: es el número de renglón, y sumarlo da un número sin significado.
        ['Unidades'],
      ),
      'Intuitivos',
    );
  }

  // `type: 'array'` devuelve un ArrayBuffer, no un Uint8Array. Declararlo como Uint8Array era una
  // mentira que el compilador aceptaba y que después hacía leer `.buffer` —undefined en un
  // ArrayBuffer—, así que la respuesta salía vacía: un .xlsx de cero bytes, sin ningún error.
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

export function buildProductionWhatsAppText(report: ProductionReport): string {
  const { actuals, base, custom, cycle, delta, dishTally, totalOrders, totalUnits } = report;
  const actualByKey = new Map(
    actuals.map((actual) => [
      lineLabel(actual.familyName, actual.variantName),
      actual.quantityUnits,
    ]),
  );
  const deltaByKey = new Map(
    (delta ?? []).map((line) => [lineLabel(line.familyName, line.variantName), line.deltaUnits]),
  );

  const lines = [`*Producción — ${cycle.alias}*`, `_${report.subtitle}_`, ''];

  for (const line of base) {
    const key = lineLabel(line.familyName, line.variantName);
    const actual = actualByKey.get(key);
    const deltaUnits = deltaByKey.get(key);
    let text = `• ${line.familyName} ${line.variantName}: ${line.quantityUnits} (${line.orderCount} ${line.orderCount === 1 ? 'pedido' : 'pedidos'})`;
    if (actual !== undefined) text += ` (real: ${actual})`;
    if (deltaUnits !== undefined) text += ` (Δ ${deltaUnits >= 0 ? '+' : ''}${deltaUnits})`;
    lines.push(text);
    for (const exception of line.exceptions) {
      lines.push(
        `   ⚠ ${exception.quantityUnits} ${exception.customerDisplayName} (${exception.orderPublicNumber}): ${exception.dietaryInstructions.join(', ')}`,
      );
    }
  }

  if (custom.length > 0) {
    lines.push('', '*Intuitivos*');
    for (const item of custom) {
      lines.push(
        `• #${item.sequence} ${item.familyName} ${item.variantName} × ${item.quantityUnits} — ${item.customerDisplayName} (${item.orderPublicNumber}): ${dishesWithOrigin(item).join(', ')}`,
      );
    }
  }

  // Los platos van después de los Intuitivos y antes del total: es lo que se lee para ir a comprar,
  // y el detalle de arriba es lo que se consulta después, ya cocinando.
  if (dishTally.length > 0) {
    lines.push('', '*Platos a preparar*');
    for (const entry of dishTally) {
      lines.push(`• ${tallyLabel(entry)}: ${entry.portions}`);
    }
  }

  lines.push(
    '',
    `*Total: ${totalUnits} unidades en ${totalOrders} ${totalOrders === 1 ? 'pedido' : 'pedidos'}*`,
  );
  return lines.join('\n');
}

export function buildProductionPrintHtml(report: ProductionReport): string {
  const { actuals, base, custom, cycle, delta, dishTally, totalOrders, totalUnits } = report;
  const actualByKey = new Map(
    actuals.map((actual) => [
      lineLabel(actual.familyName, actual.variantName),
      actual.quantityUnits,
    ]),
  );
  const deltaByKey = new Map(
    (delta ?? []).map((line) => [lineLabel(line.familyName, line.variantName), line.deltaUnits]),
  );
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
    );

  const baseRows = base
    .map((line) => {
      const key = lineLabel(line.familyName, line.variantName);
      const actual = actualByKey.get(key);
      const deltaUnits = deltaByKey.get(key);
      const exceptions = line.exceptions
        .map(
          (exception) =>
            `<div class="exception">${exception.quantityUnits} — ${escape(exception.customerDisplayName)} (${escape(exception.orderPublicNumber)}): ${escape(exception.dietaryInstructions.join(', '))}</div>`,
        )
        .join('');
      return `<tr>
        <td>${escape(line.familyName)}</td>
        <td>${escape(line.variantName)}</td>
        <td>${line.quantityUnits}</td>
        <td>${line.orderCount}</td>
        <td>${actual ?? '—'}</td>
        <td>${deltaUnits === undefined ? '—' : (deltaUnits >= 0 ? '+' : '') + deltaUnits}</td>
        <td>${exceptions}</td>
      </tr>`;
    })
    .join('');

  const customRows = custom
    .map(
      (item) => `<tr>
        <td>#${item.sequence}</td>
        <td>${escape(item.familyName)} ${escape(item.variantName)}</td>
        <td>${item.quantityUnits}</td>
        <td>${escape(item.customerDisplayName)} (${escape(item.orderPublicNumber)})</td>
        <td>${escape(dishesWithOrigin(item).join(', '))}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Producción — ${escape(cycle.alias)}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .subtitle { color: #555; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; font-size: 13px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; }
  .exception { color: #b00020; font-size: 12px; }
  .total { text-align: right; font-weight: bold; font-size: 15px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>Producción — ${escape(cycle.alias)}</h1>
  <p class="subtitle">${escape(report.subtitle)}</p>
  <table>
    <thead><tr><th>Familia</th><th>Tamaño</th><th>Planificado</th><th>Pedidos</th><th>Real</th><th>Delta</th><th>Excepciones</th></tr></thead>
    <tbody>${baseRows}</tbody>
  </table>
  ${
    custom.length > 0
      ? `<h2>Intuitivos</h2><table>
    <thead><tr><th>#</th><th>Variedad</th><th>Unidades</th><th>Cliente</th><th>Composición</th></tr></thead>
    <tbody>${customRows}</tbody>
  </table>`
      : ''
  }
  ${
    dishTally.length > 0
      ? `<h2>Platos a preparar</h2><table>
    <thead><tr><th>Plato</th><th>Porciones</th></tr></thead>
    <tbody>${dishTally
      .map((entry) => `<tr><td>${escape(tallyLabel(entry))}</td><td>${entry.portions}</td></tr>`)
      .join('')}</tbody>
  </table>`
      : ''
  }
  <p class="total">Total: ${totalUnits} unidades en ${totalOrders} ${totalOrders === 1 ? 'pedido' : 'pedidos'}</p>
</body>
</html>`;
}
