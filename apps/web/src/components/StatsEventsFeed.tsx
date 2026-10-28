import { Link } from 'react-router-dom';

import type { StatsEvent } from '../lib/operations.js';

const KIND_LABELS: Record<StatsEvent['kind'], string> = {
  ausentes: 'Ausentes',
  cobro: 'Cobro',
  cocina: 'Cocina',
  hito: 'Hito',
  mezcla: 'Mezcla',
  record: 'Récord',
};

/**
 * "Lo que pasó" (STATS_REDESIGN_PLAN.md): los eventos del período en curso, lo que hay que revisar
 * arriba. Se calculan al momento; guardarlos y marcarlos como vistos queda para la segunda etapa.
 */
export function StatsEventsFeed({ items }: { items: StatsEvent[] | null }) {
  return (
    <aside aria-label="Lo que pasó" className="stats-feed operation-card">
      <h2 className="text-lg font-semibold text-forest">Lo que pasó</h2>
      <p className="text-xs text-ink-muted">En el período en curso, contra los anteriores.</p>
      {items === null ? (
        <p className="mt-3 text-sm text-ink-muted">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">
          Nada que destacar todavía. Acá aparecen los récords, los cambios fuertes en la mezcla y lo
          que conviene revisar.
        </p>
      ) : (
        <ul className="stats-feed-list">
          {items.map((event) => (
            <li className={`stats-feed-item is-${event.tone}`} key={event.key}>
              <span className="stats-feed-kind">{KIND_LABELS[event.kind]}</span>
              <p>
                {event.text}
                {event.href ? (
                  <>
                    {' '}
                    <Link className="stats-feed-link" to={event.href}>
                      Ver
                    </Link>
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
