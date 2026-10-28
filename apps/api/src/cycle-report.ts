/*
 * El informe de un período, en Excel (FIXES_2026_10_22_PLAN.md: "informe casi contable al cerrar").
 * `xlsx-js-style` por defecto porque es CommonJS, igual que la planilla de cocina.
 */
import xlsxStyle, { type CellObject, type WorkSheet } from 'xlsx-js-style';

const XLSX = xlsxStyle;

export interface CycleReport {
  cancelled: {
    /** Cancelados que ya se habían cocinado y pasaron al stock (2026-10-28). */
    cookedCount: number;
    cookedTotalMinor: number;
    count: number;
    orders: {
      customerName: string;
      deliveryDate: string;
      items: string;
      sentToKitchen: boolean;
      toStock: boolean;
      totalMinor: number;
    }[];
    totalMinor: number;
  };
  cycle: { alias: string; id: string; status: string };
  generatedAt: string;
  methods: {
    count: number;
    isCash: boolean;
    method: string;
    paidMinor: number;
    pendingMinor: number;
    totalMinor: number;
  }[];
  receivables: {
    customer: { displayName: string; phone: string | null; whatsapp: string | null };
    orders: {
      deliveryDate: string;
      items: string;
      paymentExpectation: string;
      publicNumber: string;
      totalMinor: number;
    }[];
    totalMinor: number;
  }[];
  stock: {
    carriedIn: number;
    carriedOut: number;
    familyName: string;
    planned: number;
    sold: number;
    variantName: string;
    writtenOff: number;
  }[];
  totals: {
    cashMinor: number;
    orderCount: number;
    paidMinor: number;
    pendingMinor: number;
    totalMinor: number;
    transferMinor: number;
  };
}

const MONEY = '"$" #,##0.00';
const THIN = { style: 'thin', color: { rgb: '9E9E9E' } } as const;
const BORDER = { bottom: THIN, left: THIN, right: THIN, top: THIN };

type Cell = number | string | { money: number };

const money = (minor: number): Cell => ({ money: minor / 100 });

/**
 * Una hoja con un título, un encabezado gris y bordes finos. Las celdas `{ money }` salen como número
 * con formato de pesos: se pueden sumar en Excel, a diferencia de un texto "$ 1.000".
 */
function sheet(
  title: string,
  header: readonly string[],
  body: readonly (readonly Cell[])[],
  widths: readonly number[],
): WorkSheet {
  const values = [
    [title],
    [],
    [...header],
    ...body.map((row) => row.map((cell) => (typeof cell === 'object' ? cell.money : cell))),
  ];
  const ws = XLSX.utils.aoa_to_sheet(values);
  ws['!cols'] = widths.map((wch) => ({ wch }));
  const titleCell = ws.A1 as CellObject | undefined;
  if (titleCell) titleCell.s = { font: { bold: true, name: 'Arial', sz: 14 } };
  header.forEach((_, column) => {
    const cell = ws[XLSX.utils.encode_cell({ c: column, r: 2 })] as CellObject | undefined;
    if (cell)
      cell.s = {
        border: BORDER,
        fill: { fgColor: { rgb: '808080' }, patternType: 'solid' },
        font: { bold: true, color: { rgb: 'FFFFFF' }, name: 'Arial', sz: 11 },
      };
  });
  body.forEach((row, rowIndex) => {
    const isTotal = row[0] === 'TOTAL';
    row.forEach((value, column) => {
      const address = XLSX.utils.encode_cell({ c: column, r: rowIndex + 3 });
      const cell = (ws[address] ?? { t: 's', v: '' }) as CellObject;
      ws[address] = cell;
      cell.s = {
        border: BORDER,
        font: { bold: isTotal, name: 'Arial', sz: 11 },
        ...(typeof value === 'object' ? { numFmt: MONEY } : {}),
      };
      if (typeof value === 'object') cell.z = MONEY;
    });
  });
  return ws;
}

export function buildCycleReportExcel(report: CycleReport): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const title = `Informe del período ${report.cycle.alias}`;
  const { totals } = report;

  XLSX.utils.book_append_sheet(
    workbook,
    sheet(
      title,
      ['Concepto', 'Valor'],
      [
        ['Estado', report.cycle.status === 'CLOSED' ? 'Cerrado' : 'Abierto'],
        ['Pedidos (sin cancelados ni stock)', totals.orderCount],
        ['Total vendido', money(totals.totalMinor)],
        ['Cobrado', money(totals.paidMinor)],
        ['Pendiente de cobro', money(totals.pendingMinor)],
        ['En efectivo', money(totals.cashMinor)],
        ['En transferencia u otros', money(totals.transferMinor)],
        ['Pedidos cancelados (no suman)', report.cancelled.count],
        ['Monto cancelado (no suma)', money(report.cancelled.totalMinor)],
        // Cancelado después de cocinarse: no es venta, pero la comida existe y está en el stock.
        ['Cancelados ya cocinados → stock', report.cancelled.cookedCount],
        ['Monto de esos (no suma)', money(report.cancelled.cookedTotalMinor)],
        ['Clientes que deben', report.receivables.length],
        ['Generado', new Date(report.generatedAt).toLocaleString('es-AR')],
      ],
      [36, 22],
    ),
    'Resumen',
  );

  XLSX.utils.book_append_sheet(
    workbook,
    sheet(
      title,
      ['Medio de pago', 'Tipo', 'Pedidos', 'Total', 'Cobrado', 'Pendiente'],
      [
        ...report.methods.map((row): Cell[] => [
          row.method,
          row.isCash ? 'Efectivo' : 'Transferencia / otro',
          row.count,
          money(row.totalMinor),
          money(row.paidMinor),
          money(row.pendingMinor),
        ]),
        [
          'TOTAL',
          '',
          totals.orderCount,
          money(totals.totalMinor),
          money(totals.paidMinor),
          money(totals.pendingMinor),
        ],
      ],
      [24, 20, 10, 16, 16, 16],
    ),
    'Por medio de pago',
  );

  /*
   * Los cancelados uno por uno (2026-10-28): si habían salido en la planilla de cocina y si sus
   * viandas pasaron al stock. Uno que salió en la planilla y no pasó al stock es comida cocinada
   * que no figura en ningún lado: es lo que hay que revisar.
   */
  XLSX.utils.book_append_sheet(
    workbook,
    sheet(
      title,
      [
        'Cliente',
        'Entrega',
        'Qué llevaba',
        'Monto (no suma)',
        'Salió en la planilla',
        'Pasó a stock',
      ],
      report.cancelled.orders.map((row): Cell[] => [
        row.customerName,
        row.deliveryDate,
        row.items,
        money(row.totalMinor),
        row.sentToKitchen ? 'Sí' : 'No',
        row.toStock ? 'Sí' : row.sentToKitchen ? 'No — revisar' : 'No',
      ]),
      [28, 12, 40, 16, 20, 16],
    ),
    'Cancelados',
  );

  const debtRows: Cell[][] = report.receivables.flatMap((entry) =>
    entry.orders.map((order): Cell[] => [
      entry.customer.displayName,
      entry.customer.whatsapp ?? entry.customer.phone ?? '',
      order.deliveryDate,
      order.items,
      order.paymentExpectation,
      money(order.totalMinor),
    ]),
  );
  XLSX.utils.book_append_sheet(
    workbook,
    sheet(
      title,
      ['Cliente', 'Teléfono', 'Entrega', 'Qué llevó', 'Medio', 'Monto'],
      [
        ...debtRows,
        ['TOTAL', '', '', '', '', money(report.receivables.reduce((t, e) => t + e.totalMinor, 0))],
      ],
      [28, 18, 12, 44, 16, 14],
    ),
    'Por cobrar',
  );

  XLSX.utils.book_append_sheet(
    workbook,
    sheet(
      title,
      [
        'Menú',
        'Tamaño',
        'Stock de la semana',
        'Sobrante recibido',
        'Vendido del stock',
        'Pasó al siguiente',
        'Baja',
      ],
      report.stock.map((row): Cell[] => [
        row.familyName,
        row.variantName,
        row.planned,
        row.carriedIn,
        row.sold,
        row.carriedOut,
        row.writtenOff,
      ]),
      [24, 10, 18, 18, 18, 18, 10],
    ),
    'Stock',
  );

  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}
