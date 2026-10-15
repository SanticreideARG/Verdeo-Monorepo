import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiRequest } from '../lib/api.js';
import { weekdayName } from './DeliveryDayPicker.js';

interface DispatchSummary {
  date: string;
  drafts: number;
  next: { date: string; total: number } | null;
  /** Los repartos de ese día, el de siempre primero. */
  runs?: { id: string; label: string }[];
  total: number;
  unlocated: number;
  unrouted: number;
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** "sábado 18 de octubre", sin pasar por la zona horaria del navegador. */
function longDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay();
  return `${weekdayName(weekday).toLocaleLowerCase('es-AR')} ${String(day ?? '')} de ${MONTHS[(month ?? 1) - 1] ?? ''}`;
}

const plural = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

/**
 * La alerta de lo que hay que despachar hoy: cuántos pedidos salen, cuántos todavía no están en una
 * hoja de ruta, cuántos siguen en borrador y cuántos no tienen ubicación. Es lo que determina las
 * hojas de ruta del día, así que lleva directo a Rutas. Si hoy no hay reparto, dice cuándo es el
 * próximo. No aparece si no hay nada por delante.
 */
export function DispatchTodayBanner() {
  const [summary, setSummary] = useState<DispatchSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiRequest('/api/v1/orders/dispatch', { notify: false })
      .then(async (response) => (response.ok ? ((await response.json()) as DispatchSummary) : null))
      .catch(() => null)
      .then((result) => {
        if (!cancelled) setSummary(result && typeof result.total === 'number' ? result : null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!summary || (summary.total === 0 && !summary.next)) return null;

  if (summary.total === 0 && summary.next) {
    return (
      <section className="dispatch-banner is-quiet" role="status">
        <p>
          <strong>Hoy no hay reparto.</strong> El próximo es el {longDay(summary.next.date)}:{' '}
          {plural(summary.next.total, 'pedido', 'pedidos')}.
        </p>
      </section>
    );
  }

  const pendientes = [
    summary.unrouted > 0 ? plural(summary.unrouted, 'sin hoja de ruta', 'sin hoja de ruta') : null,
    summary.drafts > 0 ? plural(summary.drafts, 'en borrador', 'en borrador') : null,
    summary.unlocated > 0 ? plural(summary.unlocated, 'sin ubicación', 'sin ubicación') : null,
  ].filter((text): text is string => text !== null);

  return (
    <section
      className={`dispatch-banner ${pendientes.length > 0 ? 'is-pending' : 'is-ready'}`}
      role="status"
    >
      <div>
        <p>
          <strong>
            Hoy, {longDay(summary.date)}: {plural(summary.total, 'pedido', 'pedidos')} para
            despachar.
          </strong>
        </p>
        <p className="dispatch-banner-detail">
          {pendientes.length > 0 ? pendientes.join(' · ') : 'Todos en su hoja de ruta.'}
        </p>
      </div>
      <Link
        className="button button-primary"
        to={
          summary.runs?.[0]
            ? `/app/reparto/rutas?reparto=${summary.runs[0].id}`
            : '/app/reparto/rutas?vista=hojas'
        }
      >
        {summary.unrouted > 0 ? 'Armar las hojas de ruta' : 'Ver las hojas de ruta'}
      </Link>
    </section>
  );
}
