import * as XLSX from 'xlsx';

import { CustomerCreateRequestSchema, type CustomerCreateRequest } from '@verdeo/contracts';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 500;

type SheetRow = Record<string, unknown>;

const columnAliases = {
  displayName: ['nombre_completo', 'nombre visible', 'nombre_visible'],
  email: ['email', 'correo'],
  locationUrl: ['enlace_ubicacion', 'enlace de ubicacion', 'ubicacion', 'ubicación'],
  phone: ['telefono', 'teléfono', 'phone'],
  whatsapp: ['whatsapp', 'whats app'],
  writtenAddress: ['direccion', 'dirección', 'domicilio'],
} as const;

function cleanHeader(value: string): string {
  return value.trim().toLocaleLowerCase('es-AR').replace(/\s+/g, ' ');
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

  return text.trim() || undefined;
}

function valueFor(row: SheetRow, aliases: readonly string[]): string | undefined {
  const match = Object.entries(row).find(([header]) => aliases.includes(cleanHeader(header)));
  return match ? cleanValue(match[1]) : undefined;
}

export class ContactImportError extends Error {
  public constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function parseContactImport(
  file: File,
  geographicZoneId?: string,
): Promise<CustomerCreateRequest[]> {
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
  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: '' });
  if (rows.length === 0) throw new ContactImportError('La hoja no contiene filas de contactos.');
  if (rows.length > MAX_ROWS) {
    throw new ContactImportError(`La importación admite hasta ${MAX_ROWS} contactos por archivo.`);
  }

  const hasNameColumn = Object.keys(rows[0] ?? {}).some((header) =>
    columnAliases.displayName.some((alias) => alias === cleanHeader(header)),
  );
  if (!hasNameColumn) {
    throw new ContactImportError('Falta la columna obligatoria nombre_completo.', {
      acceptedColumns: columnAliases.displayName,
    });
  }

  const addressColumnPresent = Object.keys(rows[0] ?? {}).some((header) =>
    columnAliases.writtenAddress.some((alias) => alias === cleanHeader(header)),
  );
  if (addressColumnPresent && !geographicZoneId) {
    throw new ContactImportError(
      'La planilla trae domicilios: elegí la zona de operaciones a la que pertenecen.',
    );
  }

  const customers = rows.map((row, index) => {
    const displayName = valueFor(row, columnAliases.displayName);
    const whatsapp = valueFor(row, columnAliases.whatsapp);
    const phone = valueFor(row, columnAliases.phone);
    const email = valueFor(row, columnAliases.email);
    const writtenAddress = valueFor(row, columnAliases.writtenAddress);
    const locationUrl = valueFor(row, columnAliases.locationUrl);
    const parsed = CustomerCreateRequestSchema.safeParse({
      // A sheet carries no zone, so the operator picks one for the whole import. Without it an
      // address cannot be persisted, and the row would silently lose its address.
      ...(writtenAddress && geographicZoneId
        ? {
            addresses: [
              {
                geocodingStatus: 'NEEDS_LOCATION',
                geographicZoneId,
                label: 'Domicilio importado',
                locationUrl,
                primary: true,
                source: 'spreadsheet_import',
                writtenAddress,
              },
            ],
          }
        : {}),
      displayName,
      email,
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
      phone,
    });
    if (!parsed.success) {
      throw new ContactImportError(`La fila ${index + 2} contiene datos inválidos.`, {
        issues: parsed.error.issues,
        row: index + 2,
      });
    }
    return parsed.data;
  });

  return customers;
}
