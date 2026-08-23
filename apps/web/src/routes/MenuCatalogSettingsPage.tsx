import { useCallback, useEffect, useState } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface SiteSetting {
  intuitivoEnabled: boolean;
  operatingSiteId: string;
  operatingSiteName: string;
}

/** "Ajustes → Menú personalizado": whether Intuitivo can be offered, decided per operation, not
 * globally -- a city that turns it off simply never receives the composable offering when a menu
 * is distributed to it (PostgresOperationsService.distributeMenu), regardless of what the master
 * week includes. Turning it off doesn't touch any menu already distributed. */
export function MenuCatalogSettingsPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [sites, setSites] = useState<SiteSetting[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingSiteId, setSavingSiteId] = useState<string | null>(null);

  const canManage = profile?.permissions.includes('production.generate') ?? false;
  const canRead = canManage || (profile?.permissions.includes('production.read') ?? false);

  const load = useCallback(async () => {
    const response = await apiRequest('/api/v1/menu-catalog/settings');
    if (response.ok) {
      setSites(((await response.json()) as { items: SiteSetting[] }).items);
    }
  }, []);

  useEffect(() => {
    if (canRead) void load().finally(() => setLoading(false));
    else setLoading(false);
  }, [canRead, load]);

  async function toggle(site: SiteSetting) {
    setSavingSiteId(site.operatingSiteId);
    setMessage('');
    const response = await apiRequest(`/api/v1/menu-catalog/settings/${site.operatingSiteId}`, {
      body: JSON.stringify({ intuitivoEnabled: !site.intuitivoEnabled }),
      method: 'PATCH',
    });
    setSavingSiteId(null);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setSites(((await response.json()) as { items: SiteSetting[] }).items);
  }

  if (failed) return <DashboardFailed label="el menú personalizado" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Menú personalizado</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver esto.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Administración</p>
          <h1 className="text-2xl font-semibold text-forest">Menú personalizado</h1>
        </header>

        <p className="mt-3 max-w-xl text-sm text-ink-muted">
          Controlá por ciudad si Intuitivo -- la variedad donde el cliente elige cinco platos del
          universo publicado esa semana -- puede ofrecerse. No es un interruptor único para todo el
          catálogo: cada operación tiene el suyo, y se aplica cuando se distribuye el menú a esa
          ciudad.
        </p>

        {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : sites.length === 0 ? (
          <p className="mt-6 text-ink-muted">No hay operaciones activas.</p>
        ) : (
          <ul className="mt-6 grid gap-3">
            {sites.map((site) => (
              <li
                key={site.operatingSiteId}
                className="flex items-center justify-between rounded-2xl border border-forest/10 bg-[var(--db-surface)] p-6"
              >
                <div>
                  <p className="font-semibold text-forest">{site.operatingSiteName}</p>
                  <p className="text-sm text-ink-muted">
                    {site.intuitivoEnabled ? 'Habilitado' : 'Deshabilitado'}
                  </p>
                </div>
                {canManage ? (
                  <button
                    className="button button-primary"
                    disabled={savingSiteId === site.operatingSiteId}
                    onClick={() => void toggle(site)}
                    type="button"
                  >
                    {savingSiteId === site.operatingSiteId
                      ? 'Guardando…'
                      : site.intuitivoEnabled
                        ? 'Deshabilitar'
                        : 'Habilitar'}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}
