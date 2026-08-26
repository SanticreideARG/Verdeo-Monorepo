import { useCallback, useEffect, useState } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import {
  errorMessage,
  formatMoney,
  orderStatusLabel,
  type StatsOverview,
} from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface RankedRow {
  label: string;
  orderCount?: number;
  revenueMinor: number;
  secondary?: string;
}

/** A horizontal bar list ranked by revenue — each bar's width is relative to the top row in its
 * own list, not a shared scale across lists, since "por zona" and "por tamaño" have very
 * different magnitudes and forcing one scale would flatten the smaller list to nothing. */
function RankedList({ currency, rows }: { currency: string; rows: RankedRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.revenueMinor));
  if (rows.length === 0) return <p className="mt-3 text-sm text-ink-muted">Sin datos todavía.</p>;
  return (
    <ul className="mt-4 grid gap-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <strong className="text-forest">{row.label}</strong>
            <span className="text-ink-muted">
              {formatMoney(row.revenueMinor, currency)}
              {row.secondary ? ` · ${row.secondary}` : ''}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-forest/10">
            <div
              className="h-full rounded-full bg-forest/60"
              style={{ width: `${Math.max(4, (row.revenueMinor / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "Estadísticas": decision-making rollups over orders — global, por zona, por semana (ciclo) y
 * por tamaño. A cancelled order is excluded everywhere on the backend (never real demand), and the
 * date window defaults to open (all history) unless the operator narrows it. */
export function StatsPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [sites, setSites] = useState<{ displayName: string; id: string }[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [operatingSiteId, setOperatingSiteId] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const canRead = profile?.permissions.includes('stats.read') ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (operatingSiteId) params.set('operatingSiteId', operatingSiteId);
    const response = await apiRequest(`/api/v1/stats?${params.toString()}`);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      setLoading(false);
      return;
    }
    setOverview((await response.json()) as StatsOverview);
    setLoading(false);
  }, [from, operatingSiteId, to]);

  useEffect(() => {
    if (canRead) void load();
    else setLoading(false);
  }, [canRead, load]);

  useEffect(() => {
    if (!profile?.permissions.includes('sites.read')) return;
    void apiRequest('/api/v1/operating-sites')
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          items: { active: boolean; displayName: string; id: string }[];
        };
        setSites(body.items.filter((site) => site.active));
      })
      .catch(() => setSites([]));
  }, [profile?.permissions]);

  if (failed) return <DashboardFailed label="las estadísticas" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Estadísticas</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver esto.</p>
        </section>
      </DashboardShell>
    );
  }

  const currency = overview?.global.currency ?? 'ARS';

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Decisiones</p>
          <h1 className="text-2xl font-semibold text-forest">Estadísticas</h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-muted">
            Pedidos cancelados quedan afuera de todo lo que ves acá — nunca fueron demanda real. Sin
            filtro de fechas, es todo el historial.
          </p>
        </header>

        <form
          className="mt-6 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <label className="field">
            Desde
            <input
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
              type="date"
              value={from}
            />
          </label>
          <label className="field">
            Hasta
            <input
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
              type="date"
              value={to}
            />
          </label>
          {sites.length > 0 ? (
            <label className="field">
              Ciudad
              <select
                onChange={(event) => setOperatingSiteId(event.target.value)}
                value={operatingSiteId}
              >
                <option value="">Todas</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.displayName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button className="button button-secondary" type="submit">
            Aplicar
          </button>
          {from || to || operatingSiteId ? (
            <button
              className="button button-secondary"
              onClick={() => {
                setFrom('');
                setTo('');
                setOperatingSiteId('');
              }}
              type="button"
            >
              Limpiar filtros
            </button>
          ) : null}
        </form>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : overview ? (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <article className="operation-card">
                <p className="text-xs font-semibold uppercase text-ink-muted">Pedidos</p>
                <p className="mt-2 text-3xl font-semibold text-forest">
                  {overview.global.orderCount}
                </p>
              </article>
              <article className="operation-card">
                <p className="text-xs font-semibold uppercase text-ink-muted">Ingresos</p>
                <p className="mt-2 text-3xl font-semibold text-forest">
                  {formatMoney(overview.global.revenueMinor, currency)}
                </p>
              </article>
              <article className="operation-card">
                <p className="text-xs font-semibold uppercase text-ink-muted">Ticket promedio</p>
                <p className="mt-2 text-3xl font-semibold text-forest">
                  {formatMoney(overview.global.averageOrderValueMinor, currency)}
                </p>
              </article>
            </div>

            {overview.global.statusBreakdown.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {overview.global.statusBreakdown.map((row) => (
                  <span className="status-chip" key={row.status}>
                    {orderStatusLabel(row.status)}: {row.count}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              <article className="operation-card">
                <h2 className="text-lg font-semibold text-forest">Por zona</h2>
                <RankedList
                  currency={currency}
                  rows={overview.byZone.map((row) => ({
                    label: row.operatingSiteName,
                    revenueMinor: row.revenueMinor,
                    secondary: `${row.orderCount} pedido${row.orderCount === 1 ? '' : 's'}`,
                  }))}
                />
              </article>

              <article className="operation-card">
                <h2 className="text-lg font-semibold text-forest">Por semana</h2>
                <RankedList
                  currency={currency}
                  rows={overview.byCycle.map((row) => ({
                    label: row.cycleAlias,
                    revenueMinor: row.revenueMinor,
                    secondary: `${row.orderCount} pedido${row.orderCount === 1 ? '' : 's'}`,
                  }))}
                />
              </article>

              <article className="operation-card">
                <h2 className="text-lg font-semibold text-forest">Por tamaño</h2>
                <RankedList
                  currency={currency}
                  rows={overview.bySize.map((row) => ({
                    label: row.sizeName,
                    revenueMinor: row.revenueMinor,
                    secondary: `${row.units} unidad${row.units === 1 ? '' : 'es'}`,
                  }))}
                />
              </article>
            </div>
          </>
        ) : null}
      </section>
    </DashboardShell>
  );
}
