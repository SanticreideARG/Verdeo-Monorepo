import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { AnalysisTabs } from '../components/AnalysisTabs.js';
import { DeskWorkNotice } from '../components/DeskWorkNotice.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { StatsAccountingTable, totalsOf } from '../components/StatsAccountingTable.js';
import { DonutChart, MetricCard, PeriodBarsChart, TrendChart } from '../components/StatsCharts.js';
import { StatsEventsFeed } from '../components/StatsEventsFeed.js';
import { StatsHeroCarousel, type StatsSlide } from '../components/StatsHeroCarousel.js';
import { apiRequest } from '../lib/api.js';
import {
  errorMessage,
  formatMoney,
  orderStatusLabel,
  type StatsEvent,
  type StatsOverview,
  type StatsPeriods,
} from '../lib/operations.js';
import { mixSegments, periodPoints } from '../lib/statsPeriods.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

/**
 * The window of the same length immediately before [from, to] — what "vs. período anterior" means.
 * Comparing a week against the week before it (rather than against a fixed calendar month) is what
 * makes the delta honest: same number of days, same weekday mix.
 */
function precedingWindow(from: string, to: string): { from: string; to: string } {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const spanDays = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const previousEnd = new Date(start.getTime() - DAY_MS);
  const previousStart = new Date(previousEnd.getTime() - (spanDays - 1) * DAY_MS);
  return {
    from: previousStart.toISOString().slice(0, 10),
    to: previousEnd.toISOString().slice(0, 10),
  };
}

/**
 * "Estadísticas" (STATS_REDESIGN_PLAN.md): los indicadores arriba, un carrusel de gráficos con "Lo
 * que pasó" al lado, la demanda y abajo el análisis contable por período y ciudad. Un cancelado no
 * suma en ningún lado (nunca fue demanda real) y sin fechas es todo el historial.
 */
export function StatsPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [sites, setSites] = useState<{ displayName: string; id: string }[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [operatingSiteId, setOperatingSiteId] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [previous, setPrevious] = useState<StatsOverview | null>(null);
  const [periods, setPeriods] = useState<StatsPeriods | null>(null);
  const [events, setEvents] = useState<StatsEvent[] | null>(null);

  const canRead = profile?.permissions.includes('stats.read') ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    const query = (range: { from: string; to: string }) => {
      const params = new URLSearchParams();
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
      if (operatingSiteId) params.set('operatingSiteId', operatingSiteId);
      return params.toString();
    };

    const [response, periodsResponse] = await Promise.all([
      apiRequest(`/api/v1/stats?${query({ from, to })}`),
      apiRequest(`/api/v1/stats/periods?${query({ from, to })}`),
    ]);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      setLoading(false);
      return;
    }
    setOverview((await response.json()) as StatsOverview);
    setPeriods(periodsResponse.ok ? ((await periodsResponse.json()) as StatsPeriods) : null);

    // Con un rango cerrado se compara solo contra el anterior del mismo largo; con uno abierto no
    // hay "anterior" que espejar.
    const previousWindow = from && to ? precedingWindow(from, to) : null;
    if (previousWindow) {
      const previousResponse = await apiRequest(`/api/v1/stats?${query(previousWindow)}`);
      setPrevious(previousResponse.ok ? ((await previousResponse.json()) as StatsOverview) : null);
    } else {
      setPrevious(null);
    }
    setLoading(false);
  }, [from, operatingSiteId, to]);

  useEffect(() => {
    if (canRead) void load();
    else setLoading(false);
  }, [canRead, load]);

  // "Lo que pasó" mira el período en curso: depende de la ciudad, no de las fechas.
  useEffect(() => {
    if (!canRead) return;
    setEvents(null);
    const params = operatingSiteId ? `?operatingSiteId=${operatingSiteId}` : '';
    void apiRequest(`/api/v1/stats/events${params}`)
      .then(async (response) =>
        setEvents(response.ok ? ((await response.json()) as { items: StatsEvent[] }).items : []),
      )
      .catch(() => setEvents([]));
  }, [canRead, operatingSiteId]);

  async function downloadAccounting() {
    const params = new URLSearchParams({ format: 'xlsx' });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (operatingSiteId) params.set('operatingSiteId', operatingSiteId);
    const response = await apiRequest(`/api/v1/stats/periods?${params.toString()}`);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = 'analisis-contable.xlsx';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

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
    // La entrada "Estadísticas" del menú también lleva a Encuestas: quien sólo ve encuestas (el
    // operador) llega directo ahí, en vez de a un "no tenés permiso".
    if (profile.permissions.includes('surveys.read'))
      return <Navigate replace to="/app/encuestas" />;
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
  const totals = periods ? totalsOf(periods.rows) : null;
  const points = periods ? periodPoints(periods) : [];
  const mix = periods
    ? mixSegments(periods, points)
    : new Map<string, { label: string; value: number }[]>();
  const money = (minor: number) => formatMoney(minor, currency);
  const slides: StatsSlide[] = overview
    ? [
        {
          content: <TrendChart currency={currency} points={overview.byDay} />,
          key: 'ingresos',
          subtitle: 'Lo vendido cada día de entrega.',
          title: 'Ingresos por fecha de entrega',
        },
        {
          content: (
            <PeriodBarsChart
              bars={points.map((point) => ({
                caption: `${point.orderCount} ped.`,
                label: point.label,
                segments: [{ label: 'Vendido', value: point.netMinor }],
              }))}
              formatValue={money}
              title="Ventas por período"
            />
          ),
          key: 'periodos',
          subtitle: 'Neto vendido de cada período, con la cantidad de pedidos.',
          title: 'Ventas por período',
        },
        {
          content: (
            <PeriodBarsChart
              bars={points.map((point) => ({
                caption:
                  point.netMinor > 0
                    ? `${Math.round((point.paidMinor / point.netMinor) * 100)}%`
                    : '',
                label: point.label,
                segments: [
                  { label: 'Cobrado', value: point.paidMinor },
                  { label: 'Por cobrar', value: point.pendingMinor },
                ],
              }))}
              formatValue={money}
              title="Cobrado y por cobrar"
            />
          ),
          key: 'cobro',
          subtitle: 'Arriba de cada barra, qué parte ya se cobró.',
          title: 'Cobrado y por cobrar',
        },
        {
          content: (
            <PeriodBarsChart
              bars={points.map((point) => ({
                caption: String(point.customerCount),
                label: point.label,
                segments: [
                  { label: 'Recurrentes', value: point.customerCount - point.newCustomerCount },
                  { label: 'Nuevos', value: point.newCustomerCount },
                ],
              }))}
              formatValue={(value) => `${value} clientes`}
              title="Clientes nuevos y recurrentes"
            />
          ),
          key: 'clientes',
          subtitle: `Nuevo es el primer pedido de su historia. Recurrencia: ${overview.global.ordersPerCustomer.toFixed(2)} pedidos por cliente.`,
          title: 'Clientes nuevos y recurrentes',
        },
        {
          content: (
            <PeriodBarsChart
              bars={points.map((point) => ({
                label: point.label,
                segments: mix.get(point.salesCycleId) ?? [],
              }))}
              formatValue={(value) => `${value} u.`}
              normalize
              title="Mezcla de menús por período"
            />
          ),
          key: 'mezcla',
          subtitle: 'Qué parte de las unidades se llevó cada menú.',
          title: 'Mezcla de menús por período',
        },
      ]
    : [];

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <DeskWorkNotice can="podés mirar los totales; comparar períodos necesita los gráficos completos." />
      <AnalysisTabs permissions={profile.permissions} />
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Decisiones</p>
          <h1 className="text-2xl font-semibold text-forest">Estadísticas</h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-muted">
            Pedidos cancelados quedan afuera de todo lo que ves acá — nunca fueron demanda real. Sin
            filtro de fechas, es todo el historial; con desde y hasta, cada indicador se compara con
            el mismo largo de tiempo justo antes.
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
          <p className="screen-notice mt-5" role="alert">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : overview ? (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                label="Pedidos"
                previous={previous?.global.orderCount}
                value={String(overview.global.orderCount)}
                valueNumber={overview.global.orderCount}
              />
              <MetricCard
                label="Vendido"
                previous={previous?.global.revenueMinor}
                value={formatMoney(overview.global.revenueMinor, currency)}
                valueNumber={overview.global.revenueMinor}
              />
              <MetricCard
                hint={`${formatMoney(totals?.pendingMinor ?? 0, currency)} por cobrar`}
                label="Cobrado"
                value={
                  totals && totals.netMinor > 0
                    ? `${Math.round((totals.paidMinor / totals.netMinor) * 100)}%`
                    : '—'
                }
                valueNumber={0}
              />
              <MetricCard
                label="Ticket promedio"
                previous={previous?.global.averageOrderValueMinor}
                value={formatMoney(overview.global.averageOrderValueMinor, currency)}
                valueNumber={overview.global.averageOrderValueMinor}
              />
              <MetricCard
                hint={totals ? `${totals.newCustomerCount} nuevos` : undefined}
                label="Clientes"
                previous={previous?.global.customerCount}
                value={String(overview.global.customerCount)}
                valueNumber={overview.global.customerCount}
              />
            </div>

            <div className="stats-hero-row mt-6">
              <StatsHeroCarousel slides={slides} />
              <StatsEventsFeed items={events} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <article className="operation-card">
                <h2 className="text-lg font-semibold text-forest">Demanda por variedad</h2>
                <DonutChart
                  formatValue={(value) => `${value} u.`}
                  slices={overview.byVariety.map((row) => ({
                    label: row.familyName,
                    value: row.units,
                  }))}
                />
              </article>
              <article className="operation-card">
                <h2 className="text-lg font-semibold text-forest">Demanda por tamaño</h2>
                <DonutChart
                  formatValue={(value) => `${value} u.`}
                  slices={overview.bySize.map((row) => ({
                    label: row.sizeName,
                    value: row.units,
                  }))}
                />
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

            <div className="mt-6">
              {periods ? (
                <StatsAccountingTable
                  currency={currency}
                  onDownload={() => void downloadAccounting()}
                  rows={periods.rows}
                />
              ) : (
                <p className="screen-notice">No se pudo cargar el análisis contable.</p>
              )}
            </div>
          </>
        ) : null}
      </section>
    </DashboardShell>
  );
}
