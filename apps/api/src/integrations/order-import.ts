import { canonicalArgentinePhone } from '@verdeo/customers';
import * as XLSX from 'xlsx';

import { extractPayment } from './contact-import.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 500;
/** Hasta dónde se busca la fila de encabezados: las planillas suelen traer filas vacías arriba. */
const HEADER_SEARCH_ROWS = 10;

/**
 * Las columnas que la planilla puede traer, con los nombres que la gente escribe de verdad.
 *
 * Mismo criterio que el import de contactos: se aceptan varias formas de llamar a lo mismo porque
 * la planilla la arma una persona, no un sistema, y rechazar un archivo por decir "Teléfono" en vez
 * de "telefono" es hacerle perder el tiempo a quien ya hizo el trabajo de juntar los datos.
 */
const columnAliases = {
  customerName: [
    'cliente',
    'nombre',
    'nombre_completo',
    'nombre completo',
    'nombre y apellido',
    'apellido y nombre',
    'nombre del cliente',
  ],
  deliveryAddress: ['direccion', 'dirección', 'domicilio', 'direccion de entrega'],
  email: ['email', 'e-mail', 'correo', 'mail'],
  dishes: ['platos', 'platos elegidos', 'seleccion', 'selección'],
  notes: ['notas', 'observaciones', 'comentarios'],
  paymentExpectation: ['medio_de_pago', 'medio de pago', 'pago', 'forma de pago'],
  phone: ['telefono', 'teléfono', 'whatsapp', 'celular', 'cel', 'movil'],
  quantityUnits: ['cantidad', 'unidades', 'cant'],
  sector: ['barrio', 'localidad'],
  size: ['tamano', 'tamaño', 'size'],
  total: ['venta', 'total', 'precio', 'importe', 'monto', 'valor'],
  variety: ['variedad', 'menu', 'menú', 'producto'],
} as const;

type Field = keyof typeof columnAliases;

/**
 * Una variedad de un pedido.
 *
 * Una fila de planilla trae una; un email trae las que el cliente marcó. Por eso un pedido es una
 * lista de estas y no una variedad suelta con su cantidad: con una sola por fila, un email con dos
 * variedades se habría importado como dos pedidos.
 */
export interface OrderImportItem {
  dishes: string[];
  quantityUnits: number;
  size: string | null;
  /**
   * La variedad de cada plato, en orden, cuando la vianda mezcla variedades ("keto, keto,
   * vegetariano, keto, keto"). Es un Intuitivo: el servidor busca el plato de esa variedad en esa
   * posición del menú publicado y lo pone en `dishes`.
   */
  slotVarieties?: string[];
  variety: string | null;
}

export interface OrderImportRow {
  customerName: string;
  deliveryAddress: string | null;
  email: string | null;
  items: OrderImportItem[];
  /** De dónde viene el pedido: sirve para decir de dónde se importó y cómo se etiqueta. */
  kind: 'email' | 'spreadsheet_import';
  /** La ciudad que dice el origen, tal como la escribió: se muestra, no se interpreta. */
  locality: string | null;
  notes: string | null;
  paymentExpectation: string | null;
  phone: string | null;
  /** El día en que llegó el pedido, cuando el origen lo dice. */
  receivedOn: string | null;
  /** El número de fila de la planilla, o de pedido dentro de lo pegado, para poder ubicarlo. */
  rowNumber: number;
  /** Lo que el lector no pudo entender de este pedido, para que no se pierda en silencio. */
  warnings: string[];
  /** Lo que el lector interpretó y conviene mirar, sin que sea un problema (no destilda el pedido). */
  notices?: string[];
}
export class OrderImportError extends Error {
  public constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/**
 * El encabezado, sin tildes, sin mayúsculas y sin espacios de más.
 *
 * "Teléfono" es lo que sale de exportar desde una planilla y "Telefono" lo que se escribe a mano:
 * las dos tienen que entrar por la misma puerta. Comparar sin tildes sale más barato que listar
 * cada alias dos veces y confiar en no olvidarse ninguno.
 */
function cleanHeader(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      // `trim` también saca la BOM que un CSV guardado desde Excel deja pegada al primer encabezado.
      .trim()
      .toLocaleLowerCase('es-AR')
      .replace(/\s+/g, ' ')
  );
}

/** Las celdas llegan como `unknown`. Sólo estas formas tienen un valor; el resto se descarta en vez
 * de convertirse en "[object Object]" y entrar a la base como si fuera un dato. */
function cleanValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : value instanceof Date
          ? value.toISOString()
          : '';
  return text.trim().replace(/\s+/g, ' ') || undefined;
}

const ALIASES = Object.fromEntries(
  Object.entries(columnAliases).map(([field, aliases]) => [field, aliases.map(cleanHeader)]),
) as Record<Field, string[]>;

function fieldFor(header: string): Field | null {
  const cleaned = cleanHeader(header);
  if (!cleaned) return null;
  const entry = Object.entries(ALIASES).find(([, aliases]) => aliases.includes(cleaned));
  return entry ? (entry[0] as Field) : null;
}

/**
 * Las columnas de cada plato de la vianda: sin nombre o con uno genérico ("Columna1", "Plato 2",
 * "Lunes"). Así arman la semana las planillas cargadas a mano.
 */
const SLOT_HEADER = /^(|columna ?\d*|plato ?\d*|dia ?\d*|lunes|martes|miercoles|jueves|viernes)$/;

/** "ANTIAGE 250": un producto con su tamaño escrito en una celda suelta, al costado del pedido. */
const EXTRA_PRODUCT = /^(\D.*?)\s+(\d{3})$/;

function normalizedName(value: string): string {
  return cleanHeader(value).replace(/[^a-z0-9 ]+/g, '');
}

function formatPesos(text: string): string | null {
  const amount = Number(
    text
      .replace(/[^\d,.-]/g, '')
      .replace(/\.(?=\d{3}\b)/g, '')
      .replace(',', '.'),
  );
  return Number.isFinite(amount) && amount > 0
    ? `$${amount.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
    : null;
}

/** Una vianda de la planilla por semana: un tamaño y la variedad de cada plato. */
interface Unit {
  rowNumber: number;
  size: string | null;
  slots: string[];
}

function filledSlots(unit: Unit): number {
  return unit.slots.filter(Boolean).length;
}

/** La vianda como ítem: una sola variedad es ese menú; varias, un Intuitivo con sus platos. */
function unitItem(unit: Unit): OrderImportItem {
  const filled = unit.slots.filter(Boolean);
  const varieties = [...new Set(filled.map(normalizedName))];
  if (varieties.length <= 1) {
    return { dishes: [], quantityUnits: 1, size: unit.size, variety: filled[0] ?? null };
  }
  return {
    dishes: [],
    quantityUnits: 1,
    size: unit.size,
    slotVarieties: unit.slots,
    variety: 'Intuitivo',
  };
}

/** Las viandas iguales del mismo pedido se suman: dos filas de Keto 250 son Keto 250 × 2. */
function mergeItems(items: OrderImportItem[]): OrderImportItem[] {
  const merged: OrderImportItem[] = [];
  for (const item of items) {
    const same = item.slotVarieties
      ? undefined
      : merged.find(
          (other) =>
            !other.slotVarieties &&
            other.dishes.length === 0 &&
            item.dishes.length === 0 &&
            normalizedName(other.variety ?? '') === normalizedName(item.variety ?? '') &&
            normalizedName(other.size ?? '') === normalizedName(item.size ?? ''),
        );
    if (same) same.quantityUnits += item.quantityUnits;
    else merged.push({ ...item });
  }
  return merged;
}

function readWorkbook(file: File, text: string | null, bytes: Uint8Array | null): XLSX.WorkBook {
  return text !== null
    ? XLSX.read(text, { raw: true, type: 'string' })
    : XLSX.read(bytes ?? new Uint8Array(), { type: 'array' });
}

/**
 * Lee la planilla y devuelve una fila por pedido, sin tocar la base.
 *
 * Deliberadamente no valida contra el catálogo ni busca clientes: eso es trabajo del paso
 * siguiente, que sí mira la base. Acá sólo se resuelve qué dice el archivo — separar las dos cosas
 * es lo que permite mostrarle a alguien qué entendimos de su planilla antes de escribir nada.
 *
 * Entiende dos formas de planilla:
 *
 * - **Una fila por pedido**, con variedad, tamaño y cantidad.
 * - **Una fila por vianda**, como se arman a mano: el tamaño ("Pedido": 250/400) y una columna por
 *   plato con la variedad de cada uno. Las filas seguidas del mismo cliente son el mismo pedido;
 *   una fila con platos de menos completa la vianda anterior. La venta, la forma de pago pegada a
 *   la dirección ("… transferencia") y el barrio se toman también.
 */
export async function parseOrderImport(file: File): Promise<OrderImportRow[]> {
  if (file.size === 0) throw new OrderImportError('El archivo está vacío.');
  if (file.size > MAX_FILE_BYTES) {
    throw new OrderImportError('El archivo supera el límite de 5 MB.');
  }

  if (!/\.(csv|tsv|txt|xlsx)$/i.test(file.name)) {
    throw new OrderImportError('Elegí un archivo CSV, TSV o Excel (.xlsx).');
  }

  /*
   * El CSV entra como texto y el .xlsx como bytes, y la diferencia no es cosmética.
   *
   * Leer un CSV con `type: 'array'` lo decodifica como latin1: "María Pérez" se importa como
   * "MarÃ­a PÃ©rez" y queda así en la base, con el nombre del cliente roto —y los encabezados
   * acentuados dejan de reconocerse por lo mismo—. `file.text()` lo decodifica como UTF-8, que es
   * lo que exporta cualquier planilla. Un .xlsx, en cambio, es un ZIP: ahí los bytes son los bytes.
   * Un TSV (lo que se copia de Google Sheets) es texto como el CSV, separado por tabulaciones.
   */
  let workbook: XLSX.WorkBook;
  try {
    const isText = !file.name.toLocaleLowerCase('es-AR').endsWith('.xlsx');
    workbook = readWorkbook(
      file,
      isText ? await file.text() : null,
      isText ? null : new Uint8Array(await file.arrayBuffer()),
    );
  } catch {
    throw new OrderImportError(
      'No pudimos leer el archivo. Guardalo como CSV UTF-8 o Excel (.xlsx).',
    );
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new OrderImportError('La planilla no tiene ninguna hoja con datos.');

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    blankrows: true,
    defval: '',
    header: 1,
  });
  if (grid.length === 0) throw new OrderImportError('La planilla no tiene filas.');

  // La fila de encabezados: la primera, entre las de arriba, que tiene la columna del cliente.
  const headerIndex = grid
    .slice(0, HEADER_SEARCH_ROWS)
    .findIndex((cells) =>
      cells.some((cell) => fieldFor(cleanValue(cell) ?? '') === 'customerName'),
    );
  if (headerIndex === -1) {
    throw new OrderImportError(
      'No encontramos la columna con el nombre del cliente («Nombre» o «Cliente»).',
    );
  }
  const headers = (grid[headerIndex] ?? []).map((cell) => cleanValue(cell) ?? '');
  const dataRows = grid
    .map((cells, index) => ({ cells, rowNumber: index + 1 }))
    .slice(headerIndex + 1)
    .filter(({ cells }) => cells.some((cell) => cleanValue(cell) !== undefined));
  if (dataRows.length === 0) throw new OrderImportError('La planilla no tiene filas.');
  if (dataRows.length > MAX_ROWS) {
    throw new OrderImportError(`La planilla tiene más de ${String(MAX_ROWS)} filas.`);
  }

  const columns = new Map<Field, number>();
  headers.forEach((header, index) => {
    const field = fieldFor(header);
    if (field && !columns.has(field)) columns.set(field, index);
  });
  // "Pedido": si trae 250/400 es el tamaño; si trae nombres, la variedad.
  const pedido = headers.findIndex((header) => cleanHeader(header) === 'pedido');
  if (pedido !== -1) {
    const values = dataRows.map(({ cells }) => cleanValue(cells[pedido])).filter(Boolean);
    const looksLikeSize = values.filter((value) => /^\d{3}\b/.test(value ?? '')).length;
    if (looksLikeSize > values.length / 2 && !columns.has('size')) columns.set('size', pedido);
    else if (!columns.has('variety')) columns.set('variety', pedido);
  }

  // Las columnas de los platos: seguidas, a la derecha del tamaño o la variedad, sin nombre propio.
  const mapped = new Set(columns.values());
  const slotStart = (columns.get('size') ?? columns.get('variety') ?? -2) + 1;
  const slotColumns: number[] = [];
  for (let index = slotStart; index > 0 && index < headers.length; index += 1) {
    if (mapped.has(index) || !SLOT_HEADER.test(cleanHeader(headers[index] ?? ''))) break;
    slotColumns.push(index);
  }
  const slotMode =
    slotColumns.length >= 2 &&
    dataRows.some(({ cells }) => slotColumns.some((index) => cleanValue(cells[index])));
  const slotSet = new Set(slotColumns);
  const extraColumns = headers
    .map((_, index) => index)
    .filter((index) => !mapped.has(index) && !slotSet.has(index) && index !== pedido);

  const read = (cells: unknown[], field: Field) => {
    const index = columns.get(field);
    return index === undefined ? undefined : cleanValue(cells[index]);
  };

  const parsed: OrderImportRow[] = [];
  const problemas: { fila: number; motivo: string }[] = [];
  type Pending = OrderImportRow & { extras: OrderImportItem[]; units: Unit[] };
  // El pedido que se está armando con filas seguidas del mismo cliente.
  let current = null as Pending | null;
  let currentKey = '';

  const finish = () => {
    if (!current) return;
    const { extras, units, ...row } = current;
    for (const unit of units) {
      const filled = filledSlots(unit);
      if (slotMode && filled > 0 && filled < slotColumns.length) {
        row.warnings.push(
          `La vianda de la fila ${String(unit.rowNumber)} tiene ${String(filled)} de ${String(slotColumns.length)} platos.`,
        );
      }
    }
    const items = mergeItems([
      ...units.filter((unit) => filledSlots(unit) > 0).map(unitItem),
      ...extras,
    ]);
    if (items.length === 0) {
      problemas.push({ fila: row.rowNumber, motivo: 'Sin platos ni variedad' });
    } else {
      parsed.push({ ...row, items });
    }
    current = null;
  };

  for (const { cells, rowNumber } of dataRows) {
    const customerName = read(cells, 'customerName');
    if (!customerName) {
      problemas.push({ fila: rowNumber, motivo: 'Sin nombre de cliente' });
      continue;
    }

    const address = extractPayment(read(cells, 'deliveryAddress') ?? '');
    const sector = read(cells, 'sector');
    const deliveryAddress = address.text
      ? sector && !normalizedName(address.text).includes(normalizedName(sector))
        ? `${address.text}, ${sector}`
        : address.text
      : null;
    const telefono = read(cells, 'phone');
    const paymentColumn = read(cells, 'paymentExpectation');
    const payment = paymentColumn ?? address.payment ?? null;
    const total = read(cells, 'total');
    const notesColumn = read(cells, 'notes');

    // Productos sueltos al costado ("ANTIAGE 250" y la cantidad en la celda siguiente).
    const extras: OrderImportItem[] = [];
    for (const index of extraColumns) {
      const match = EXTRA_PRODUCT.exec(cleanValue(cells[index]) ?? '');
      if (!match?.[1] || !match[2]) continue;
      const next = Number(cleanValue(cells[index + 1]) ?? '');
      extras.push({
        dishes: [],
        quantityUnits: Number.isInteger(next) && next > 0 ? next : 1,
        size: match[2],
        variety: match[1],
      });
    }

    if (!slotMode) {
      const cantidadTexto = read(cells, 'quantityUnits');
      const quantityUnits = cantidadTexto ? Number(cantidadTexto.replace(',', '.')) : 1;
      if (!Number.isInteger(quantityUnits) || quantityUnits < 1) {
        problemas.push({ fila: rowNumber, motivo: `Cantidad inválida: "${cantidadTexto ?? ''}"` });
        continue;
      }
      const platos = read(cells, 'dishes');
      const venta = total ? formatPesos(total) : null;
      parsed.push({
        customerName,
        deliveryAddress,
        email: read(cells, 'email')?.toLocaleLowerCase('es-AR') ?? null,
        items: [
          {
            // Separados por coma o por punto y coma: las dos formas aparecen en las planillas reales.
            dishes: platos
              ? platos
                  .split(/[;,]/)
                  .map((dish) => dish.trim())
                  .filter(Boolean)
              : [],
            quantityUnits,
            size: read(cells, 'size') ?? null,
            variety: read(cells, 'variety') ?? null,
          },
          ...extras,
        ],
        kind: 'spreadsheet_import',
        locality: null,
        notes:
          [notesColumn, venta ? `Venta en planilla: ${venta}` : undefined]
            .filter(Boolean)
            .join('\n') || null,
        paymentExpectation: payment,
        // Todos los celulares con la misma forma: es lo que permite reconocer a un cliente que ya está.
        phone: telefono ? canonicalArgentinePhone(telefono) : null,
        receivedOn: null,
        rowNumber,
        warnings: [],
      });
      continue;
    }

    // Una fila por vianda: las filas seguidas del mismo cliente son el mismo pedido.
    const key = normalizedName(customerName);
    if (!current || currentKey !== key) {
      finish();
      current = {
        customerName,
        deliveryAddress,
        email: read(cells, 'email')?.toLocaleLowerCase('es-AR') ?? null,
        extras: [],
        items: [],
        kind: 'spreadsheet_import',
        locality: null,
        notes: notesColumn ?? null,
        paymentExpectation: payment,
        phone: telefono ? canonicalArgentinePhone(telefono) : null,
        receivedOn: null,
        rowNumber,
        units: [],
        warnings: [],
      };
      currentKey = key;
    } else {
      // Lo que falta en la primera fila del pedido se toma de las siguientes.
      current.deliveryAddress ??= deliveryAddress;
      current.paymentExpectation ??= payment;
      if (!current.phone && telefono) current.phone = canonicalArgentinePhone(telefono);
      if (notesColumn) current.notes = [current.notes, notesColumn].filter(Boolean).join('\n');
    }
    const venta = total ? formatPesos(total) : null;
    if (venta) {
      current.notes = [current.notes, `Venta en planilla: ${venta}`].filter(Boolean).join('\n');
    }
    current.extras.push(...extras);

    const unit: Unit = {
      rowNumber,
      size: read(cells, 'size') ?? null,
      slots: slotColumns.map((index) => cleanValue(cells[index]) ?? ''),
    };
    /*
     * Una fila con platos de menos que completa la anterior: la vianda de la fila de arriba tenía
     * un hueco y la variedad que falta quedó en el renglón de abajo. Si entran en los huecos y son
     * del mismo tamaño, es la misma vianda.
     */
    const previous = current.units.at(-1);
    const blanks = previous ? previous.slots.filter((slot) => !slot).length : 0;
    if (
      previous &&
      blanks > 0 &&
      filledSlots(unit) > 0 &&
      filledSlots(unit) <= blanks &&
      normalizedName(previous.size ?? '') === normalizedName(unit.size ?? '')
    ) {
      const pending = unit.slots.filter(Boolean);
      previous.slots = previous.slots.map((slot) => slot || (pending.shift() ?? ''));
      (current.notices ??= []).push(
        `La fila ${String(rowNumber)} completa la vianda de la fila ${String(previous.rowNumber)}.`,
      );
    } else {
      current.units.push(unit);
    }
  }
  finish();

  if (parsed.length === 0) {
    throw new OrderImportError(
      'Ninguna fila de la planilla tiene los datos mínimos (cliente y cantidad).',
      problemas,
    );
  }
  return parsed;
}
