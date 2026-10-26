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
  type PeriodReportDay,
  type PeriodReportRow,
} from '@verdeo/orders';

/*
 * La norma de colores de la planilla original, que ahora pone el sistema:
 * - encabezado gris, barras del día negras;
 * - nombre de un cliente NUEVO en la hoja de pedidos: naranja si el pedido entró por mail, marrón
 *   si entró por WhatsApp; el resto, sin color (2026-10-25);
 * - venta de una transferencia en verde si está cobrada, en rojo si no (el efectivo, sin color);
 * - horario en amarillo: el cliente pidió una franja;
 * - un Intuitivo, en negrita cursiva.
 */
const COLOR = {
  bar: '000000',
  header: '808080',
  newEmail: 'FFC000',
  newWhatsapp: 'C65911',
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
const BOLD: Style = { font: { bold: true } };

function text(value: string, style: Style = BASE): CellObject {
  return { s: style, t: 's', v: value };
}

function money(minor: number, style: Style = BASE): CellObject {
  return { s: style, t: 'n', v: minor / 100, z: MONEY };
}

function count(value: number, style: Style = BASE): CellObject {
  return { s: style, t: 'n', v: value };
}

/** El color de un cliente nuevo según por dónde entró el pedido; null si va sin color. */
function newColor(source: string): string | null {
  if (source === 'email') return COLOR.newEmail;
  if (source === 'whatsapp') return COLOR.newWhatsapp;
  return null;
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

type Column = {
  header: string;
  /** Sin la negrita cursiva del Intuitivo: el nombre va sin estilos. */
  plain?: boolean;
  value: (row: PeriodReportRow) => CellObject;
  width: number;
};

interface Layout {
  /** Las columnas de la hoja, en orden: encabezado, ancho y cómo se llena cada renglón. */
  columns: Column[];
  /** Los renglones de un día: uno por vianda en "Pedidos", uno por bulto en "Reparto". */
  rowsOf: (day: PeriodReportDay) => PeriodReportRow[];
  /** El total de venta del día: en "Reparto", sólo el efectivo, que es lo que se cobra. */
  saleOf: (day: PeriodReportDay) => number;
  /** Columna (base 0) de la venta, para el total del día. */
  saleColumn: number;
  /** Columna (base 0) del tamaño, para contar las viandas del día. */
  sizeColumn: number;
  /** El resumen de la derecha: uno general, o uno por reparto desde la fila de su día. */
  summary: 'general' | 'per-day';
}

const muted = (row: PeriodReportRow, style: Style = BASE): Style =>
  row.first ? style : { ...style, font: { color: { rgb: COLOR.repeated } } };

const timeSlotColumn: Column = {
  header: 'Horario',
  value: (row) =>
    text(
      row.order.timeSlot ?? '',
      row.order.timeSlot && row.first ? { ...BASE, ...fill(COLOR.timeSlot) } : muted(row),
    ),
  width: 14,
};

const routeTimeColumn: Column = {
  header: 'Tiempo de ruta',
  value: (row) => text(routeMinutesLabel(row.order.route?.minutes ?? null), muted(row)),
  width: 11,
};

const zoneColumn: Column = {
  header: 'Zona',
  value: (row) => text(row.order.zone ?? '', muted(row)),
  width: 16,
};

const sizeColumn: Column = {
  header: 'Pedido',
  value: (row) => {
    const size = Number(row.size);
    return Number.isFinite(size) ? count(size) : text(row.size);
  },
  width: 8,
};

function addressOf(row: PeriodReportRow, separator: string): string {
  return [row.order.addressLine1, row.order.addressLine2 ?? ''].filter(Boolean).join(separator);
}

function trailing(sale: (row: PeriodReportRow) => CellObject): Column[] {
  return [
    { header: 'Venta', value: (row) => (row.first ? sale(row) : text('')), width: 12 },
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
  ];
}

/** "Pedidos": dirección, nombre, tamaño, los cinco días, venta, pago y celular. */
function ordersLayout(): Layout {
  const columns: Column[] = [
    { header: 'Dirección', value: (row) => text(addressOf(row, '\n'), muted(row)), width: 42 },
    {
      header: 'Nombre',
      plain: true,
      value: (row) => {
        // Sólo el cliente nuevo lleva color, según por dónde entró; el resto, sin estilos.
        const color = row.order.isNew ? newColor(row.order.source) : null;
        return text(row.order.customerName, color ? fill(color) : {});
      },
      width: 24,
    },
    sizeColumn,
    ...DAYS.map((day, index) => ({
      header: day,
      value: (row: PeriodReportRow) => text(row.meals[index] ?? ''),
      width: 16,
    })),
    ...trailing((row) =>
      money(
        row.order.totalMinor,
        isTransfer(row.order.paymentExpectation)
          ? { ...BASE, ...fill(row.order.paid ? COLOR.paid : COLOR.unpaid) }
          : BASE,
      ),
    ),
  ];
  return {
    columns,
    rowsOf: (day) => day.rows,
    saleColumn: 8,
    saleOf: (day) => day.saleMinor,
    sizeColumn: 2,
    summary: 'general',
  };
}

/**
 * "Reparto": tiempo de ruta, horario, zona, dirección (en una línea), nombre, tamaño, variedad,
 * venta, pago y celular. Un renglón por bulto; quien reparte sólo cobra el efectivo, así que la
 * transferencia va en $0 y el total del día es el del efectivo.
 */
function deliveryLayout(report: PeriodReport): Layout {
  const longest = Math.max(
    0,
    ...report.days.flatMap((day) => day.deliveryRows.map((row) => addressOf(row, ' · ').length)),
  );
  const columns: Column[] = [
    routeTimeColumn,
    timeSlotColumn,
    zoneColumn,
    {
      header: 'Dirección',
      value: (row) =>
        text(addressOf(row, ' · '), { ...muted(row), alignment: { vertical: 'center' } }),
      width: Math.min(90, Math.max(42, longest + 2)),
    },
    {
      header: 'Nombre',
      plain: true,
      value: (row) => text(row.order.customerName, {}),
      width: 24,
    },
    sizeColumn,
    { header: 'Variedad', value: (row) => text(row.variety), width: 22 },
    ...trailing((row) =>
      money(isTransfer(row.order.paymentExpectation) ? 0 : row.order.totalMinor),
    ),
  ];
  return {
    columns,
    rowsOf: (day) => day.deliveryRows,
    saleColumn: 7,
    saleOf: (day) => day.cashMinor,
    sizeColumn: 5,
    summary: 'per-day',
  };
}

function buildSheet(title: string, report: PeriodReport, layout: Layout): WorkSheet {
  const sheet: WorkSheet = {};
  const width = layout.columns.length;
  const summaryColumn = width + 1;
  let lastRow = 0;
  const put = (row: number, column: number, cell: CellObject) => {
    /*
     * Un estilo propio por celda: la librería, al escribir, le agrega el formato de número al
     * objeto del estilo, y compartido llevaba el "$" de la venta al tamaño y a las cantidades.
     */
    sheet[XLSX.utils.encode_cell({ c: column, r: row })] = {
      ...cell,
      s: structuredClone((cell.s ?? {}) as Style),
    };
    lastRow = Math.max(lastRow, row);
  };
  const bar = (row: number, label: string) => {
    for (let column = 0; column < width; column += 1) put(row, column, text('', BAR));
    put(row, 0, text(label, BAR));
  };
  // Una tabla de viandas por producto con su total, a la derecha, desde la fila `top`.
  const summaryTable = (top: number, lines: { label: string; units: number }[]) => {
    put(top, summaryColumn, text('Producto', HEADER));
    put(top, summaryColumn + 1, text('Viandas', HEADER));
    lines.forEach((line, index) => {
      put(top + 1 + index, summaryColumn, text(line.label));
      put(top + 1 + index, summaryColumn + 1, count(line.units));
    });
    const totalRow = top + 1 + lines.length;
    const unitsColumn = XLSX.utils.encode_col(summaryColumn + 1);
    put(totalRow, summaryColumn, text('TOTAL', BOLD));
    put(totalRow, summaryColumn + 1, {
      f: `SUM(${unitsColumn}${String(top + 2)}:${unitsColumn}${String(totalRow)})`,
      s: BOLD,
      t: 'n',
      v: lines.reduce((sum, line) => sum + line.units, 0),
    });
    return totalRow;
  };

  put(0, 0, text(title, { font: { bold: true, sz: 14 } }));
  layout.columns.forEach((column, index) => put(1, index, text(column.header, HEADER)));

  let row = 2;
  // Dónde termina el resumen del reparto anterior, para que el siguiente no lo pise.
  let summaryEnd = 0;
  for (const day of report.days) {
    const dayRow = row;
    bar(row, dayTitle(day.date));
    row += 1;
    // La barra de carga: el reparto del día y su horario (la hora de carga se completa a mano).
    bar(row, `Carga${day.runs.length > 0 ? ` · ${day.runs.join(' / ')}` : ':'}`);
    row += 1;
    const firstRow = row;
    const lines = layout.rowsOf(day);
    for (const line of lines) {
      layout.columns.forEach((column, index) => {
        const cell = column.value(line);
        // Un Intuitivo va en negrita cursiva, como en la planilla.
        if (line.composable && !column.plain) {
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
    put(row, layout.sizeColumn - 1, text('Total del día', BOLD));
    put(row, layout.sizeColumn, {
      f: `COUNT(${range(layout.sizeColumn)})`,
      s: BOLD,
      t: 'n',
      v: lines.length,
    });
    put(row, layout.saleColumn, {
      f: `SUM(${range(layout.saleColumn)})`,
      s: BOLD,
      t: 'n',
      v: layout.saleOf(day) / 100,
      z: MONEY,
    });
    if (layout.summary === 'per-day') {
      summaryEnd = summaryTable(Math.max(dayRow, summaryEnd + 1), day.summary) + 1;
    }
    row += 2;
  }

  // "Pedidos": el resumen general a la derecha, como en la planilla.
  if (layout.summary === 'general') summaryTable(1, report.summary);

  sheet['!ref'] = XLSX.utils.encode_range({
    e: { c: summaryColumn + 1, r: lastRow },
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
    buildSheet(`Reparto — ${alias}`, report, deliveryLayout(report)),
    'Reparto',
  );
  return XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}
