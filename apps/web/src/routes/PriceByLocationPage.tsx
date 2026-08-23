import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { formatMoney, type WeeklyMenu } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

/** "Precios por ubicación": read-only overview of the price each operation is currently charging
 * per tamaño, for the week that operation has distributed. Prices are already stored per site
 * (each city's distributed menu carries its own `weekly_menu_prices`, customizable via
 * `distributeMenu`'s REPLACE mode) — this screen surfaces that, it doesn't add a new pricing
 * model. Editing controls are a deliberate placeholder for now; ver qué necesita ese flujo antes
 * de construirlo (por tamaño global vs. por variedad vs. por zona dentro de una ciudad). */
export function PriceByLocationPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [menus, setMenus] = useState<WeeklyMenu[]>([]);
  const [loading, setLoading] = useState(true);

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

  const regionalMenus = menus
    .filter((menu) => menu.operatingSiteId !== null)
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
            Ver menús
          </Link>
        </header>

        <p className="mt-3 max-w-xl text-sm text-ink-muted">
          Vista inicial, solo lectura. Cada ciudad ya puede tener su propio precio por tamaño desde
          la distribución del menú — acá se junta esa información en un solo lugar. La edición
          directa desde esta pantalla queda para una siguiente vuelta.
        </p>

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : sizesBySite.length === 0 ? (
          <p className="mt-6 text-ink-muted">
            Ninguna operación tiene un menú distribuido todavía.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {sizesBySite.map(({ menu, sizes }) => (
              <article
                className="rounded-2xl border border-forest/10 bg-[var(--db-surface)] p-6"
                key={menu.id}
              >
                <p className="font-semibold text-forest">{menu.operatingSiteName}</p>
                <p className="text-xs text-ink-muted">{menu.cycle.alias}</p>
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
              </article>
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
