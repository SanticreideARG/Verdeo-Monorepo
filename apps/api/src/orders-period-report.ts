/*
 * El informe de pedidos del período, en columnas largas (ORDERS_PERIOD_REPORT_PLAN.md): la planilla
 * que se armaba a mano, con sus colores, armada por el sistema. `xlsx-js-style` por los estilos,
 * como la hoja "Pedido" de cocina.
 */
import xlsxStyle, { type CellObject, type WorkSheet } from 'xlsx-js-style';

// El paquete es CommonJS: en Node, sus funciones llegan por el export por defecto, no por nombre.
const XLSX = xlsxStyle;

import {
  isTransfer,
  routeMinutesLabel,
  type PeriodReport,
  type PeriodReportRow,
} from '@verdeo/orders';

/*
 * La norma de colores de la planilla original, que ahora pone el sistema:
 * - encabezado gris, barras del día negras;
 * - nombre de un cliente NUEVO: rosado si el pedido entró por mail, más oscuro si entró por
 *   WhatsApp (y anaranjado claro si entró por otro lado);
 * - venta de una transferencia en verde si está cobrada, en rojo si no (el efectivo, sin color);
 * - horario en amarillo: el cliente pidió una franja;
 * - un Intuitivo, en negrita cursiva.
 */
const COLOR = {
  bar: '000000',
  header: '808080',
  newEmail: 'F8CBAD',
  newOther: 'F4B183',
  newWhatsapp: 'E26B0A',
  paid: '92D050',
  repeated: '808080',
  timeSlot: 'FFFF00',
  unpaid: 'FF0000',
  white: 'FFFFFF',
} as const;

const DAYS = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES'] as const;
const MONEY = '"$" #,##0';

/** El estilo de una celda; la librería lo tipa como `any`. */
interface Style {
  alignment?: { vertical?: 'center'; wrapText?: boolean };
  fill?: { fgColor: { rgb: string }; patternType: 'solid' };
  font?: { bold?: boolean; color?: { rgb: string }; italic?: boolean; sz?: number };
}

const fill = (rgb: string): Style => ({ fill: { fgColor: { rgb }, patternType: 'solid' } });
const BASE: Style = { alignment: { vertical: 'center', wrapText: true } };
const HEADER: Style = {
  ...fill(COLOR.header),
  alignment: { vertical: 'center', wrapText: true },
  font: { bold: true, color: { rgb: COLOR.white } },
};
const BAR: Style = { ...fill(COLOR.bar), font: { bold: true, color: { rgb: COLOR.white } } };

function text(value: string, style: Style = BASE): CellObject {
  return { s: style, t: 's', v: value };
}

function money(minor: number, style: Style = BASE): CellObject {
  return { s: style, t: 'n', v: minor / 100, z: MONEY };
}

/** El color de un cliente nuevo según por dónde entró el pedido. */
function newColor(source: string): string {
  if (source === 'email') return COLOR.newEmail;
  if (source === 'whatsapp') return COLOR.newWhatsapp;
  return COLOR.newOther;
}

/** "2026-10-26" → "LUNES 26 de octubre", como la barra del día de la planilla. */
export function dayTitle(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const weekday = date
    .toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'long' })
    .toLocaleUpperCase('es-AR');
  const rest = date.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  return `${weekday} ${rest}`;
}

function notesOf(row: PeriodReportRow): string {
  return [...row.order.dietaryInstructions, row.order.notes ?? '']
    .map((note) => note.trim())
    .filter(Boolean)
    .join(' · ');
}

interface Layout {
  /** Las columnas de la hoja, en orden: encabezado, ancho y cómo se llena cada renglón. */
  columns: { header: string; value: (row: PeriodReportRow) => CellObject; width: number }[];
  /** Columna (base 0) de la venta, para el total del día. */
  saleColumn: number;
  /** Columna (base 0) del tamaño, para contar las viandas del día. */
  sizeColumn: number;
}

/** Lo común a las dos hojas: horario, tiempo de ruta, zona, dirección, nombre y tamaño. */
function leading(): Layout['columns'] {
  const muted = (row: PeriodReportRow, style: Style = BASE): Style =>
    row.first ? style : { ...style, font: { color: { rgb: COLOR.repeated } } };
  return [
    {
      header: 'Horario',
      value: (row) =>
        text(
          row.order.timeSlot ?? '',
          row.order.timeSlot && row.first ? { ...BASE, ...fill(COLOR.timeSlot) } : muted(row),
        ),
      width: 14,
    },
    {
      header: 'Tiempo de ruta',
      value: (row) => text(routeMinutesLabel(row.order.route?.minutes ?? null), muted(row)),
      width: 11,
    },
    { header: 'Zona', value: (row) => text(row.order.zone ?? '', muted(row)), width: 16 },
    {
      header: 'Dirección',
      value: (row) =>
        text(
          [row.order.addressLine1, row.order.addressLine2 ?? ''].filter(Boolean).join('\n'),
          muted(row),
        ),
      width: 42,
    },
    {
      header: 'Nombre',
      value: (row) =>
        text(
          row.order.customerName,
          row.order.isNew ? { ...muted(row), ...fill(newColor(row.order.source)) } : muted(row),
        ),
      width: 24,
    },
    {
      header: 'Pedido',
      value: (row) => {
        const size = Number(row.size);
        return Number.isFinite(size) ? { s: BASE, t: 'n', v: size } : text(row.size);
      },
      width: 8,
    },
  ];
}

/** Lo que va sólo en el primer renglón de cada pedido. */
function trailing(): Layout['columns'] {
  return [
    {
      header: 'Venta',
      value: (row) =>
        row.first
          ? money(
              row.order.totalMinor,
              isTransfer(row.order.paymentExpectation)
                ? { ...BASE, ...fill(row.order.paid ? COLOR.paid : COLOR.unpaid) }
                : BASE,
            )
          : text(''),
      width: 12,
    },
    {
      header: 'Pago',
      value: (row) => text(row.first ? row.order.paymentExpectation : ''),
      width: 14,
    },
    {
      header: 'Celular',
      value: (row) => text(row.first ? (row.order.phone ?? '') : ''),
      width: 15,
    },
    { header: 'Notas', value: (row) => text(row.first ? notesOf(row) : ''), width: 28 },
  ];
}

function ordersLayout(): Layout {
  const columns = [
    ...leading(),
    ...DAYS.map((day, index) => ({
      header: day,
      value: (row: PeriodReportRow) => text(row.meals[index] ?? ''),
      width: 16,
    })),
    ...trailing(),
  ];
  return { columns, saleColumn: 11, sizeColumn: 5 };
}

function deliveryLayout(): Layout {
  const columns = [
    ...leading(),
    {
      header: 'Variedad',
      value: (row: PeriodReportRow) => text(row.variety),
      width: 22,
    },
    ...trailing(),
  ];
  return { columns, saleColumn: 7, sizeColumn: 5 };
}

function buildSheet(title: string, report: PeriodReport, layout: Layout): WorkSheet {
  const sheet: WorkSheet = {};
  const width = layout.columns.length;
  const put = (row: number, column: number, cell: CellObject) => {
    sheet[XLSX.utils.encode_cell({ c: column, r: row })] = cell;
  };
  const bar = (row: number, label: string) => {
    for (let column = 0; column < width; column += 1) put(row, column, text('', BAR));
    put(row, 0, text(label, BAR));
  };

  put(0, 0, text(title, { font: { bold: true, sz: 14 } }));
  layout.columns.forEach((column, index) => put(1, index, text(column.header, HEADER)));

  let row = 2;
  for (const day of report.days) {
    bar(row, dayTitle(day.date));
    row += 1;
    // La barra de carga: el reparto del día y su horario (la hora de carga se completa a mano).
    bar(row, `Carga${day.runs.length > 0 ? ` · ${day.runs.join(' / ')}` : ':'}`);
    row += 1;
    const firstRow = row;
    for (const line of day.rows) {
      layout.columns.forEach((column, index) => {
        const cell = column.value(line);
        // Un Intuitivo va en negrita cursiva, como en la planilla.
        if (line.composable) {
          const style = (cell.s ?? {}) as Style;
          cell.s = { ...style, font: { ...style.font, bold: true, italic: true } };
        }
        put(row, index, cell);
      });
      row += 1;
    }
    // Total del día: viandas y venta, con fórmula y el valor ya calculado.
    const range = (column: number) =>
      `${XLSX.utils.encode_col(column)}${String(firstRow + 1)}:${XLSX.utils.encode_col(column)}${String(row)}`;
    const bold: Style = { font: { bold: true } };
    put(row, layout.sizeColumn - 1, text('Total del día', bold));
    put(row, layout.sizeColumn, {
      f: `COUNT(${range(layout.sizeColumn)})`,
      s: bold,
      t: 'n',
      v: day.units,
    });
    put(row, layout.saleColumn, {
      f: `SUM(${range(layout.saleColumn)})`,
      s: bold,
      t: 'n',
      v: day.saleMinor / 100,
      z: MONEY,
    });
    row += 2;
  }

  // El resumen a la derecha, como en la planilla: viandas por producto y el total.
  const summaryColumn = width + 1;
  put(1, summaryColumn, text('Producto', HEADER));
  put(1, summaryColumn + 1, text('Viandas', HEADER));
  report.summary.forEach((line, index) => {
    put(2 + index, summaryColumn, text(line.label));
    put(2 + index, summaryColumn + 1, { s: BASE, t: 'n', v: line.units });
  });
  const totalRow = 2 + report.summary.length;
  const unitsColumn = XLSX.utils.encode_col(summaryColumn + 1);
  put(totalRow, summaryColumn, text('TOTAL', { font: { bold: true } }));
  put(totalRow, summaryColumn + 1, {
    f: `SUM(${unitsColumn}3:${unitsColumn}${String(totalRow)})`,
    s: { font: { bold: true } },
    t: 'n',
    v: report.totalUnits,
  });

  sheet['!ref'] = XLSX.utils.encode_range({
    e: { c: summaryColumn + 1, r: Math.max(row, totalRow) },
    s: { c: 0, r: 0 },
  });
  sheet['!cols'] = [
    ...layout.columns.map((column) => ({ wch: column.width })),
    { wch: 3 },
    { wch: 26 },
    { wch: 9 },
  ];
  // Listo para imprimir: márgenes chicos (la orientación apaisada se elige al imprimir).
  sheet['!margins'] = { bottom: 0.4, footer: 0.2, header: 0.2, left: 0.3, right: 0.3, top: 0.4 };
  return sheet;
}

/** El libro: "Pedidos" (cinco columnas de días) y "Reparto" (una columna de variedad). */
export function buildPeriodReportExcel(
  report: PeriodReport,
  options: { cycleAlias: string | null },
): ArrayBuffer {
  const alias = options.cycleAlias ?? 'período';
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    buildSheet(`Pedidos — ${alias}`, report, ordersLayout()),
    'Pedidos',
  );
  XLSX.utils.book_append_sheet(
    book,
    buildSheet(`Reparto — ${alias}`, report, deliveryLayout()),
    'Reparto',
  );
  return XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}
