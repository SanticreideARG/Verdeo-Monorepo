import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, type WeeklyMenu } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

type DistributionMode = 'CREATE_MISSING' | 'UPDATE_UNCUSTOMIZED' | 'REPLACE';

/** "Ver menús": the list of weekly menus with publish and per-city distribution. Creating a new
 * master menu happens in "Configurar la semana" instead. */
export function MenusPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const permissions = profile?.permissions ?? [];
  const [menus, setMenus] = useState<WeeklyMenu[]>([]);
  const [sites, setSites] = useState<{ displayName: string; id: string }[]>([]);
  const [distributionSites, setDistributionSites] = useState<string[]>([]);
  const [distributionMode, setDistributionMode] = useState<DistributionMode>('CREATE_MISSING');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadData = useCallback(async () => {
    if (!profile) return;
    const [menuResponse, siteResponse] = await Promise.all([
      profile.permissions.some((permission) =>
        ['orders.read', 'production.read'].includes(permission),
      )
        ? apiRequest('/api/v1/menus')
        : null,
      profile.permissions.includes('sites.read') ? apiRequest('/api/v1/operating-sites') : null,
    ]);
    if (menuResponse?.ok) {
      setMenus(((await menuResponse.json()) as { items: WeeklyMenu[] }).items);
    }
    if (siteResponse?.ok) {
      const loadedSites = (
        (await siteResponse.json()) as {
          items: { active: boolean; displayName: string; id: string }[];
        }
      ).items;
      setSites(loadedSites.filter((site) => site.active));
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void loadData().catch((error: unknown) => {
      setLoading(false);
      setMessage(error instanceof Error ? error.message : 'No pudimos cargar los menús.');
    });
  }, [loadData]);

  async function publish(menuId: string) {
    setMessage('');
    const response = await apiRequest(`/api/v1/menus/${menuId}/publish`, { method: 'POST' });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    await loadData();
  }

  async function distributeMenu(menuId: string) {
    if (
      distributionMode === 'REPLACE' &&
      !window.confirm(
        'Reemplazar sobrescribe los precios y platos que cada ciudad haya personalizado. ¿Continuar?',
      )
    )
      return;

    setMessage('');
    const response = await apiRequest(`/api/v1/menus/${menuId}/distribute`, {
      body: JSON.stringify({
        confirmedReplace: distributionMode === 'REPLACE',
        mode: distributionMode,
        operatingSiteIds: distributionSites,
      }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const results = (await response.json()) as { results: { outcome: string }[] };
    const created = results.results.filter((r) => r.outcome === 'CREATED').length;
    const skipped = results.results.filter((r) => r.outcome.startsWith('SKIPPED')).length;
    setMessage(
      `Distribución lista: ${created} creada(s), ${results.results.length - created - skipped} actualizada(s), ${skipped} omitida(s).`,
    );
    setDistributionSites([]);
    await loadData();
  }

  if (failed) return <DashboardFailed label="los menús" />;
  if (!profile) return <DashboardLoading />;

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="dashboard-kicker">Menús</p>
            <h1 className="text-2xl font-semibold text-forest">Ver menús</h1>
          </div>
          {permissions.includes('production.generate') ? (
            <Link className="button button-primary" to="/app/menus/nuevo">
              Configurar la semana
            </Link>
          ) : null}
        </header>

        {permissions.includes('production.generate') ? (
          <p className="mt-3">
            <Link className="text-sm underline" to="/app/menus/precios">
              Precios por ubicación →
            </Link>
          </p>
        ) : null}

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando menús…</p>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {menus.map((menu) => (
              <article className="operation-card" key={menu.id}>
                <div className="flex justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-forest">{menu.cycle.alias}</h3>
                    <p className="mt-1 text-sm text-ink-muted">
                      {menu.operatingSiteName ?? 'Global'} · {menu.offerings.length} opciones ·
                      revisión {menu.revision}
                    </p>
                  </div>
                  <span className="status-chip">{menu.status}</span>
                </div>
                {permissions.includes('production.generate') ? (
                  <Link
                    className="button button-secondary mt-5"
                    to={`/app/menus/${menu.id}/editar`}
                  >
                    Editar
                  </Link>
                ) : null}
                {menu.status === 'DRAFT' && permissions.includes('production.generate') ? (
                  <button
                    className="button button-primary mt-5"
                    onClick={() => void publish(menu.id)}
                  >
                    Publicar
                  </button>
                ) : null}
                {menu.operatingSiteId === null && permissions.includes('menus.distribute') ? (
                  <details className="mt-5">
                    <summary className="cursor-pointer text-sm font-semibold text-forest">
                      Distribuir por ciudad
                    </summary>
                    <p className="mt-2 text-sm text-ink-muted">
                      Crea una revisión propia en cada ciudad elegida. Lo que un operador ya
                      personalizó allá se conserva, salvo que reemplaces.
                    </p>
                    <div className="mt-3 grid gap-2">
                      {sites.map((site) => (
                        <label className="flex items-center gap-2 text-sm" key={site.id}>
                          <input
                            checked={distributionSites.includes(site.id)}
                            onChange={(event) =>
                              setDistributionSites((current) =>
                                event.target.checked
                                  ? [...current, site.id]
                                  : current.filter((id) => id !== site.id),
                              )
                            }
                            type="checkbox"
                          />
                          {site.displayName}
                        </label>
                      ))}
                      {sites.length === 0 ? (
                        <p className="text-sm text-ink-muted">
                          Todavía no hay ciudades configuradas.
                        </p>
                      ) : null}
                    </div>
                    <label className="field mt-3">
                      Modo
                      <select
                        onChange={(event) =>
                          setDistributionMode(event.target.value as DistributionMode)
                        }
                        value={distributionMode}
                      >
                        <option value="CREATE_MISSING">Sólo donde no exista</option>
                        <option value="UPDATE_UNCUSTOMIZED">Actualizar lo no personalizado</option>
                        {permissions.includes('menus.distribute_replace') ? (
                          <option value="REPLACE">Reemplazar personalizaciones</option>
                        ) : null}
                      </select>
                    </label>
                    <button
                      className="button button-secondary mt-3"
                      disabled={distributionSites.length === 0}
                      onClick={() => void distributeMenu(menu.id)}
                      type="button"
                    >
                      Distribuir
                    </button>
                  </details>
                ) : null}
              </article>
            ))}
            {menus.length === 0 ? (
              <p className="empty-state">Todavía no hay menús cargados.</p>
            ) : null}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
