import { useState, type FormEvent } from 'react';

import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import {
  clockPlus,
  mapsLinks,
  minutesLabel,
  routeTiming,
  type TimedStop,
} from '../lib/routeTiming.js';
import { showToast } from '../lib/toast.js';

export interface RoutePoint {
  address: string;
  latitude: number;
  longitude: number;
  /** Si se cambió para esta ruta (si no, es el de la ciudad). */
  own: boolean;
}

/**
 * La salida, la llegada y los tiempos de una ruta (2026-10-24).
 *
 * La salida y la llegada son las de la ciudad (Ajustes → Reparto) salvo que se cambien acá. Con la
 * hora de salida, cada parada muestra a qué hora se llega, estimado. El recorrido se abre en Google
 * Maps, en tramos si es largo, para ver los tiempos reales con tránsito.
 */
export function RouteTimingPanel<T extends TimedStop & { sequence: number }>({
  canManage,
  departureTime,
  end,
  onUpdated,
  routeId,
  start,
  stops,
}: {
  canManage: boolean;
  departureTime: string | null;
  end: RoutePoint | null;
  onUpdated: (route: unknown) => void;
  routeId: string;
  start: RoutePoint | null;
  stops: readonly T[];
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const timing = routeTiming(start, end, stops);
  const links = mapsLinks(start, end, stops);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' ? value.trim() : '';
    };
    const body: Record<string, string> = { departureTime: text('departureTime') };
    // Sólo se manda lo que cambió: una dirección igual no se vuelve a buscar.
    if (text('startAddress') !== (start?.own ? start.address : ''))
      body.startAddress = text('startAddress');
    if (text('endAddress') !== (end?.own ? end.address : '')) body.endAddress = text('endAddress');
    setSaving(true);
    setMessage('');
    const response = await apiRequest(`/api/v1/delivery/routes/${routeId}/endpoints`, {
      body: JSON.stringify(body),
      method: 'PATCH',
      notify: false,
    });
    setSaving(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    onUpdated(await response.json());
    setEditing(false);
    showToast('Salida y llegada guardadas.');
  }

  return (
    <div className="route-timing">
      <dl className="route-timing-points">
        <div>
          <dt>Sale de</dt>
          <dd>{start ? start.address : 'Sin salida configurada'}</dd>
        </div>
        <div>
          <dt>Vuelve a</dt>
          <dd>{end ? end.address : 'Termina en la última parada'}</dd>
        </div>
        <div>
          <dt>Hora de salida</dt>
          <dd>{departureTime ?? '—'}</dd>
        </div>
        <div>
          <dt>Recorrido estimado</dt>
          <dd>
            {timing.totalMinutes === null ? '—' : `≈ ${minutesLabel(timing.totalMinutes)}`}
            {timing.totalMinutes !== null && clockPlus(departureTime, timing.totalMinutes)
              ? ` · termina ≈ ${String(clockPlus(departureTime, timing.totalMinutes))}`
              : ''}
          </dd>
        </div>
      </dl>
      <p className="field-hint">
        Estimado por distancia, sin tránsito: sirve para armar las franjas. Para los tiempos reales,
        abrí el recorrido en Google Maps.
      </p>
      <div className="route-timing-actions">
        {links.map((link) => (
          <a
            className="button button-secondary"
            href={link.url}
            key={link.url}
            rel="noreferrer"
            target="_blank"
          >
            {link.label}
          </a>
        ))}
        {canManage && !editing ? (
          <button
            className="button button-secondary"
            onClick={() => setEditing(true)}
            type="button"
          >
            Cambiar salida, llegada u hora
          </button>
        ) : null}
      </div>
      {editing ? (
        <form className="route-timing-form" onSubmit={(event) => void save(event)}>
          <label className="field">
            Salida de esta ruta
            <input
              defaultValue={start?.own ? start.address : ''}
              name="startAddress"
              placeholder={start && !start.own ? `La de la ciudad: ${start.address}` : 'Dirección'}
            />
          </label>
          <label className="field">
            Llegada de esta ruta
            <input
              defaultValue={end?.own ? end.address : ''}
              name="endAddress"
              placeholder={end && !end.own ? `La de la ciudad: ${end.address}` : 'Dirección'}
            />
          </label>
          <label className="field">
            Hora de salida
            <input defaultValue={departureTime ?? ''} name="departureTime" type="time" />
          </label>
          <p className="field-hint">
            Una dirección con calle, número y ciudad, un link de Google Maps o coordenadas. Vacío
            vuelve a la de la ciudad. No reordena las paradas.
          </p>
          {message ? (
            <p className="screen-notice" role="alert">
              {message}
            </p>
          ) : null}
          <div className="form-actions">
            <button className="button button-primary" disabled={saving} type="submit">
              {saving ? 'Ubicando…' : 'Guardar'}
            </button>
            <button
              className="button button-secondary"
              onClick={() => setEditing(false)}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
