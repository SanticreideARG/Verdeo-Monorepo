import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, formatMoney, type WeeklyMenu } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';
import { showToast } from '../lib/toast.js';

/** "Precios por ubicación": cada ciudad ya tiene su propio precio por tamaño desde la distribución
 * del menú (`weekly_menu_prices`, per site) — esta pantalla junta esa información y permite
 * editarla directamente. Un precio editado acá queda marcado `customized`, así que una futura
 * distribución sin "Reemplazar" nunca lo pisa (mismo criterio que ya protege los platos
 * personalizados de un menú regional).
 *
 * **Sólo el período en curso.** Antes mostraba una tarjeta por ciudad y por período, así que la
 * pantalla ofrecía editar el precio de semanas ya cobradas: seis tarjetas donde había dos ciudades.
 * El precio de una semana cerrada no es un dato editable, es lo que se cobró —los pedidos ya
 * guardaron el suyo—, y cambiarlo no corrige nada de lo vendido: sólo hace que el informe de una
 * semana vieja cambie solo. El servidor rechaza igual un período cerrado; esto es que la pantalla
 * no lo ofrezca. */
export function PriceByLocationPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [menus, setMenus] = useState<WeeklyMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const canManage = profile?.permissions.includes('production.generate') ?? false;

  useEffect(() => {
    if (!profile?.permissions.includes('production.read')) {
      setLoading(false);
      return;
    }
    void apiRequest('/api/v1/menus')
      .then(async (response) => {
        if (response.ok) {
          setMenus(((await response.json()) as { items: WeeklyMenu[] }).items);
        }
      })
      .finally(() => setLoading(false));
  }, [profile]);

  function startEdit(
    menuId: string,
    sizes: [string, { currency: string; unitPriceMinor: number }][],
  ) {
    setEditingMenuId(menuId);
    setMessage('');
    const next: Record<string, string> = {};
    for (const [sizeName, price] of sizes) {
      next[`${menuId}:${sizeName}`] = String(price.unitPriceMinor / 100);
    }
    setDrafts((current) => ({ ...current, ...next }));
  }

  async function saveMenu(menuId: string, sizeNames: string[]) {
    const prices = sizeNames.map((sizeName) => ({
      sizeName,
      unitPriceMinor: Math.round(Number(drafts[`${menuId}:${sizeName}`] ?? '0') * 100),
    }));
    if (
      prices.some((price) => !Number.isFinite(price.unitPriceMinor) || price.unitPriceMinor < 0)
    ) {
      setMessage('Revisá los precios cargados.');
      return;
    }
    setSaving(true);
    setMessage('');
    const response = await apiRequest(`/api/v1/menus/${menuId}/prices`, {
      body: JSON.stringify({ prices }),
      method: 'PATCH',
    });
    setSaving(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const updated = (await response.json()) as WeeklyMenu;
    setMenus((current) => current.map((menu) => (menu.id === updated.id ? updated : menu)));
    setEditingMenuId(null);
    showToast('Precios actualizados.');
  }

  if (failed) return <DashboardFailed label="los precios por ubicación" />;
  if (!profile) return <DashboardLoading />;

  if (!profile.permissions.includes('production.read')) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Precios por ubicación</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver esto.</p>
        </section>
      </DashboardShell>
    );
  }

  /*
   * El período actual, y nada más.
   *
   * Hay uno abierto por vez, así que ése manda. Cuando todavía no se abrió ninguno —la semana que
   * se está armando— vale el más reciente sin cerrar: ahí es justamente cuando se cargan los
   * precios. Lo cerrado nunca aparece.
   */
  const currentCycle = menus
    .filter((menu) => menu.cycle.status !== 'CLOSED')
    .sort((a, b) => {
      if (a.cycle.status !== b.cycle.status) return a.cycle.status === 'OPEN' ? -1 : 1;
      return b.cycle.openAt.localeCompare(a.cycle.openAt);
    })[0]?.cycle;
  const regionalMenus = menus
    .filter((menu) => menu.operatingSiteId !== null && menu.cycle.id === currentCycle?.id)
    .sort((a, b) => (a.operatingSiteName ?? '').localeCompare(b.operatingSiteName ?? ''));
  const sizesBySite = regionalMenus.map((menu) => {
    const bySize = new Map<string, { currency: string; unitPriceMinor: number }>();
    for (const offering of menu.offerings) {
      if (!bySize.has(offering.sizeName)) {
        bySize.set(offering.sizeName, {
          currency: offering.currency,
          unitPriceMinor: offering.unitPriceMinor,
        });
      }
    }
    return { menu, sizes: [...bySize.entries()] };
  });

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="dashboard-kicker">Menús</p>
            <h1 className="text-2xl font-semibold text-forest">Precios por ubicación</h1>
          </div>
          <Link className="button button-secondary" to="/app/menus">
            Periodos
          </Link>
        </header>

        <p className="mt-3 max-w-xl text-sm text-ink-muted">
          Cada ciudad tiene su propio precio por tamaño desde la distribución del menú.
          {canManage ? ' Editalo directamente desde acá.' : ''} Sólo el período en curso: el precio
          de una semana cerrada es lo que ya se cobró.
        </p>

        {currentCycle ? (
          <p className="mt-4 text-sm font-semibold text-forest">
            Período {currentCycle.alias}
            {currentCycle.status === 'OPEN' ? '' : ' · sin abrir todavía'}
          </p>
        ) : null}

        {message ? (
          <p className="screen-notice mt-4" role="alert">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : sizesBySite.length === 0 ? (
          <p className="mt-6 text-ink-muted">
            {currentCycle === undefined
              ? 'No hay ningún período en curso. Creá uno desde Períodos para poder cargar precios.'
              : `Ninguna ciudad tiene distribuido el menú de ${currentCycle.alias} todavía.`}
          </p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {sizesBySite.map(({ menu, sizes }) => {
              const isEditing = editingMenuId === menu.id;
              return (
                <article
                  className="rounded-2xl border border-forest/10 bg-[var(--db-surface)] p-6"
                  key={menu.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* El período ya está dicho arriba, una vez: repetirlo en cada tarjeta era
                        lo que hacía ver seis tarjetas donde hay dos ciudades. */}
                    <p className="font-semibold text-forest">{menu.operatingSiteName}</p>
                    {canManage && !isEditing ? (
                      <button
                        className="button button-secondary"
                        onClick={() => startEdit(menu.id, sizes)}
                        type="button"
                      >
                        Editar
                      </button>
                    ) : null}
                  </div>

                  {isEditing ? (
                    <div className="mt-3 grid gap-2">
                      {sizes.map(([sizeName]) => (
                        <label
                          className="flex items-center justify-between gap-3 text-sm"
                          key={sizeName}
                        >
                          <span>{sizeName}</span>
                          <input
                            className="w-32 text-right"
                            min="0"
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [`${menu.id}:${sizeName}`]: event.target.value,
                              }))
                            }
                            step="0.01"
                            type="number"
                            value={drafts[`${menu.id}:${sizeName}`] ?? ''}
                          />
                        </label>
                      ))}
                      <div className="mt-2 flex gap-2">
                        <button
                          className="button button-primary"
                          disabled={saving}
                          onClick={() =>
                            void saveMenu(
                              menu.id,
                              sizes.map(([sizeName]) => sizeName),
                            )
                          }
                          type="button"
                        >
                          {saving ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button
                          className="button button-secondary"
                          disabled={saving}
                          onClick={() => setEditingMenuId(null)}
                          type="button"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <ul className="mt-3 grid gap-1 text-sm">
                      {sizes.map(([sizeName, price]) => (
                        <li className="flex justify-between" key={sizeName}>
                          <span>{sizeName}</span>
                          <span className="font-semibold">
                            {formatMoney(price.unitPriceMinor, price.currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
