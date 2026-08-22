import { useCallback, useEffect, useState } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, type KitchenSummary, type WeeklyMenu } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

export function KitchenPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [menus, setMenus] = useState<WeeklyMenu[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState('');
  const [kitchen, setKitchen] = useState<KitchenSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadMenus = useCallback(async () => {
    if (!profile?.permissions.includes('production.read')) {
      setLoading(false);
      return;
    }
    const response = await apiRequest('/api/v1/menus');
    if (response.ok) {
      const loadedMenus = ((await response.json()) as { items: WeeklyMenu[] }).items;
      setMenus(loadedMenus);
      setSelectedMenuId((current) => current || loadedMenus[0]?.id || '');
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void loadMenus();
  }, [loadMenus]);

  const selectedMenu = menus.find((menu) => menu.id === selectedMenuId) ?? null;

  async function generate() {
    if (!selectedMenu) return;
    try {
      const response = await apiRequest(`/api/v1/production/${selectedMenu.cycle.id}`);
      if (!response.ok) throw new Error(await errorMessage(response));
      setKitchen((await response.json()) as KitchenSummary);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos generar el consolidado.');
    }
  }

  if (failed) return <DashboardFailed label="la producción" />;
  if (!profile) return <DashboardLoading />;

  if (!profile.permissions.includes('production.read')) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Cocina</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver producción.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Cocina</p>
          <h1 className="text-2xl font-semibold text-forest">Consolidado determinista</h1>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando menús…</p>
        ) : (
          <>
            <div className="operation-card mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="field grow">
                Ciclo
                <select
                  onChange={(event) => setSelectedMenuId(event.target.value)}
                  value={selectedMenuId}
                >
                  <option value="">Seleccionar</option>
                  {menus.map((menu) => (
                    <option key={menu.id} value={menu.id}>
                      {menu.cycle.alias}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button button-primary"
                disabled={!selectedMenu}
                onClick={() => void generate()}
              >
                Generar salida
              </button>
            </div>

            {kitchen ? (
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <article className="operation-card">
                  <h3 className="text-xl font-semibold text-forest">Producción base</h3>
                  <div className="mt-4 grid gap-3">
                    {kitchen.base.map((item) => (
                      <div
                        className="border-b border-forest/10 pb-3"
                        key={`${item.familyName}-${item.variantName}`}
                      >
                        <div className="flex justify-between">
                          <span>
                            {item.familyName} {item.variantName}
                          </span>
                          <strong>{item.quantityUnits}</strong>
                        </div>
                        {item.exceptions.map((exception) => (
                          <p
                            className="mt-2 text-sm font-semibold text-red-800"
                            key={`${exception.orderPublicNumber}-${exception.dietaryInstructions.join('-')}`}
                          >
                            {exception.quantityUnits} ({exception.customerDisplayName} ·{' '}
                            {exception.orderPublicNumber}):{' '}
                            {exception.dietaryInstructions.join(' · ')}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </article>
                <article className="operation-card">
                  <h3 className="text-xl font-semibold text-forest">Intuitivos</h3>
                  <div className="mt-4 grid gap-4">
                    {kitchen.custom.map((item) => (
                      <div
                        className="border-b border-forest/10 pb-4"
                        key={`${item.orderPublicNumber}-${item.sequence}`}
                      >
                        <strong>
                          #{item.sequence} · {item.variantName} × {item.quantityUnits}
                        </strong>
                        <p className="mt-1 text-sm">
                          {item.customerDisplayName} ({item.orderPublicNumber})
                        </p>
                        <p className="mt-1 text-sm text-ink-muted">
                          {item.dishSelections.join(' · ')}
                        </p>
                        {item.dietaryInstructions.length ? (
                          <p className="mt-2 text-sm font-semibold text-red-800">
                            {item.dietaryInstructions.join(' · ')}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </article>
                <p className="text-right font-bold text-forest lg:col-span-2">
                  Total: {kitchen.totalUnits} unidades
                </p>
              </div>
            ) : (
              <p className="empty-state mt-6">
                Elegí un ciclo para calcular la producción desde pedidos confirmados.
              </p>
            )}
          </>
        )}
      </section>
    </DashboardShell>
  );
}
