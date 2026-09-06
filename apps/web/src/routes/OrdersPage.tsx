import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ColumnPicker } from '../components/ColumnPicker.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { DataTable } from '../components/DataTable.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, orderStatusLabel, type OrderSummary } from '../lib/operations.js';
import { ORDER_COLUMNS, readStoredColumns, writeStoredColumns } from '../lib/orderColumns.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

const STATUS_OPTIONS = ['DRAFT', 'CONFIRMED', 'READY', 'DELIVERED', 'CANCELLED'] as const;

/** Lo que se ve sin tocar nada: la fila de un pedido leída de un vistazo. */
const DEFAULT_COLUMNS = ['cliente', 'whatsapp', 'pedido', 'estado', 'total', 'entrega', 'numero'];

const COLUMNS_KEY = 'verdeo-orders-columns';

/** "Ver pedidos": browsing the full history, filterable by status, with a CSV export. No creation
 * or transition controls here — those live in "Tomar y confirmar pedidos".
 *
 * `?search=` deep-links a shared order reference here: the search matches its public number, so a
 * chat card can point at one order without a dedicated detail route. */
export function OrdersPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
    readStoredColumns(COLUMNS_KEY, DEFAULT_COLUMNS, ORDER_COLUMNS),
  );

  const load = useCallback(
    async (cursor?: string) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      if (cursor) params.set('cursor', cursor);
      const response = await apiRequest(`/api/v1/orders?${params.toString()}`);
      if (!response.ok) {
        setMessage(await errorMessage(response));
        return;
      }
      const body = (await response.json()) as { items: OrderSummary[]; nextCursor: string | null };
      setOrders((current) => (cursor ? [...current, ...body.items] : body.items));
      setNextCursor(body.nextCursor);
    },
    [search, status],
  );

  useEffect(() => {
    if (!profile?.permissions.includes('orders.read')) return;
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load, profile?.permissions]);

  async function exportCsv() {
    setMessage('');
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search.trim()) params.set('search', search.trim());
    const response = await apiRequest(`/api/v1/orders/export?${params.toString()}`);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'verdeo-pedidos.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  if (failed) return <DashboardFailed label="los pedidos" />;
  if (!profile) return <DashboardLoading />;

  if (!profile.permissions.includes('orders.read')) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Ver pedidos</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver pedidos.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="dashboard-kicker">Pedidos</p>
            <h1 className="text-2xl font-semibold text-forest">Ver pedidos</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="field">
              Buscar
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="N° de pedido o cliente"
                value={search}
              />
            </label>
            <label className="field">
              Estado
              <select onChange={(event) => setStatus(event.target.value)} value={status}>
                <option value="">Todos</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {orderStatusLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <ColumnPicker
              columns={ORDER_COLUMNS}
              onChange={(next) => {
                setVisibleColumns(next);
                writeStoredColumns(COLUMNS_KEY, next);
              }}
              visible={visibleColumns}
            />
            <button
              className="button button-secondary"
              onClick={() => void exportCsv()}
              type="button"
            >
              Exportar CSV
            </button>
          </div>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando pedidos…</p>
        ) : (
          <div className="mt-6 grid gap-3">
            {/*
             * Tabla en escritorio, una tarjeta por pedido en teléfono — lo resuelve DataTable con
             * las mismas columnas, así que elegir qué ver vale para las dos formas.
             */}
            <DataTable
              caption="Pedidos"
              columns={ORDER_COLUMNS.filter((column) => visibleColumns.includes(column.key))}
              empty="No hay pedidos para este filtro."
              rowKey={(order) => order.id}
              rows={orders}
            />
            {nextCursor ? (
              <button
                className="button button-secondary justify-self-center"
                onClick={() => void load(nextCursor)}
                type="button"
              >
                Cargar más
              </button>
            ) : null}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
