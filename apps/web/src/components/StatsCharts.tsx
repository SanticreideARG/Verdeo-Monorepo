import { formatMoney } from '../lib/operations.js';

/**
 * Charts for Estadísticas, drawn as inline SVG rather than pulled from a charting library: two
 * chart types over a handful of points each does not justify the bundle, and hand-drawn SVG
 * inherits the dashboard's own CSS variables so it themes correctly for free.
 */

export interface TrendPoint {
  day: string;
  orderCount: number;
  revenueMinor: number;
}

function dayLabel(day: string): string {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(
    new Date(`${day.slice(0, 10)}T00:00:00`),
  );
}

/** Revenue over time as an area chart. One point is drawn as a dot, since a line needs two. */
export function TrendChart({ currency, points }: { currency: string; points: TrendPoint[] }) {
  if (points.length === 0) {
    return <p className="mt-3 text-sm text-ink-muted">Sin datos en este período.</p>;
  }

  const width = 640;
  const height = 200;
  const padding = { bottom: 26, left: 8, right: 8, top: 12 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const max = Math.max(1, ...points.map((point) => point.revenueMinor));

  const x = (index: number) =>
    padding.left +
    (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => padding.top + plotHeight - (value / max) * plotHeight;

  const line = points.map((point, index) => `${x(index)},${y(point.revenueMinor)}`).join(' ');
  const area = `${padding.left},${padding.top + plotHeight} ${line} ${x(points.length - 1)},${padding.top + plotHeight}`;

  // With many points, printing every date turns the axis into a smear — show at most six.
  const labelStep = Math.ceil(points.length / 6);

  return (
    <div className="stats-chart">
      <svg preserveAspectRatio="none" role="img" viewBox={`0 0 ${width} ${height}`}>
        <title>Ingresos por fecha de entrega</title>
        <polygon className="stats-chart-area" points={area} />
        {points.length > 1 ? <polyline className="stats-chart-line" points={line} /> : null}
        {points.map((point, index) => (
          <circle
            className="stats-chart-dot"
            cx={x(index)}
            cy={y(point.revenueMinor)}
            key={point.day}
            r={3}
          >
            <title>{`${dayLabel(point.day)}: ${formatMoney(point.revenueMinor, currency)} · ${point.orderCount} pedido${point.orderCount === 1 ? '' : 's'}`}</title>
          </circle>
        ))}
        {points.map((point, index) =>
          index % labelStep === 0 || index === points.length - 1 ? (
            <text
              className="stats-chart-axis"
              key={`label-${point.day}`}
              textAnchor="middle"
              x={x(index)}
              y={height - 8}
            >
              {dayLabel(point.day)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
}

/** Composition as a donut — for "what share of demand", where a bar list reads as a ranking. */
export function DonutChart({
  formatValue,
  slices,
}: {
  formatValue: (value: number) => string;
  slices: DonutSlice[];
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total === 0) return <p className="mt-3 text-sm text-ink-muted">Sin datos en este período.</p>;

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let consumed = 0;

  return (
    <div className="stats-donut">
      <svg role="img" viewBox="0 0 160 160">
        <title>Composición</title>
        <g transform="rotate(-90 80 80)">
          {slices.map((slice, index) => {
            const fraction = slice.value / total;
            const dash = `${fraction * circumference} ${circumference}`;
            const offset = -consumed * circumference;
            consumed += fraction;
            return (
              <circle
                cx={80}
                cy={80}
                fill="none"
                key={slice.label}
                r={radius}
                strokeDasharray={dash}
                strokeDashoffset={offset}
                strokeWidth={22}
                // Slices cycle through five tints so neighbours stay distinguishable without
                // needing a palette long enough for an unbounded number of varieties.
                className={`stats-donut-slice stats-donut-slice-${(index % 5) + 1}`}
              />
            );
          })}
        </g>
      </svg>
      <ul className="stats-donut-legend">
        {slices.map((slice, index) => (
          <li key={slice.label}>
            <i className={`stats-donut-key-${(index % 5) + 1}`} />
            <span>{slice.label}</span>
            <strong>{formatValue(slice.value)}</strong>
            <em>{Math.round((slice.value / total) * 100)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A metric with its comparison-period delta, when a comparison window is active. */
export function MetricCard({
  hint,
  label,
  previous,
  value,
  valueNumber,
}: {
  hint?: string;
  label: string;
  previous?: number | undefined;
  value: string;
  valueNumber: number;
}) {
  // A delta against zero has no meaningful percentage — "up from nothing" is not "+∞%".
  const delta =
    previous === undefined || previous === 0
      ? null
      : Math.round(((valueNumber - previous) / previous) * 100);

  return (
    <article className="operation-card">
      <p className="text-xs font-semibold uppercase text-ink-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-forest">{value}</p>
      {delta !== null ? (
        <p className={`stats-delta ${delta >= 0 ? 'is-up' : 'is-down'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs. período anterior
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-muted">{hint}</p>
      ) : null}
    </article>
  );
}
