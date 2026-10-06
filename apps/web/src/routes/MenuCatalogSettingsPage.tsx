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
  intuitivoExtraDishMinor: number;
  intuitivoMaxDishes: number;
  /** En diezmilésimos: 10000 es ×1, 9500 es ×0,95. */
  intuitivoPricingFactorBp: number;
  intuitivoPricingMode: 'coeficiente' | 'monto_fijo' | 'proporcional';
  intuitivoRoundingMinor: number;
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

  /** Guarda un campo de la ciudad. Mismo criterio que el tilde: sólo viaja lo que cambió. */
  async function save(site: SiteSetting, patch: Partial<SiteSetting>) {
    setSavingSiteId(site.operatingSiteId);
    setMessage('');
    const response = await apiRequest(`/api/v1/menu-catalog/settings/${site.operatingSiteId}`, {
      body: JSON.stringify(patch),
      method: 'PATCH',
    });
    setSavingSiteId(null);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setSites(((await response.json()) as { items: SiteSetting[] }).items);
  }

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
          <p className="dashboard-kicker">Panel de control</p>
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
                className="catalog-site-card rounded-2xl border border-forest/10 bg-[var(--db-surface)] p-6"
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

                {/*
                  La regla del Intuitivo de más platos.

                  Sólo cuando el Intuitivo está habilitado: configurar cómo se cobra algo que la
                  ciudad no ofrece es un formulario que no significa nada.
                */}
                {canManage && site.intuitivoEnabled ? (
                  <div className="catalog-pricing">
                    <p>
                      Intuitivo de más platos: hasta <b>{site.intuitivoMaxDishes}</b> por vianda. El
                      precio del tamaño no se toca; lo que pasa de ahí se propone así.
                    </p>
                    <div className="catalog-pricing-fields">
                      <label className="field">
                        Máximo de platos
                        {/* Se guarda al salir del campo y no en cada tecla: escribir "15" pasa por
                            "1", y guardar eso dejaría la ciudad en un máximo de un plato. */}
                        <input
                          defaultValue={site.intuitivoMaxDishes}
                          max={50}
                          min={1}
                          onBlur={(event) =>
                            void save(site, { intuitivoMaxDishes: Number(event.target.value) })
                          }
                          type="number"
                        />
                      </label>
                      <label className="field">
                        Cómo se cobra
                        <select
                          onChange={(event) =>
                            void save(site, {
                              intuitivoPricingMode: event.target
                                .value as SiteSetting['intuitivoPricingMode'],
                            })
                          }
                          value={site.intuitivoPricingMode}
                        >
                          <option value="proporcional">Proporcional por plato</option>
                          <option value="coeficiente">Proporcional por un coeficiente</option>
                          <option value="monto_fijo">Un monto fijo por plato extra</option>
                        </select>
                      </label>
                      {site.intuitivoPricingMode === 'coeficiente' ? (
                        <label className="field">
                          Coeficiente
                          <input
                            defaultValue={site.intuitivoPricingFactorBp / 10_000}
                            max={10}
                            min={0.01}
                            onBlur={(event) =>
                              void save(site, {
                                intuitivoPricingFactorBp: Math.round(
                                  Number(event.target.value) * 10_000,
                                ),
                              })
                            }
                            step={0.01}
                            type="number"
                          />
                          <small className="field-hint">0,95 cobra un 5% menos por plato.</small>
                        </label>
                      ) : null}
                      {site.intuitivoPricingMode === 'monto_fijo' ? (
                        <label className="field">
                          Por cada plato extra
                          <input
                            defaultValue={site.intuitivoExtraDishMinor / 100}
                            min={0}
                            onBlur={(event) =>
                              void save(site, {
                                intuitivoExtraDishMinor: Math.round(
                                  Number(event.target.value) * 100,
                                ),
                              })
                            }
                            type="number"
                          />
                          <small className="field-hint">En pesos.</small>
                        </label>
                      ) : null}
                      <label className="field">
                        Redondeo
                        <select
                          onChange={(event) =>
                            void save(site, {
                              intuitivoRoundingMinor: Number(event.target.value),
                            })
                          }
                          value={site.intuitivoRoundingMinor}
                        >
                          <option value={0}>Sin redondeo</option>
                          <option value={10_000}>Al cien más cercano</option>
                          <option value={50_000}>Al quinientos más cercano</option>
                          <option value={100_000}>Al mil más cercano</option>
                        </select>
                      </label>
                    </div>
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
