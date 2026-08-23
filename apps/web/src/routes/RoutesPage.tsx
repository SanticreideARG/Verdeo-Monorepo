import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, formatMoney } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface RouteSummary {
  deliveryDate: string;
  id: string;
  label: string | null;
  operatingSiteId: string;
  publishedAt: string | null;
  status: 'draft' | 'published' | 'completed';
  stopCount: number;
}

interface RouteStop {
  assignedUserDisplayName: string | null;
  assignedUserId: string | null;
  customerDisplayName: string;
  deliveryAddress: string;
  id: string;
  orderId: string;
  paymentExpectation: string;
  publicNumber: string;
  sequence: number;
  status: string;
  totalMinor: number;
}

interface RouteDetail extends RouteSummary {
  stops: RouteStop[];
}

const STOP_STATUS_LABELS: Record<string, string> = {
  at_address: 'En el domicilio',
  delivered: 'Entregado',
  en_route: 'En camino',
  pending: 'Pendiente',
  skipped: 'Saltado',
};

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** "Rutas" (Operación): operators propose a route for a site+date — every CONFIRMED, geocoded
 * order due that day gets auto-sequenced by the route optimizer — then reorder/assign/publish it.
 * Nothing reaches the delivery app (`/delivery`) until publish (DELIVERY_AND_ROUTES.md:
 * "optimización asistida, decisión humana"). */
export function RoutesPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [sites, setSites] = useState<{ displayName: string; id: string }[]>([]);
  const [users, setUsers] = useState<{ displayName: string; id: string }[]>([]);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteDetail | null>(null);
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const canRead = profile?.permissions.includes('routes.read') ?? false;
  const canManage = profile?.permissions.includes('routes.manage') ?? false;
  const canPublish = profile?.permissions.includes('routes.publish') ?? false;

  const loadRoutes = useCallback(async () => {
    const response = await apiRequest('/api/v1/delivery/routes');
    if (response.ok) setRoutes(((await response.json()) as { items: RouteSummary[] }).items);
  }, []);

  const loadRouteDetail = useCallback(async (routeId: string) => {
    const response = await apiRequest(`/api/v1/delivery/routes/${routeId}`);
    if (response.ok) setSelectedRoute((await response.json()) as RouteDetail);
  }, []);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    void Promise.all([
      loadRoutes(),
      apiRequest('/api/v1/operating-sites').then(async (response) => {
        if (response.ok) {
          setSites(
            ((await response.json()) as { items: { displayName: string; id: string }[] }).items,
          );
        }
      }),
      apiRequest('/api/v1/users?limit=100').then(async (response) => {
        if (response.ok) {
          setUsers(
            ((await response.json()) as { items: { displayName: string; id: string }[] }).items,
          );
        }
      }),
    ]).finally(() => setLoading(false));
  }, [canRead, loadRoutes]);

  async function createRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const form = new FormData(event.currentTarget);
    const label = formText(form, 'label').trim();
    const response = await apiRequest('/api/v1/delivery/routes', {
      body: JSON.stringify({
        deliveryDate: formText(form, 'deliveryDate'),
        operatingSiteId: formText(form, 'operatingSiteId'),
        ...(label ? { label } : {}),
      }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const route = (await response.json()) as RouteDetail;
    event.currentTarget.reset();
    setFormOpen(false);
    await loadRoutes();
    setSelectedRoute(route);
  }

  async function publish(routeId: string) {
    const response = await apiRequest(`/api/v1/delivery/routes/${routeId}/publish`, {
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    await loadRoutes();
    await loadRouteDetail(routeId);
  }

  async function assign(stopId: string, assignedUserId: string) {
    if (!selectedRoute) return;
    const response = await apiRequest(`/api/v1/delivery/stops/${stopId}/assign`, {
      body: JSON.stringify({ assignedUserId: assignedUserId || null }),
      method: 'PATCH',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    await loadRouteDetail(selectedRoute.id);
  }

  async function move(index: number, direction: -1 | 1) {
    if (!selectedRoute) return;
    const stopIds = selectedRoute.stops.map((stop) => stop.id);
    const target = index + direction;
    if (target < 0 || target >= stopIds.length) return;
    [stopIds[index], stopIds[target]] = [stopIds[target]!, stopIds[index]!];
    const response = await apiRequest(`/api/v1/delivery/routes/${selectedRoute.id}/stops`, {
      body: JSON.stringify({ stopIds }),
      method: 'PUT',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    await loadRouteDetail(selectedRoute.id);
  }

  if (failed) return <DashboardFailed label="las rutas" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Rutas</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver rutas.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex items-center justify-between">
          <div>
            <p className="dashboard-kicker">Operación</p>
            <h1 className="text-2xl font-semibold text-forest">Rutas de reparto</h1>
          </div>
          {canManage ? (
            <button
              className="button button-secondary"
              onClick={() => setFormOpen((open) => !open)}
              type="button"
            >
              {formOpen ? 'Cancelar' : '+ Proponer ruta'}
            </button>
          ) : null}
        </header>

        {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}

        {formOpen ? (
          <form
            className="mt-6 grid gap-3 rounded-2xl border border-forest/10 bg-[var(--db-surface)] p-6 sm:grid-cols-3"
            onSubmit={(event) => void createRoute(event)}
          >
            <label className="field">
              Ciudad
              <select name="operatingSiteId" required>
                <option value="">Elegí una ciudad</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Fecha de entrega
              <input defaultValue={tomorrow()} name="deliveryDate" required type="date" />
            </label>
            <label className="field">
              Etiqueta (opcional)
              <input name="label" placeholder="Ej. Turno mañana" />
            </label>
            <button className="button button-primary sm:col-span-3" type="submit">
              Proponer ruta
            </button>
          </form>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-[0.35fr_0.65fr]">
            <ul className="grid gap-2">
              {routes.map((route) => (
                <li key={route.id}>
                  <button
                    className={`w-full rounded-xl border px-4 py-3 text-left ${
                      selectedRoute?.id === route.id
                        ? 'border-forest bg-forest/5'
                        : 'border-forest/10 bg-[var(--db-surface)]'
                    }`}
                    onClick={() => void loadRouteDetail(route.id)}
                    type="button"
                  >
                    <p className="font-semibold text-forest">
                      {route.deliveryDate} {route.label ? `· ${route.label}` : ''}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {route.stopCount} paradas ·{' '}
                      {route.status === 'draft'
                        ? 'Borrador'
                        : route.status === 'published'
                          ? 'Publicada'
                          : 'Completada'}
                    </p>
                  </button>
                </li>
              ))}
              {routes.length === 0 ? (
                <p className="text-ink-muted">Todavía no se propuso ninguna ruta.</p>
              ) : null}
            </ul>

            <div className="rounded-2xl border border-forest/10 bg-[var(--db-surface)] p-4">
              {!selectedRoute ? (
                <p className="text-ink-muted">Elegí una ruta para ver sus paradas.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-forest">
                      {selectedRoute.deliveryDate}{' '}
                      {selectedRoute.label ? `· ${selectedRoute.label}` : ''}
                    </p>
                    {canPublish && selectedRoute.status === 'draft' ? (
                      <button
                        className="button button-primary"
                        onClick={() => void publish(selectedRoute.id)}
                        type="button"
                      >
                        Publicar
                      </button>
                    ) : null}
                  </div>
                  <ol className="mt-4 grid gap-2">
                    {selectedRoute.stops.map((stop, index) => (
                      <li className="rounded-xl border border-forest/10 p-3" key={stop.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-forest">
                              {stop.sequence}. {stop.customerDisplayName} — {stop.publicNumber}
                            </p>
                            <p className="text-sm text-ink-muted">{stop.deliveryAddress}</p>
                            <p className="text-xs text-ink-muted">
                              {formatMoney(stop.totalMinor, 'ARS')} · {stop.paymentExpectation} ·{' '}
                              {STOP_STATUS_LABELS[stop.status] ?? stop.status}
                            </p>
                          </div>
                          {canManage ? (
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex gap-1">
                                <button
                                  className="button button-secondary"
                                  disabled={index === 0}
                                  onClick={() => void move(index, -1)}
                                  type="button"
                                >
                                  ↑
                                </button>
                                <button
                                  className="button button-secondary"
                                  disabled={index === selectedRoute.stops.length - 1}
                                  onClick={() => void move(index, 1)}
                                  type="button"
                                >
                                  ↓
                                </button>
                              </div>
                              <select
                                onChange={(event) => void assign(stop.id, event.target.value)}
                                value={stop.assignedUserId ?? ''}
                              >
                                <option value="">Sin asignar</option>
                                {users.map((user) => (
                                  <option key={user.id} value={user.id}>
                                    {user.displayName}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <p className="text-sm text-ink-muted">
                              {stop.assignedUserDisplayName ?? 'Sin asignar'}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                    {selectedRoute.stops.length === 0 ? (
                      <p className="text-ink-muted">
                        No hay pedidos confirmados y geocodificados para esa fecha y ciudad.
                      </p>
                    ) : null}
                  </ol>
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
