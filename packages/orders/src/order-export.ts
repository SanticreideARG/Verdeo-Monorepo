export interface OrderExportRow {
  createdAt: Date | string;
  currency: string;
  customerDisplayName: string;
  deliveryAddress: string;
  deliveryDate: string;
  deliveryZone: string | null;
  paymentExpectation: string;
  publicNumber: string;
  source: string;
  status: string;
  totalMinor: number;
}

function protectSpreadsheetFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: Date | number | string | null): string {
  const serialized =
    value instanceof Date ? value.toISOString() : value === null ? '' : String(value);
  return `"${protectSpreadsheetFormula(serialized).replaceAll('"', '""')}"`;
}

export function buildOrdersCsv(rows: readonly OrderExportRow[]): string {
  const headers = [
    'numero_pedido',
    'cliente',
    'estado',
    'fecha_entrega',
    'direccion',
    'zona',
    'moneda',
    'total_unidad_minima',
    'pago_esperado',
    'origen',
    'creado_en_utc',
  ];
  const lines = rows.map((row) =>
    [
      row.publicNumber,
      row.customerDisplayName,
      row.status,
      row.deliveryDate,
      row.deliveryAddress,
      row.deliveryZone,
      row.currency,
      row.totalMinor,
      row.paymentExpectation,
      row.source,
      row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    ]
      .map(csvCell)
      .join(','),
  );
  return `\uFEFF${headers.map(csvCell).join(',')}\r\n${lines.join('\r\n')}\r\n`;
}
