import * as XLSX from 'xlsx';

import { orderItemsSummary, orderUnits, type OrderExportRow } from '@verdeo/orders';

/**
 * La planilla del formulario de pedidos consolidado.
 *
 * El CSV existe desde antes y sigue: es el formato para meter los pedidos en otra herramienta. Esto
 * es otra cosa —lo que se abre, se mira y se reenvía—, así que trae lo que la pantalla muestra
 * (nombre, contacto, qué pidió, estado, total) más las dos consolidaciones que si no se hacen a
 * mano: cuántas viandas de cada tipo salen y cómo se reparten por zona.
 *
 * Lo que se puede dar de formato es acotado y conviene saber por qué: `xlsx` 0.18 descarta los
 * estilos de celda al escribir —la negrita es de la versión paga— y tampoco escribe paneles fijos.
 * Comprobado, no supuesto. Queda lo que sí llega al archivo: anchos de columna y el autofiltro
 * sobre la fila de encabezados.
 */

const STATUS_LABELS: Record<string, string> = {
  CANCELLED: 'Cancelado',
  CONFIRMED: 'Confirmado',
  DELIVERED: 'Entregado',
  DRAFT: 'Borrador',
  READY: 'Listo',
};

const SOURCE_LABELS: Record<string, string> = {
  email: 'Email',
  facebook: 'Facebook',
  instagram: 'Instagram',
  manual: 'Manual',
  opportunity_sale: 'Venta de oportunidad',
  phone: 'Teléfono',
  referral: 'Recomendación',
  web: 'Sitio web',
  whatsapp: 'WhatsApp',
};

function sheetWithTitle(
  title: string,
  rows: Record<string, number | string>[],
  widths: number[],
): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([[title], []]);
  XLSX.utils.sheet_add_json(sheet, rows, { origin: 'A2' });
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  const lastColumn = XLSX.utils.encode_col(Math.max(0, widths.length - 1));
  sheet['!autofilter'] = { ref: `A2:${lastColumn}${String(rows.length + 2)}` };
  return sheet;
}

/** Fecha corta y estable, sin depender de la zona horaria de quien exporta. */
function shortDate(value: Date | string): string {
  const iso = value instanceof Date ? value.toISOString() : value;
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

export interface OrdersExcelOptions {
  /** El alias de la semana, si se exportó un período. Va en el título de cada hoja. */
  cycleAlias?: string | null;
}

export function buildOrdersExcel(
  rows: readonly OrderExportRow[],
  options: OrdersExcelOptions = {},
): ArrayBuffer {
  const title = options.cycleAlias
    ? `Pedidos — ${options.cycleAlias}`
    : 'Pedidos — todos los períodos';

  const book = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    book,
    sheetWithTitle(
      title,
      rows.map((row) => ({
        'N°': row.publicNumber,
        Cliente: row.customerDisplayName,
        WhatsApp: row.customerWhatsapp ?? '',
        // Salto de línea dentro de la celda: un Intuitivo con cinco platos en una sola línea no se
        // lee, y acá sí hay dónde apilarlos.
        Pedido: orderItemsSummary(row.items, '\n'),
        Unidades: orderUnits(row),
        Estado: STATUS_LABELS[row.status] ?? row.status,
        Entrega: shortDate(row.deliveryDate),
        Zona: row.deliveryZone ?? '',
        Domicilio: row.deliveryAddress,
        // En pesos y como número: exportar centavos obliga a dividir a mano antes de sumar.
        Total: row.totalMinor / 100,
        'Pago esperado': row.paymentExpectation,
        Cobrado: row.paidAt ? 'Sí' : 'No',
        Indicaciones: (row.dietaryInstructions ?? []).join(' · '),
        Origen: SOURCE_LABELS[row.source] ?? row.source,
      })),
      [12, 24, 16, 40, 10, 12, 12, 16, 32, 12, 16, 10, 24, 14],
    ),
    'Pedidos',
  );

  /*
   * Cuántas viandas de cada tipo salen.
   *
   * Es la pregunta que se hace apenas se cierra la semana y la única que la lista fila por fila no
   * responde: hay que sumar a mano por producto y tamaño. Los cancelados quedan afuera —no se
   * producen— pero los borradores entran, porque todavía pueden confirmarse y cocina quiere saber
   * el techo.
   */
  const tally = new Map<string, { orders: number; product: string; units: number; size: string }>();
  for (const row of rows) {
    if (row.status === 'CANCELLED') continue;
    for (const item of row.items ?? []) {
      const key = `${item.productName}\u0000${item.variantName}`;
      const current = tally.get(key) ?? {
        orders: 0,
        product: item.productName,
        size: item.variantName,
        units: 0,
      };
      current.orders += 1;
      current.units += item.quantityUnits;
      tally.set(key, current);
    }
  }
  const tallyRows = [...tally.values()].sort(
    (left, right) =>
      left.product.localeCompare(right.product, 'es-AR') ||
      left.size.localeCompare(right.size, 'es-AR', { numeric: true }),
  );
  XLSX.utils.book_append_sheet(
    book,
    sheetWithTitle(
      title,
      [
        ...tallyRows.map((line) => ({
          Menú: line.product,
          Tamaño: line.size,
          Unidades: line.units,
          Pedidos: line.orders,
        })),
        {
          Menú: 'Total',
          Tamaño: '',
          Unidades: tallyRows.reduce((total, line) => total + line.units, 0),
          Pedidos: tallyRows.reduce((total, line) => total + line.orders, 0),
        },
      ],
      [28, 12, 12, 12],
    ),
    'Conciliado',
  );

  /* Cómo se reparte el reparto: cuántas paradas y cuánta plata hay en cada zona. */
  const zones = new Map<string, { orders: number; totalMinor: number; units: number }>();
  for (const row of rows) {
    if (row.status === 'CANCELLED') continue;
    const zone = row.deliveryZone ?? 'Sin zona';
    const current = zones.get(zone) ?? { orders: 0, totalMinor: 0, units: 0 };
    current.orders += 1;
    current.totalMinor += row.totalMinor;
    current.units += orderUnits(row);
    zones.set(zone, current);
  }
  XLSX.utils.book_append_sheet(
    book,
    sheetWithTitle(
      title,
      [...zones.entries()]
        .sort((left, right) => left[0].localeCompare(right[0], 'es-AR'))
        .map(([zone, line]) => ({
          Zona: zone,
          Pedidos: line.orders,
          Unidades: line.units,
          Total: line.totalMinor / 100,
        })),
      [24, 12, 12, 14],
    ),
    'Por zona',
  );

  return XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}
