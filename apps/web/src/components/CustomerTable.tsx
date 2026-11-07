import { useState } from 'react';

import { ColumnPicker } from './ColumnPicker.js';
import { DataTable, type DataColumn } from './DataTable.js';
import { shortDate, sinceLabel } from '../lib/customerBrowse.js';
import { readStoredColumns, writeStoredColumns } from '../lib/orderColumns.js';
import { customerStatusLabel, formatMoney, type CustomerSummary } from '../lib/operations.js';
import { formatArgentinePhone, whatsappHref } from '../lib/phone.js';

const COLUMNS_KEY = 'verdeo-clientes-columnas';

const money = (amount: number | undefined, currency: string | null | undefined) =>
  formatMoney(amount ?? 0, currency ?? 'ARS');

function sum(rows: readonly CustomerSummary[], pick: (row: CustomerSummary) => number | undefined) {
  return rows.reduce((total, row) => total + (pick(row) ?? 0), 0);
}

/*
 * Las columnas de Clientes (2026-11-07). Se declaran una vez: de acá salen la tabla, las tarjetas
 * del teléfono y el selector de columnas.
 */
const CATALOGUE: readonly (DataColumn<CustomerSummary> & {
  defaultOn?: boolean;
  locked?: boolean;
})[] = [
  {
    defaultOn: true,
    key: 'cliente',
    label: 'Cliente',
    locked: true,
    primary: true,
    render: (row) => (
      <>
        {row.displayName}
        {row.isNew ? <span className="new-badge new-badge-inline">Nuevo</span> : null}
      </>
    ),
    sortValue: (row) => row.displayName,
    total: (rows) => `${String(rows.length)} cliente${rows.length === 1 ? '' : 's'}`,
  },
  {
    defaultOn: true,
    key: 'telefono',
    label: 'Teléfono / WhatsApp',
    render: (row) => {
      const number = row.whatsapp || row.phone;
      if (!number) return '—';
      return (
        <span className="crm-table-phone">
          {formatArgentinePhone(number)}
          <a
            className="crm-contact-whatsapp"
            href={whatsappHref(number)}
            onClick={(event) => event.stopPropagation()}
            rel="noopener noreferrer"
            target="_blank"
            title="Abrir el chat en WhatsApp"
          >
            WhatsApp ↗
          </a>
        </span>
      );
    },
  },
  { key: 'correo', label: 'Correo', render: (row) => row.email || '—' },
  { key: 'ciudad', label: 'Ciudad', render: (row) => row.siteName ?? '—' },
  {
    chip: true,
    defaultOn: true,
    key: 'zona',
    label: 'Zona',
    render: (row) => row.zoneName ?? '—',
    sortValue: (row) => row.zoneName ?? '',
  },
  {
    key: 'barrio',
    label: 'Barrio',
    render: (row) => row.neighborhoodName ?? '—',
    sortValue: (row) => row.neighborhoodName ?? '',
  },
  {
    defaultOn: true,
    key: 'estado',
    label: 'Estado',
    render: (row) => customerStatusLabel(row.status),
    sortValue: (row) => customerStatusLabel(row.status),
  },
  {
    defaultOn: true,
    emphasis: true,
    key: 'pedidos',
    label: 'Pedidos',
    render: (row) => String(row.orderCount ?? 0),
    sortValue: (row) => row.orderCount ?? 0,
    total: (rows) => String(sum(rows, (row) => row.orderCount)),
  },
  {
    defaultOn: true,
    key: 'ultimo',
    label: 'Último pedido',
    render: (row) =>
      row.lastOrderDate ? (
        <span title={shortDate(row.lastOrderDate)}>{sinceLabel(row.lastOrderDate)}</span>
      ) : (
        '—'
      ),
    sortValue: (row) => row.lastOrderDate ?? '',
  },
  {
    defaultOn: true,
    key: 'gastado',
    label: 'Total gastado',
    render: (row) => money(row.spentMinor, row.currency),
    sortValue: (row) => row.spentMinor ?? 0,
    total: (rows) =>
      money(
        sum(rows, (row) => row.spentMinor),
        rows[0]?.currency,
      ),
  },
  {
    defaultOn: true,
    key: 'deuda',
    label: 'Deuda',
    render: (row) =>
      row.debtMinor ? (
        <strong className="crm-table-debt">{money(row.debtMinor, row.currency)}</strong>
      ) : (
        '—'
      ),
    sortValue: (row) => row.debtMinor ?? 0,
    total: (rows) =>
      money(
        sum(rows, (row) => row.debtMinor),
        rows[0]?.currency,
      ),
  },
  {
    key: 'desde',
    label: 'Cliente desde',
    render: (row) => shortDate(row.createdAt),
    sortValue: (row) => row.createdAt,
  },
  { key: 'domicilio', label: 'Domicilio principal', render: (row) => row.primaryAddress ?? '—' },
  {
    key: 'ubicacion',
    label: 'Ubicación',
    render: (row) =>
      row.located === null || row.located === undefined
        ? 'Sin domicilio'
        : row.located
          ? 'Ubicado'
          : 'Falta ubicar',
    sortValue: (row) => (row.located === false ? 0 : row.located ? 2 : 1),
  },
];

const DEFAULT_COLUMNS = CATALOGUE.filter((column) => column.defaultOn).map((column) => column.key);

/** La vista Columnas de Clientes: la misma tabla que Pedidos, con su selector de columnas. */
export function CustomerTable({
  customers,
  empty,
  onOpen,
  selectedId,
}: {
  customers: readonly CustomerSummary[];
  empty: string;
  onOpen: (customer: CustomerSummary) => void;
  selectedId: string;
}) {
  const [visible, setVisible] = useState<string[]>(() =>
    readStoredColumns(COLUMNS_KEY, DEFAULT_COLUMNS, CATALOGUE),
  );
  const columns = CATALOGUE.filter((column) => visible.includes(column.key));

  return (
    <div className="crm-table">
      <div className="crm-table-tools">
        <span>Doble clic en una fila abre la ficha.</span>
        <ColumnPicker
          columns={CATALOGUE.map(({ key, label, locked }) => ({
            key,
            label,
            ...(locked ? { locked } : {}),
          }))}
          onChange={(next) => {
            setVisible(next);
            writeStoredColumns(COLUMNS_KEY, next);
          }}
          visible={visible}
        />
      </div>
      <DataTable
        caption="Clientes"
        columns={columns}
        empty={empty}
        narrowViewKey="verdeo-clientes-columnas-telefono"
        onRowSelect={onOpen}
        rowKey={(row) => row.id}
        rowTone={(row) => (row.id === selectedId ? 'en-curso' : undefined)}
        rows={customers}
      />
    </div>
  );
}
