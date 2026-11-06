import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { SettingsTabs } from '../components/SettingsTabs.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface ArchivedCustomer {
  createdAt: string;
  displayName: string;
  id: string;
}

/**
 * Los clientes archivados (2026-11-05).
 *
 * Un archivado ya no sale en ninguna lista de clientes ni en los buscadores: sólo acá, con el
 * permiso `customers.view_archived`, que no viene con ningún rol. Desde la ficha se reactiva
 * cambiándole el estado.
 */
export function ArchivedCustomersPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const canView = profile?.permissions.includes('customers.view_archived') ?? false;
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ArchivedCustomer[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async (query: string, cursor?: string) => {
    setLoading(true);
    setMessage('');
    const params = new URLSearchParams({ limit: '50', status: 'archived' });
    if (query) params.set('search', query);
    if (cursor) params.set('cursor', cursor);
    const response = await apiRequest(`/api/v1/customers?${params.toString()}`);
    setLoading(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const page = (await response.json()) as {
      items: ArchivedCustomer[];
      nextCursor: string | null;
    };
    setItems((current) => (cursor ? [...current, ...page.items] : page.items));
    setNextCursor(page.nextCursor);
  }, []);

  // La búsqueda sale sola al dejar de escribir, como en Clientes.
  useEffect(() => {
    if (!canView) return;
    const timer = window.setTimeout(() => void load(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [canView, load, search]);

  if (failed) return <DashboardFailed label="los clientes archivados" />;
  if (!profile) return <DashboardLoading />;

  if (!canView) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Clientes archivados</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver esto.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <SettingsTabs permissions={profile.permissions} />
        <header>
          <p className="dashboard-kicker">Panel de control</p>
          <h1 className="text-2xl font-semibold text-forest">Clientes archivados</h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-muted">
            Los archivados no aparecen en la lista de Clientes ni en los buscadores de pedidos. Su
            historial se conserva. Para reactivar uno, abrí su ficha y cambiale el estado a activo.
          </p>
        </header>

        <label className="field mt-4 max-w-md">
          Buscar
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre, teléfono o correo"
            type="search"
            value={search}
          />
        </label>

        {message ? <p className="mt-3 text-sm text-danger">{message}</p> : null}

        <ul className="archived-customers mt-4">
          {items.map((customer) => (
            <li key={customer.id}>
              <Link to={`/app/clientes?customerId=${customer.id}`}>{customer.displayName}</Link>
              <small>Alta {new Date(customer.createdAt).toLocaleDateString('es-AR')}</small>
            </li>
          ))}
        </ul>
        {!loading && items.length === 0 ? (
          <p className="mt-3 text-ink-muted">
            {search.trim()
              ? 'Ningún archivado coincide con la búsqueda.'
              : 'No hay clientes archivados.'}
          </p>
        ) : null}
        {nextCursor ? (
          <button
            className="button button-secondary mt-3"
            disabled={loading}
            onClick={() => void load(search.trim(), nextCursor)}
            type="button"
          >
            {loading ? 'Cargando…' : 'Ver más'}
          </button>
        ) : null}
      </section>
    </DashboardShell>
  );
}
