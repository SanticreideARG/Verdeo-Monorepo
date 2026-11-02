import { useEffect, useRef } from 'react';

export interface ManualOrderStop {
  customerDisplayName: string;
  deliveryAddress: string;
  deliveryLatitude: number | null;
  id: string;
}

/** Las paradas ya elegidas, en el orden en que se eligieron, y las que faltan. */
export function splitManualOrder<Stop extends { id: string }>(
  stops: readonly Stop[],
  order: readonly string[],
): { pending: Stop[]; picked: Stop[] } {
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  const chosen = new Set(order);
  return {
    pending: stops.filter((stop) => !chosen.has(stop.id)),
    picked: order.flatMap((id) => byId.get(id) ?? []),
  };
}

/**
 * "Establecer orden manualmente": lo que se hace con el orden elegido. Guardar se habilita recién
 * con todas elegidas, porque el servidor reordena la ruta entera, y porque un toque de más en la
 * última parada no debería publicar nada solo.
 */
export function RouteManualOrderBar({
  onCancel,
  onReset,
  onSave,
  onUndo,
  pickedCount,
  saving,
  total,
}: {
  onCancel: () => void;
  onReset: () => void;
  onSave: () => void;
  onUndo: () => void;
  pickedCount: number;
  saving: boolean;
  total: number;
}) {
  const bar = useRef<HTMLDivElement>(null);
  // En el teléfono el mapa queda debajo de todo lo de arriba: se lo trae a la vista al entrar.
  useEffect(() => {
    bar.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="route-manual-bar" ref={bar}>
      <p aria-live="polite">
        {pickedCount < total ? (
          <>
            <strong>Elegí la parada {pickedCount + 1}.</strong> Tocá los puntos en el orden del
            recorrido. Van {pickedCount} de {total}.
          </>
        ) : (
          <strong>Listo: elegiste las {total} paradas.</strong>
        )}
      </p>
      <div>
        <button
          className="button button-secondary"
          disabled={pickedCount === 0 || saving}
          onClick={onUndo}
          type="button"
        >
          Deshacer
        </button>
        <button
          className="button button-secondary"
          disabled={pickedCount === 0 || saving}
          onClick={onReset}
          type="button"
        >
          Empezar de nuevo
        </button>
        <button
          className="button button-secondary"
          disabled={saving}
          onClick={onCancel}
          type="button"
        >
          Cancelar
        </button>
        <button
          className="button button-primary"
          disabled={pickedCount < total || saving}
          onClick={onSave}
          type="button"
        >
          {saving ? 'Guardando…' : 'Guardar orden'}
        </button>
      </div>
    </div>
  );
}

/**
 * La lista al lado del mapa: el recorrido que se va armando y lo que falta. Lo que falta también se
 * elige desde acá: es la única forma de elegir una parada sin ubicación, o una que queda tapada
 * por otra del mismo edificio.
 */
export function RouteManualOrderList({
  onPick,
  order,
  stops,
}: {
  onPick: (stopId: string) => void;
  order: readonly string[];
  stops: readonly ManualOrderStop[];
}) {
  const { pending, picked } = splitManualOrder(stops, order);
  return (
    <div className="route-manual-list">
      {picked.length > 0 ? (
        <ol>
          {picked.map((stop, index) => (
            <li className="routes-stop" key={stop.id}>
              <span className="routes-stop-seq is-picked">{index + 1}</span>
              <div className="routes-stop-body">
                <p className="routes-stop-name">{stop.customerDisplayName}</p>
                <p className="routes-stop-address">{stop.deliveryAddress}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      {pending.length > 0 ? (
        <>
          <p className="route-manual-heading">Faltan {pending.length}</p>
          <ul>
            {pending.map((stop) => (
              <li key={stop.id}>
                <button className="routes-stop" onClick={() => onPick(stop.id)} type="button">
                  <span aria-hidden="true" className="routes-stop-seq" />
                  <span className="routes-stop-body">
                    <span className="routes-stop-name">{stop.customerDisplayName}</span>
                    <span className="routes-stop-address">
                      {stop.deliveryAddress}
                      {stop.deliveryLatitude === null ? ' · sin ubicación en el mapa' : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
