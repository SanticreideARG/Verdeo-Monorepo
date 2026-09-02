import * as XLSX from 'xlsx';

/**
 * Customer list → Excel, with the operator choosing which columns come along.
 *
 * The column catalog is the single source of truth for both ends: the dashboard renders its
 * checkboxes from `CUSTOMER_EXPORT_COLUMNS`, and the API validates the requested keys against the
 * same list, so a column can never be requested that this file does not know how to render.
 */

export interface CustomerExportRow {
  addressCity: string | null;
  addressCount: number;
  addressZone: string | null;
  createdAt: Date | string;
  displayName: string;
  email: string | null;
  firstName: string | null;
  geocodingStatus: string | null;
  id: string;
  internalNotes: string | null;
  lastName: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  phone: string | null;
  status: string;
  updatedAt: Date | string;
  whatsapp: string | null;
  writtenAddress: string | null;
}

interface CustomerExportColumn {
  /** Stable key the dashboard sends back; never localised. */
  key: string;
  /** Spanish header written into the sheet. */
  label: string;
  /** Grouping for the picker UI, so 30 checkboxes read as four short lists. */
  group: 'Identidad' | 'Contacto' | 'Domicilio' | 'Gestión';
  value: (row: CustomerExportRow) => string | number | null;
}

function isoDate(value: Date | string): string {
  return (value instanceof Date ? value.toISOString() : value).slice(0, 10);
}

export const CUSTOMER_EXPORT_COLUMNS: readonly CustomerExportColumn[] = [
  { group: 'Identidad', key: 'displayName', label: 'Nombre', value: (row) => row.displayName },
  { group: 'Identidad', key: 'firstName', label: 'Nombre de pila', value: (row) => row.firstName },
  { group: 'Identidad', key: 'lastName', label: 'Apellido', value: (row) => row.lastName },
  { group: 'Identidad', key: 'id', label: 'ID interno', value: (row) => row.id },
  { group: 'Contacto', key: 'phone', label: 'Teléfono', value: (row) => row.phone },
  { group: 'Contacto', key: 'whatsapp', label: 'WhatsApp', value: (row) => row.whatsapp },
  { group: 'Contacto', key: 'email', label: 'Email', value: (row) => row.email },
  {
    group: 'Domicilio',
    key: 'writtenAddress',
    label: 'Dirección',
    value: (row) => row.writtenAddress,
  },
  { group: 'Domicilio', key: 'addressCity', label: 'Localidad', value: (row) => row.addressCity },
  { group: 'Domicilio', key: 'addressZone', label: 'Zona', value: (row) => row.addressZone },
  {
    group: 'Domicilio',
    key: 'coordinates',
    label: 'Coordenadas',
    value: (row) =>
      row.latitude !== null && row.longitude !== null ? `${row.latitude}, ${row.longitude}` : null,
  },
  {
    group: 'Domicilio',
    key: 'geocodingStatus',
    label: 'Estado de ubicación',
    value: (row) => row.geocodingStatus,
  },
  {
    group: 'Domicilio',
    key: 'addressCount',
    label: 'Cantidad de domicilios',
    value: (row) => row.addressCount,
  },
  { group: 'Gestión', key: 'status', label: 'Estado', value: (row) => row.status },
  { group: 'Gestión', key: 'createdAt', label: 'Alta', value: (row) => isoDate(row.createdAt) },
  {
    group: 'Gestión',
    key: 'updatedAt',
    label: 'Última actualización',
    value: (row) => isoDate(row.updatedAt),
  },
  {
    group: 'Gestión',
    key: 'internalNotes',
    label: 'Notas internas',
    value: (row) => row.internalNotes,
  },
];

/** Sent to the dashboard so the picker never hardcodes a column list of its own. */
export const CUSTOMER_EXPORT_COLUMN_CATALOG = CUSTOMER_EXPORT_COLUMNS.map(
  ({ group, key, label }) => ({ group, key, label }),
);

export const DEFAULT_CUSTOMER_EXPORT_COLUMNS = [
  'displayName',
  'phone',
  'whatsapp',
  'email',
  'writtenAddress',
  'addressZone',
  'status',
];

export function buildCustomersExcel(
  rows: readonly CustomerExportRow[],
  columnKeys: readonly string[],
): Uint8Array {
  const selected = CUSTOMER_EXPORT_COLUMNS.filter((column) => columnKeys.includes(column.key));
  // An empty or fully-unknown selection would produce a sheet with no columns at all, which reads
  // as a broken export rather than an empty one — fall back to the sensible default instead.
  const columns =
    selected.length > 0
      ? selected
      : CUSTOMER_EXPORT_COLUMNS.filter((column) =>
          DEFAULT_CUSTOMER_EXPORT_COLUMNS.includes(column.key),
        );

  const sheetRows = rows.map((row) =>
    Object.fromEntries(columns.map((column) => [column.label, column.value(row) ?? ''])),
  );

  const workbook = XLSX.utils.book_new();
  // `header` pins the column order to the catalog order even when the first row has empty cells,
  // which json_to_sheet would otherwise drop from its inferred header.
  const sheet = XLSX.utils.json_to_sheet(sheetRows, {
    header: columns.map((column) => column.label),
  });
  sheet['!cols'] = columns.map((column) => ({ wch: Math.max(12, column.label.length + 2) }));
  XLSX.utils.book_append_sheet(workbook, sheet, 'Clientes');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
