export interface OrderExportItem {
  /** Los platos elegidos de un Intuitivo. Vacío en un menú fijo, que ya sabe qué lleva. */
  dishSelections: readonly string[];
  productName: string;
  quantityUnits: number;
  variantName: string;
}

export interface OrderExportRow {
  createdAt: Date | string;
  currency: string;
  customerDisplayName: string;
  /*
   * Lo que sigue es opcional porque la planilla lo empezó a necesitar después que el CSV: un
   * pedido sin ítems cargados no es un caso real, pero un llamador viejo que no los pase tampoco
   * tiene por qué romperse.
   */
  customerWhatsapp?: string | null;
  deliveryAddress: string;
  deliveryDate: string;
  deliveryZone: string | null;
  dietaryInstructions?: readonly string[];
  items?: readonly OrderExportItem[];
  paidAt?: Date | string | null;
  paymentExpectation: string;
  publicNumber: string;
  source: string;
  status: string;
  totalMinor: number;
}

/**
 * El nombre sin apellido, para poder mostrar o mandar una lista sin exponer a quién compra.
 *
 * Una planilla de pedidos se reenvía: va a cocina, al repartidor, a un grupo de WhatsApp. El nombre
 * de pila alcanza para saber de quién es cada vianda; el apellido completo, no, y una vez que salió
 * ya no vuelve. Se dejan las iniciales en vez de borrarlas para que dos "Ana" sigan siendo dos
 * personas distinguibles.
 *
 * Un nombre de una sola palabra queda como está: no hay apellido que tapar, y recortarlo lo dejaría
 * sin identificar a nadie.
 *
 * OJO: `apps/web/src/lib/maskName.ts` hace lo mismo del lado del navegador, para que lo que se ve
 * en pantalla y lo que sale en la planilla digan igual. Si cambia una, cambia la otra.
 */
export function maskSurname(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return displayName.trim();
  const [first, ...rest] = parts;
  return [first, ...rest.map((part) => `${[...part][0] ?? ''}.`)].join(' ');
}

/**
 * Los ítems de un pedido en una sola celda.
 *
 * Un Intuitivo lleva su composición entre paréntesis: sin eso, dos filas idénticas resultan ser dos
 * viandas completamente distintas.
 */
export function orderItemsSummary(
  items: readonly OrderExportItem[] | undefined,
  separator = ' | ',
): string {
  return (items ?? [])
    .map((item) => {
      const dishes = item.dishSelections.length > 0 ? ` (${item.dishSelections.join(', ')})` : '';
      return `${item.productName} ${item.variantName} × ${String(item.quantityUnits)}${dishes}`;
    })
    .join(separator);
}

export function orderUnits(row: OrderExportRow): number {
  return (row.items ?? []).reduce((total, item) => total + item.quantityUnits, 0);
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
    'whatsapp',
    'pedido',
    'estado',
    'fecha_entrega',
    'direccion',
    'zona',
    'moneda',
    'total_unidad_minima',
    'medio_de_pago',
    'cobrado',
    'indicaciones',
    'origen',
    'creado_en_utc',
  ];
  const lines = rows.map((row) =>
    [
      row.publicNumber,
      row.customerDisplayName,
      row.customerWhatsapp ?? '',
      orderItemsSummary(row.items),
      row.status,
      row.deliveryDate,
      row.deliveryAddress,
      row.deliveryZone,
      row.currency,
      row.totalMinor,
      row.paymentExpectation,
      row.paidAt ? 'Sí' : 'No',
      (row.dietaryInstructions ?? []).join(' · '),
      row.source,
      row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    ]
      .map(csvCell)
      .join(','),
  );
  return `\uFEFF${headers.map(csvCell).join(',')}\r\n${lines.join('\r\n')}\r\n`;
}
