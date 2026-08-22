import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, formatMoney, type OrderSummary } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

const STATUS_OPTIONS = ['DRAFT', 'CONFIRMED', 'READY', 'DELIVERED', 'CANCELLED'] as const;

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
                    {option}
                  </option>
                ))}
              </select>
            </label>
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
            {orders.map((order) => (
              <article className="operation-card" key={order.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <strong className="text-xl text-forest">{order.publicNumber}</strong>
                    <span className="status-chip">{order.status}</span>
                  </div>
                  <p className="font-semibold">{formatMoney(order.totalMinor, order.currency)}</p>
                </div>
                <p className="mt-2 text-sm text-ink-muted">
                  {order.customer.displayName} ·{' '}
                  {new Intl.DateTimeFormat('es-AR').format(new Date(order.deliveryDate))}
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  {order.items
                    .map(
                      (item) => `${item.productName} ${item.variantName} × ${item.quantityUnits}`,
                    )
                    .join(', ')}
                </p>
              </article>
            ))}
            {orders.length === 0 ? (
              <p className="empty-state">No hay pedidos para este filtro.</p>
            ) : null}
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
