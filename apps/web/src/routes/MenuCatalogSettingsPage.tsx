import { useCallback, useEffect, useState } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { SettingsTabs } from '../components/SettingsTabs.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface SiteSetting {
  dietaryInstructionsEnabled: boolean;
  intuitivoEnabled: boolean;
  operatingSiteId: string;
  operatingSiteName: string;
}

/** "Ajustes → Menú personalizado": qué ofrece y qué pregunta el formulario de pedidos, decidido por
 * ciudad y no globalmente.
 *
 * Intuitivo: una ciudad que lo apaga simplemente no recibe la oferta componible cuando se distribuye
 * el menú (PostgresOperationsService.distributeMenu), diga lo que diga la semana maestra. Apagarlo
 * no toca ningún menú ya distribuido.
 *
 * Indicaciones alimentarias: si el formulario las pide. Vienen apagadas —se pidió sacarlas—; era un
 * texto libre que llegaba a cocina con cosas que no se pueden resolver por pedido, mientras que lo
 * que de verdad hace falta, que un cliente no coma algo, vive en las restricciones del cliente.
 * Apagarlas saca el campo de los formularios, no el dato de los pedidos que ya las tienen. */
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

  // Se manda sólo el tilde que se tocó: mandar los dos obligaría a esta pantalla a conocer el
  // valor del otro para no pisarlo.
  async function toggle(
    site: SiteSetting,
    field: 'dietaryInstructionsEnabled' | 'intuitivoEnabled',
  ) {
    setSavingSiteId(site.operatingSiteId);
    setMessage('');
    const response = await apiRequest(`/api/v1/menu-catalog/settings/${site.operatingSiteId}`, {
      body: JSON.stringify({ [field]: !site[field] }),
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
      <SettingsTabs permissions={profile.permissions} />
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Administración</p>
          <h1 className="text-2xl font-semibold text-forest">Menú personalizado</h1>
        </header>

        <p className="mt-3 max-w-xl text-sm text-ink-muted">
          Controlá por ciudad qué ofrece y qué pregunta el formulario de pedidos. No son
          interruptores únicos para todo el catálogo: cada operación tiene los suyos.
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
                    Intuitivo: {site.intuitivoEnabled ? 'habilitado' : 'deshabilitado'} ·
                    Indicaciones alimentarias:{' '}
                    {site.dietaryInstructionsEnabled ? 'se piden' : 'no se piden'}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="button button-secondary"
                      disabled={savingSiteId === site.operatingSiteId}
                      onClick={() => void toggle(site, 'intuitivoEnabled')}
                      type="button"
                    >
                      {site.intuitivoEnabled ? 'Deshabilitar Intuitivo' : 'Habilitar Intuitivo'}
                    </button>
                    <button
                      className="button button-secondary"
                      disabled={savingSiteId === site.operatingSiteId}
                      onClick={() => void toggle(site, 'dietaryInstructionsEnabled')}
                      type="button"
                    >
                      {site.dietaryInstructionsEnabled
                        ? 'No pedir indicaciones'
                        : 'Pedir indicaciones'}
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}
