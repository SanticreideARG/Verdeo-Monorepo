/*
 * El análisis contable de Estadísticas en Excel (STATS_REDESIGN_PLAN.md): una fila por período y
 * ciudad, con el total abajo, y el detalle por medio de pago en otra hoja. Mismas hojas y mismo
 * formato de pesos que el informe del período.
 */
import xlsxStyle from 'xlsx-js-style';
import type { StatsPeriods } from '@verdeo/contracts';

import { money, sheet, type Cell } from './cycle-report.js';

const XLSX = xlsxStyle;

export function buildStatsPeriodsExcel(periods: StatsPeriods, title: string): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const { rows } = periods;
  const sum = (pick: (row: (typeof rows)[number]) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  const withAdjustments = rows.some((row) => row.adjustmentMinor !== 0);

  const header = [
    'Período',
    'Ciudad',
    'Pedidos',
    'Bruto',
    'Descuentos',
    'Recargos',
    ...(withAdjustments ? ['Ajustes'] : []),
    'Neto vendido',
    'Cobrado',
    'Por cobrar',
    'Desde stock',
    'Cancelados (no suman)',
    'Cancelados a stock',
    'Clientes',
    'Nuevos',
  ];
  const line = (row: (typeof rows)[number] | null): Cell[] => {
    const pick = (get: (item: (typeof rows)[number]) => number) => (row ? get(row) : sum(get));
    return [
      row ? row.cycleAlias : 'TOTAL',
      row ? row.operatingSiteName : '',
      pick((item) => item.orderCount),
      money(pick((item) => item.grossMinor)),
      money(-pick((item) => item.discountMinor)),
      money(pick((item) => item.surchargeMinor)),
      ...(withAdjustments ? [money(pick((item) => item.adjustmentMinor))] : []),
      money(pick((item) => item.netMinor)),
      money(pick((item) => item.paidMinor)),
      money(pick((item) => item.pendingMinor)),
      money(pick((item) => item.fromStockMinor)),
      money(pick((item) => item.cancelledMinor)),
      money(pick((item) => item.cancelledToStockMinor)),
      // Los clientes no se suman entre filas (uno puede pedir en dos períodos): el total queda vacío.
      row ? row.customerCount : '',
      pick((item) => item.newCustomerCount),
    ];
  };
  XLSX.utils.book_append_sheet(
    workbook,
    sheet(
      title,
      header,
      [...rows.map((row) => line(row)), line(null)],
      header.map((_, index) => (index < 2 ? 18 : 14)),
    ),
    'Por período y ciudad',
  );

  const methodRows = rows.flatMap((row) =>
    row.methods.map((method): Cell[] => [
      row.cycleAlias,
      row.operatingSiteName,
      method.method,
      method.isCash ? 'Sí' : 'No',
      money(method.totalMinor),
      money(method.paidMinor),
      money(method.totalMinor - method.paidMinor),
    ]),
  );
  XLSX.utils.book_append_sheet(
    workbook,
    sheet(
      'Por medio de pago',
      ['Período', 'Ciudad', 'Medio', 'Efectivo', 'Vendido', 'Cobrado', 'Por cobrar'],
      methodRows,
      [18, 18, 18, 10, 14, 14, 14],
    ),
    'Por medio de pago',
  );

  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}
