import { canonicalArgentinePhone } from '@verdeo/customers';
import * as XLSX from 'xlsx';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 500;

type SheetRow = Record<string, unknown>;

/**
 * Las columnas que la planilla puede traer, con los nombres que la gente escribe de verdad.
 *
 * Mismo criterio que el import de contactos: se aceptan varias formas de llamar a lo mismo porque
 * la planilla la arma una persona, no un sistema, y rechazar un archivo por decir "Teléfono" en vez
 * de "telefono" es hacerle perder el tiempo a quien ya hizo el trabajo de juntar los datos.
 */
const columnAliases = {
  customerName: ['cliente', 'nombre', 'nombre_completo', 'nombre completo'],
  deliveryAddress: ['direccion', 'dirección', 'domicilio'],
  email: ['email', 'e-mail', 'correo', 'mail'],
  dishes: ['platos', 'platos elegidos', 'seleccion', 'selección'],
  notes: ['notas', 'observaciones', 'comentarios'],
  paymentExpectation: ['medio_de_pago', 'medio de pago', 'pago', 'forma de pago'],
  phone: ['telefono', 'teléfono', 'whatsapp', 'celular'],
  quantityUnits: ['cantidad', 'unidades', 'cant'],
  size: ['tamano', 'tamaño', 'size'],
  variety: ['variedad', 'menu', 'menú', 'producto'],
} as const;

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
      .replace(/[\u0300-\u036f]/g, '')
      // La BOM de un CSV guardado desde Excel queda pegada al primer encabezado.
      .replace(/^\ufeff/, '')
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
  return text.trim() || undefined;
}

function valueFor(row: SheetRow, aliases: readonly string[]): string | undefined {
  // Los alias también se normalizan: `cleanHeader` les quita las tildes a los dos lados.
  const buscados = aliases.map(cleanHeader);
  const match = Object.entries(row).find(([header]) => buscados.includes(cleanHeader(header)));
  return match ? cleanValue(match[1]) : undefined;
}

/**
 * Lee la planilla y devuelve una fila por pedido, sin tocar la base.
 *
 * Deliberadamente no valida contra el catálogo ni busca clientes: eso es trabajo del paso
 * siguiente, que sí mira la base. Acá sólo se resuelve qué dice el archivo — separar las dos cosas
 * es lo que permite mostrarle a alguien qué entendimos de su planilla antes de escribir nada.
 */
export async function parseOrderImport(file: File): Promise<OrderImportRow[]> {
  if (file.size === 0) throw new OrderImportError('El archivo está vacío.');
  if (file.size > MAX_FILE_BYTES) {
    throw new OrderImportError('El archivo supera el límite de 5 MB.');
  }

  if (!/\.(csv|xlsx)$/i.test(file.name)) {
    throw new OrderImportError('Elegí un archivo CSV o Excel (.xlsx).');
  }

  /*
   * El CSV entra como texto y el .xlsx como bytes, y la diferencia no es cosmética.
   *
   * Leer un CSV con `type: 'array'` lo decodifica como latin1: "María Pérez" se importa como
   * "MarÃ­a PÃ©rez" y queda así en la base, con el nombre del cliente roto —y los encabezados
   * acentuados dejan de reconocerse por lo mismo—. `file.text()` lo decodifica como UTF-8, que es
   * lo que exporta cualquier planilla. Un .xlsx, en cambio, es un ZIP: ahí los bytes son los bytes.
   */
  let workbook: XLSX.WorkBook;
  try {
    workbook = file.name.toLocaleLowerCase('es-AR').endsWith('.csv')
      ? XLSX.read(await file.text(), { raw: true, type: 'string' })
      : XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  } catch {
    throw new OrderImportError(
      'No pudimos leer el archivo. Guardalo como CSV UTF-8 o Excel (.xlsx).',
    );
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new OrderImportError('La planilla no tiene ninguna hoja con datos.');

  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: null });
  if (rows.length === 0) throw new OrderImportError('La planilla no tiene filas.');
  if (rows.length > MAX_ROWS) {
    throw new OrderImportError(`La planilla tiene más de ${String(MAX_ROWS)} filas.`);
  }

  const parsed: OrderImportRow[] = [];
  const problemas: { fila: number; motivo: string }[] = [];

  for (const [index, row] of rows.entries()) {
    // +2: la fila 1 son los encabezados y las planillas cuentan desde 1, así que este número es el
    // que se ve en Excel al ir a corregir.
    const rowNumber = index + 2;
    const customerName = valueFor(row, columnAliases.customerName);
    if (!customerName) {
      problemas.push({ fila: rowNumber, motivo: 'Sin nombre de cliente' });
      continue;
    }

    const cantidadTexto = valueFor(row, columnAliases.quantityUnits);
    const quantityUnits = cantidadTexto ? Number(cantidadTexto.replace(',', '.')) : 1;
    if (!Number.isInteger(quantityUnits) || quantityUnits < 1) {
      problemas.push({ fila: rowNumber, motivo: `Cantidad inválida: "${cantidadTexto ?? ''}"` });
      continue;
    }

    const platos = valueFor(row, columnAliases.dishes);
    const telefono = valueFor(row, columnAliases.phone);
    parsed.push({
      customerName,
      deliveryAddress: valueFor(row, columnAliases.deliveryAddress) ?? null,
      email: valueFor(row, columnAliases.email)?.toLocaleLowerCase('es-AR') ?? null,
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
          size: valueFor(row, columnAliases.size) ?? null,
          variety: valueFor(row, columnAliases.variety) ?? null,
        },
      ],
      kind: 'spreadsheet_import',
      locality: null,
      notes: valueFor(row, columnAliases.notes) ?? null,
      paymentExpectation: valueFor(row, columnAliases.paymentExpectation) ?? null,
      // Todos los celulares con la misma forma: es lo que permite reconocer a un cliente que ya está.
      phone: telefono ? canonicalArgentinePhone(telefono) : null,
      receivedOn: null,
      rowNumber,
      warnings: [],
    });
  }
  if (parsed.length === 0) {
    throw new OrderImportError(
      'Ninguna fila de la planilla tiene los datos mínimos (cliente y cantidad).',
      problemas,
    );
  }
  return parsed;
}
