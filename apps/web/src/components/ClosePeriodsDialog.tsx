import { useState } from 'react';

import { periodLabel, type Period } from '../lib/periods.js';

/** Dos semanas después del cierre, una semana abierta ya no es trabajo en curso: es olvido. */
const STALE_AFTER_DAYS = 14;

export function isStale(period: Period, now = Date.now()): boolean {
  return now - new Date(period.closeAt).getTime() > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Qué períodos ofrecer cerrar después de publicar una semana nueva.
 *
 * El anterior inmediato, que es el que se acaba de dejar atrás, y cualquiera que lleve más de dos
 * semanas cerrado y siga abierto. Los dos vienen tildados: es lo que hay que hacer, y destildarlos
 * es la excepción.
 */
export function periodsToOffer(periods: readonly Period[], newCycleId: string): Period[] {
  const open = periods.filter((period) => period.status !== 'CLOSED' && period.id !== newCycleId);
  // `periods` viene del más reciente al más viejo, así que el primero es el anterior inmediato.
  const [previous] = open;
  return open.filter((period) => period === previous || isStale(period));
}

/**
 * Después de publicar una semana, qué hacer con la anterior.
 *
 * Cerrar es a mano, pero el momento natural de hacerlo es éste: empezar una semana nueva es
 * exactamente cuando la anterior dejó de estar en curso. Preguntar acá evita el paso que nadie se
 * acuerda de hacer suelto, sin cerrar nada a espaldas de nadie.
 */
export function ClosePeriodsDialog({
  onConfirm,
  onSkip,
  periods,
}: {
  onConfirm: (cycleIds: string[]) => Promise<void>;
  onSkip: () => void;
  periods: readonly Period[];
}) {
  const [selected, setSelected] = useState<string[]>(periods.map((period) => period.id));
  const [working, setWorking] = useState(false);

  return (
    <div aria-label="Cerrar períodos" aria-modal="true" className="modal-backdrop" role="dialog">
      <div className="modal-panel">
        <h2 className="text-xl font-semibold text-forest">¿Cerrar la semana anterior?</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Cerrar un período traba la edición de sus pedidos y da de baja el remanente que no se
          vendió. Podés reabrirlo después, pero las bajas quedan.
        </p>

        <div className="mt-4 grid gap-2">
          {periods.map((period) => (
            <label className="flex items-start gap-2 text-sm" key={period.id}>
              <input
                checked={selected.includes(period.id)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, period.id]
                      : current.filter((id) => id !== period.id),
                  )
                }
                type="checkbox"
              />
              <span>
                {periodLabel(period)}
                {/* Los vencidos se marcan: llevan más de dos semanas abiertos y probablemente
                    nadie se acuerde de por qué. */}
                {isStale(period) ? (
                  <span className="ml-2 status-chip">Vencido hace más de dos semanas</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>

        <div className="form-actions mt-5">
          <button
            className="button button-primary"
            disabled={working || selected.length === 0}
            onClick={() => {
              setWorking(true);
              void onConfirm(selected).finally(() => setWorking(false));
            }}
            type="button"
          >
            {working ? 'Cerrando…' : `Cerrar ${String(selected.length)}`}
          </button>
          <button
            className="button button-secondary"
            disabled={working}
            onClick={onSkip}
            type="button"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
