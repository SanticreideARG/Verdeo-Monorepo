import * as XLSX from 'xlsx';

import { CustomerCreateRequestSchema, type CustomerCreateRequest } from '@verdeo/contracts';
import { canonicalArgentinePhone } from '@verdeo/customers';
import { PAYMENT_KIND_LABELS, paymentKindOfWord } from '@verdeo/orders';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 500;
/** Hasta dónde se busca la fila de encabezados: las planillas suelen traer un título o filas vacías arriba. */
const HEADER_SEARCH_ROWS = 10;

type Field =
  | 'address'
  | 'city'
  | 'email'
  | 'lastName'
  | 'locationUrl'
  | 'mobile'
  | 'name'
  | 'notes'
  | 'payment'
  | 'phone'
  | 'sector'
  | 'whatsapp';

/**
 * Cómo se reconoce cada columna, sobre el encabezado normalizado (minúsculas, sin tildes ni signos).
 *
 * Las planillas reales no usan los nombres de una plantilla: "Nombre", "Cliente", "Celular",
 * "Dirección de entrega", "Mail". Primero se prueba la coincidencia exacta y después la parcial
 * ("Teléfono celular" contiene "celular"), en el orden de esta lista: lo más específico primero.
 */
const FIELD_RULES: readonly { contains?: RegExp; exact: RegExp; field: Field }[] = [
  {
    exact: /^(whatsapp|whats app|wpp|wsp|wa|celular whatsapp|cel whatsapp)$/,
    contains: /whats|wpp|wsp/,
    field: 'whatsapp',
  },
  {
    exact: /^(cel|celular|celulares|movil|tel celular|telefono celular|telefono movil)$/,
    contains: /celular|movil/,
    field: 'mobile',
  },
  {
    exact:
      /^(tel|telefono|telefonos|tel fijo|telefono fijo|numero|numero de telefono|nro de telefono|phone)$/,
    contains: /telefono|^tel\b/,
    field: 'phone',
  },
  {
    exact: /^(e mail|email|mail|correo|correo electronico)$/,
    contains: /mail|correo/,
    field: 'email',
  },
  {
    exact:
      /^(enlace|link|enlace ubicacion|enlace de ubicacion|link ubicacion|link de ubicacion|maps|google maps|link maps|mapa)$/,
    contains: /enlace|link|maps/,
    field: 'locationUrl',
  },
  {
    exact:
      /^(direccion|domicilio|dir|calle|direccion de entrega|domicilio de entrega|direccion completa|ubicacion|ubicacion de entrega)$/,
    contains: /direcc|domicilio/,
    field: 'address',
  },
  { exact: /^(barrio|barrios)$/, contains: /barrio/, field: 'sector' },
  { exact: /^(localidad|ciudad|partido|municipio)$/, contains: /localidad|ciudad/, field: 'city' },
  {
    exact: /^(forma de pago|medio de pago|metodo de pago|pago|forma pago|medio pago)$/,
    contains: /pago/,
    field: 'payment',
  },
  {
    exact: /^(notas?|observaciones?|obs|comentarios?|aclaraciones?)$/,
    contains: /observ|coment|nota/,
    field: 'notes',
  },
  { exact: /^(apellidos?)$/, field: 'lastName' },
  {
    exact:
      /^(nombre|nombres|nombre y apellido|apellido y nombre|nombre completo|nombre visible|cliente|nombre cliente|nombre del cliente|razon social|contacto|titular)$/,
    contains: /nombre|cliente/,
    field: 'name',
  },
];

/** Los nombres que se aceptan para el nombre del cliente, para el mensaje de error. */
const NAME_EXAMPLES = ['Nombre', 'Nombre y apellido', 'Cliente', 'nombre_completo'];

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('es-AR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function fieldFor(header: string): Field | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;
  return (
    FIELD_RULES.find((rule) => rule.exact.test(normalized))?.field ??
    FIELD_RULES.find((rule) => rule.contains?.test(normalized))?.field ??
    null
  );
}

// Spreadsheet cells arrive as unknown. Only these shapes carry a contact value; anything else
// would stringify to '[object Object]' and silently import garbage.
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

// Las palabras que acompañan a la forma de pago y se van con ella: "pago en efectivo", "por transf.".
const PAYMENT_CONNECTORS = new Set([
  'abona',
  'abonar',
  'con',
  'en',
  'paga',
  'pagar',
  'pago',
  'por',
]);

/**
 * Saca de un texto la forma de pago que viene pegada ("Lavalle 1234 - 3B transferencia",
 * "… POR TRANSFERENCIA", "… 7B trasferencia, palermo") y la devuelve aparte con su nombre
 * canónico: no es parte de la dirección, confunde al ubicador y terminaba en el mensaje al cliente.
 *
 * Tolera errores de tipeo (`paymentKindOfWord`): "trasferencia" se pasó tal cual a un cliente.
 */
export function extractPayment(text: string): { payment?: string; text: string } {
  const words = [...text.matchAll(/[\p{L}\p{N}.]+/gu)].map((match) => ({
    end: match.index + match[0].length,
    start: match.index,
    word: match[0],
  }));
  const spans: { end: number; start: number }[] = [];
  let payment: string | undefined;
  for (let index = 0; index < words.length; index += 1) {
    const current = words[index];
    if (!current) continue;
    const next = words[index + 1];
    const isMercadoPago =
      normalizeHeader(current.word) === 'mercado' && normalizeHeader(next?.word ?? '') === 'pago';
    const kind = isMercadoPago ? 'mercado_pago' : paymentKindOfWord(current.word);
    if (!kind) continue;
    payment ??= PAYMENT_KIND_LABELS[kind];
    let first = index;
    while (first > 0 && PAYMENT_CONNECTORS.has(normalizeHeader(words[first - 1]?.word ?? ''))) {
      first -= 1;
    }
    const last = isMercadoPago && next ? next : current;
    spans.push({ end: last.end, start: words[first]?.start ?? current.start });
    if (isMercadoPago) index += 1;
  }
  if (!payment) return { text: text.trim() };

  let cleaned = text;
  for (const span of [...spans].reverse()) {
    // Con el paréntesis que la envuelve, si lo hay: "(pago en efectivo)".
    const before = cleaned.slice(0, span.start).replace(/\(\s*$/, '');
    const after = cleaned.slice(span.end).replace(/^\s*\)/, '');
    cleaned = `${before} ${after}`;
  }
  cleaned = cleaned
    .replace(/\s+([,;])/g, '$1')
    .replace(/([,;-])\s*(?=[,;])/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,;-]+$/, '')
    .replace(/^[\s,;-]+/, '')
    .trim();
  return { payment, text: cleaned };
}

export class ContactImportError extends Error {
  public constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/** La fila de encabezados: la primera, entre las de arriba, que tiene una columna de nombre. */
function findHeaderRow(rows: unknown[][]): number {
  const limit = Math.min(rows.length, HEADER_SEARCH_ROWS);
  for (let index = 0; index < limit; index += 1) {
    const fields = (rows[index] ?? []).map((cell) => fieldFor(cleanValue(cell) ?? ''));
    if (fields.includes('name')) return index;
  }
  return -1;
}

export async function parseContactImport(
  file: File,
  geographicZoneId?: string,
): Promise<CustomerCreateRequest[]> {
  return (await parseContactImportRows(file, geographicZoneId)).map(({ customer }) => customer);
}

/** Cada cliente de la planilla con la fila de la hoja de la que salió, para conciliar. */
export async function parseContactImportRows(
  file: File,
  geographicZoneId?: string,
): Promise<{ customer: CustomerCreateRequest; rowNumber: number }[]> {
  if (file.size === 0) throw new ContactImportError('El archivo está vacío.');
  if (file.size > MAX_FILE_BYTES) {
    throw new ContactImportError('El archivo supera el límite de 5 MB.');
  }
  if (!/\.(csv|xlsx)$/i.test(file.name)) {
    throw new ContactImportError('Elegí un archivo CSV o Excel (.xlsx).');
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = file.name.toLocaleLowerCase('es-AR').endsWith('.csv')
      ? XLSX.read(await file.text(), { raw: true, type: 'string' })
      : XLSX.read(await file.arrayBuffer(), { type: 'array' });
  } catch {
    throw new ContactImportError(
      'No pudimos leer el archivo. Guardalo como CSV UTF-8 o Excel (.xlsx).',
    );
  }
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new ContactImportError('El archivo no contiene una hoja de contactos.');
  const sheet = workbook.Sheets[firstSheet];
  if (!sheet) throw new ContactImportError('No pudimos abrir la primera hoja del archivo.');
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    blankrows: true,
    defval: '',
    header: 1,
  });

  const headerIndex = findHeaderRow(grid);
  if (headerIndex === -1) {
    throw new ContactImportError(
      `Falta una columna con el nombre del cliente (por ejemplo ${NAME_EXAMPLES.map((name) => `«${name}»`).join(', ')}).`,
      { acceptedColumns: NAME_EXAMPLES },
    );
  }

  // A cada columna, su campo. Si dos columnas caen en el mismo campo, vale la primera.
  const columns = new Map<Field, number>();
  (grid[headerIndex] ?? []).forEach((cell, column) => {
    const field = fieldFor(cleanValue(cell) ?? '');
    if (field && !columns.has(field)) columns.set(field, column);
  });

  const dataRows = grid
    .map((cells, index) => ({ cells, sheetRow: index + 1 }))
    .slice(headerIndex + 1)
    // Las filas vacías (separadores, el final de la hoja) no son contactos.
    .filter(({ cells }) => cells.some((cell) => cleanValue(cell) !== undefined));
  if (dataRows.length === 0) {
    throw new ContactImportError('La hoja no contiene filas de contactos.');
  }
  if (dataRows.length > MAX_ROWS) {
    throw new ContactImportError(`La importación admite hasta ${MAX_ROWS} contactos por archivo.`);
  }
  if (columns.has('address') && !geographicZoneId) {
    throw new ContactImportError(
      'La planilla trae domicilios: elegí la zona de operaciones a la que pertenecen.',
    );
  }

  return dataRows.map(({ cells, sheetRow }) => {
    const read = (field: Field) => {
      const column = columns.get(field);
      return column === undefined ? undefined : cleanValue(cells[column]);
    };

    // La forma de pago puede venir en su columna o pegada a la dirección o las notas.
    const address = extractPayment(read('address') ?? '');
    const notes = extractPayment(read('notes') ?? '');
    const paymentColumn = read('payment');
    const payment =
      (paymentColumn ? (extractPayment(paymentColumn).payment ?? paymentColumn) : undefined) ??
      address.payment ??
      notes.payment;

    const lastName = read('lastName');
    const nameCell = read('name');
    // "Nombre" + "Apellido" en columnas separadas: el nombre visible es los dos juntos.
    const displayName =
      nameCell && lastName && !nameCell.includes(lastName) ? `${nameCell} ${lastName}` : nameCell;

    const sector = read('sector');
    const city = read('city');
    // Un enlace puede venir en la columna de dirección ("Ubicación") y texto en la de enlace.
    const isLink = (value: string | undefined) =>
      value !== undefined && /^https?:\/\//i.test(value);
    const locationCell = read('locationUrl');
    const locationUrl = isLink(locationCell)
      ? locationCell
      : isLink(address.text)
        ? address.text
        : undefined;
    if (isLink(address.text)) address.text = isLink(locationCell) ? '' : (locationCell ?? '');
    // El barrio va también en la dirección escrita: orienta al ubicador y al repartidor.
    const writtenAddress =
      address.text && sector && !normalizeHeader(address.text).includes(normalizeHeader(sector))
        ? `${address.text}, ${sector}`
        : address.text || undefined;

    // Un celular en la Argentina es el WhatsApp: si no hay columna de WhatsApp, se usa ese.
    const mobile = read('mobile');
    // Se guardan como "+549" y los diez dígitos, igual que los que llegan por pedidos: así el mismo
    // número no queda escrito de dos formas.
    const whatsappCell = read('whatsapp') ?? mobile;
    const phoneCell = read('phone') ?? mobile;
    const whatsapp = whatsappCell ? canonicalArgentinePhone(whatsappCell) : undefined;
    const phone = phoneCell ? canonicalArgentinePhone(phoneCell) : undefined;

    const internalNotes = [
      notes.text || undefined,
      payment ? `Forma de pago preferida: ${payment}.` : undefined,
    ]
      .filter(Boolean)
      .join('\n');

    const parsed = CustomerCreateRequestSchema.safeParse({
      // A sheet carries no zone, so the operator picks one for the whole import. Without it an
      // address cannot be persisted, and the row would silently lose its address.
      ...(writtenAddress && geographicZoneId
        ? {
            addresses: [
              {
                ...(city ? { city } : {}),
                geocodingStatus: 'NEEDS_LOCATION',
                geographicZoneId,
                label: 'Domicilio importado',
                locationUrl,
                primary: true,
                ...(sector ? { sector } : {}),
                source: 'spreadsheet_import',
                writtenAddress,
              },
            ],
          }
        : {}),
      displayName,
      email: read('email'),
      ...(lastName && nameCell ? { firstName: nameCell, lastName } : {}),
      identities: whatsapp
        ? [
            {
              primary: true,
              source: 'spreadsheet_import',
              type: 'whatsapp',
              value: whatsapp,
              verified: false,
            },
          ]
        : [],
      ...(internalNotes ? { internalNotes } : {}),
      phone,
    });
    if (!parsed.success) {
      throw new ContactImportError(
        displayName
          ? `La fila ${String(sheetRow)} contiene datos inválidos.`
          : `A la fila ${String(sheetRow)} le falta el nombre del cliente.`,
        { issues: parsed.error.issues, row: sheetRow },
      );
    }
    return { customer: parsed.data, rowNumber: sheetRow };
  });
}
