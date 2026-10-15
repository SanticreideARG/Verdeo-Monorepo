import { useEffect, useState } from 'react';

import { apiRequest } from '../lib/api.js';
import { todayInOperation } from '../lib/dates.js';
import { weekdayName } from './DeliveryDayPicker.js';

interface RunOption {
  deliveryDate: string;
  id: string;
  label: string;
}

/** Hace N días, en AAAA-MM-DD: los repartos de la semana pasada siguen sirviendo para imprimir. */
function daysAgo(days: number): string {
  const [year, month, day] = todayInOperation().split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) - days))
    .toISOString()
    .slice(0, 10);
}

/**
 * Elegir un reparto para acotar la cocina o las etiquetas a esa salida (DELIVERY_RUNS_PLAN.md,
 * fase 3). Vacío: todos. Muestra los repartos de las últimas semanas en adelante.
 */
export function RunFilter({
  onChange,
  value,
}: {
  onChange: (runId: string) => void;
  value: string;
}) {
  const [runs, setRuns] = useState<RunOption[]>([]);
  useEffect(() => {
    let active = true;
    void apiRequest(`/api/v1/delivery/runs?from=${daysAgo(21)}`, { notify: false })
      .then(async (response) =>
        response.ok ? ((await response.json()) as { runs: RunOption[] }).runs : [],
      )
      .catch(() => [])
      .then((items) => {
        if (active && Array.isArray(items)) setRuns(items);
      });
    return () => {
      active = false;
    };
  }, []);

  if (runs.length === 0) return null;
  return (
    <label className="field">
      Reparto
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">Todos los repartos</option>
        {runs.map((run) => {
          const [year, month, day] = run.deliveryDate.split('-').map(Number);
          const weekday = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay();
          return (
            <option key={run.id} value={run.id}>
              {weekdayName(weekday)} {String(day ?? '')}/{String(month ?? '')} · {run.label}
            </option>
          );
        })}
      </select>
    </label>
  );
}
