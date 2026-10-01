import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { RouteMap } from '../components/RouteMap.js';
import { apiRequest } from '../lib/api.js';
import { formatMoney } from '../lib/operations.js';

interface SheetStop {
  accessNotes: string | null;
  collectedMinor: number;
  customerFirstName: string;
  deliveryAddress: string;
  deliveryLatitude: number | null;
  deliveryLocationUrl: string | null;
  deliveryLongitude: number | null;
  deliveryNote: string | null;
  deliveryWindow: string | null;
  detail: string;
  id: string;
  paymentExpectation: string;
  prepaid: boolean;
  publicNumber: string;
  sequence: number;
  status: string;
  totalMinor: number;
}

interface Sheet {
  collectedMinor: number;
  deliveredCount: number;
  deliveryDate: string;
  label: string | null;
  originLatitude: number | null;
  originLongitude: number | null;
  pendingCollectionMinor: number;
  siteName: string;
  stopCount: number;
  stops: SheetStop[];
}

function dateLabel(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(new Date(year, month - 1, day));
}

function mapLink(stop: SheetStop): string {
  if (stop.deliveryLocationUrl) return stop.deliveryLocationUrl;
  if (stop.deliveryLatitude !== null && stop.deliveryLongitude !== null) {
    return `https://www.google.com/maps?q=${String(stop.deliveryLatitude)},${String(stop.deliveryLongitude)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.deliveryAddress)}`;
}

/**
 * El sitio de reparto: la hoja del día de quien está en la calle.
 *
 * No hay login ni cuenta. El reparto dejó de gestionarse con usuarios —quien reparte hoy puede no
 * ser quien reparte mañana, y dar de alta y de baja cuentas para eso era una gestión que nadie iba
 * a hacer— así que lo que se entrega es un enlace a la ruta de ese día, que vence. La credencial es
 * el enlace.
 *
 * Está escrito para un teléfono en la mano, con una caja en la otra: una parada por tarjeta, en
 * orden, con lo único que hace falta para esa parada. Qué entregar arriba de todo —antes que la
 * dirección— porque es lo que se busca en la caja; después dónde, cómo entrar y en qué horario
 * recibe; y abajo cuánto cobrar, o que ya está pagado.
 *
 * Confirmar entrega y confirmar cobro son un solo movimiento. Separarlos deja plata en la calle que
 * nadie registró, y nadie va a entrar dos veces a la misma parada.
 *
 * Arriba, siempre a la vista, cuánto lleva cobrado: es lo que hay que rendir al volver.
 */
export function DeliverySheetPage() {
  const { token } = useParams<{ token: string }>();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'invalid'>('loading');
  const [busyStopId, setBusyStopId] = useState<string | null>(null);
  const [openStopId, setOpenStopId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    const response = await apiRequest(`/api/v1/public/delivery/${token}`);
    if (!response.ok) {
      setState('invalid');
      return;
    }
    setSheet((await response.json()) as Sheet);
    setState('ok');
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm(stop: SheetStop, collected: boolean) {
    if (!token) return;
    setBusyStopId(stop.id);
    setFailed('');
    const response = await apiRequest(`/api/v1/public/delivery/${token}/stops/${stop.id}/confirm`, {
      body: JSON.stringify({ collected, ...(note.trim() ? { note: note.trim() } : {}) }),
      method: 'POST',
    });
    setBusyStopId(null);
    if (!response.ok) {
      setFailed('No se pudo confirmar. Revisá la señal y probá de nuevo.');
      return;
    }
    setSheet((await response.json()) as Sheet);
    setOpenStopId(null);
    setNote('');
  }

  if (state === 'loading') {
    return (
      <main className="delivery-sheet">
        <p className="delivery-sheet-empty">Cargando la hoja…</p>
      </main>
    );
  }

  if (state === 'invalid' || !sheet) {
    return (
      <main className="delivery-sheet">
        <div className="delivery-sheet-empty">
          <h1>Este enlace no sirve</h1>
          {/* Sin decir cuál de las tres cosas pasó: a quien reparte le sirve lo mismo, y a quien
              lo encontró de casualidad no se le cuenta qué tan cerca estuvo. */}
          <p>Pedile uno nuevo a la persona que te pasó la ruta.</p>
        </div>
      </main>
    );
  }

  const pendientes = sheet.stops.filter((stop) => stop.status !== 'delivered');
  // El mapa es el mismo componente que usa la hoja de ruta del panel: una sola forma de dibujar
  // una ruta, y lo que ve quien reparte es lo que vio quien la armó.
  const puntos = sheet.stops.map((stop) => ({
    customerDisplayName: stop.customerFirstName,
    deliveryAddress: stop.deliveryAddress,
    deliveryLatitude: stop.deliveryLatitude,
    deliveryLongitude: stop.deliveryLongitude,
    id: stop.id,
    sequence: stop.sequence,
  }));

  return (
    <main className="delivery-sheet">
      <header className="delivery-sheet-head">
        <div>
          <p className="eyebrow">{sheet.siteName}</p>
          <h1>{sheet.label ?? dateLabel(sheet.deliveryDate)}</h1>
          <p className="delivery-sheet-progress">
            {sheet.deliveredCount} de {sheet.stopCount} entregadas
          </p>
        </div>
        {/* Lo que hay que rendir, siempre a la vista: es la pregunta de todo el día. */}
        <div className="delivery-sheet-money">
          <span>Cobrado</span>
          <strong>{formatMoney(sheet.collectedMinor, 'ARS')}</strong>
          {sheet.pendingCollectionMinor > 0 ? (
            <small>Falta cobrar {formatMoney(sheet.pendingCollectionMinor, 'ARS')}</small>
          ) : null}
        </div>
      </header>

      {failed ? (
        <p className="delivery-sheet-error" role="alert">
          {failed}
        </p>
      ) : null}

      <div className="delivery-sheet-map">
        <RouteMap stops={puntos} />
      </div>

      <ol className="delivery-sheet-stops">
        {sheet.stops.map((stop) => {
          const entregada = stop.status === 'delivered';
          const abierta = openStopId === stop.id;
          return (
            <li className={entregada ? 'is-done' : ''} key={stop.id}>
              <article>
                <header>
                  <span className="delivery-sheet-seq">{stop.sequence}</span>
                  <div>
                    <h2>{stop.customerFirstName}</h2>
                    <p className="delivery-sheet-number">{stop.publicNumber}</p>
                  </div>
                  {entregada ? <span className="delivery-sheet-done">Entregada</span> : null}
                </header>

                {stop.detail ? <p className="delivery-sheet-detail">{stop.detail}</p> : null}
                <p className="delivery-sheet-address">{stop.deliveryAddress}</p>
                {stop.deliveryWindow ? (
                  <p className="delivery-sheet-window">🕒 {stop.deliveryWindow}</p>
                ) : null}
                {stop.accessNotes ? (
                  <p className="delivery-sheet-access">{stop.accessNotes}</p>
                ) : null}
                {stop.deliveryNote ? (
                  <p className="delivery-sheet-access">Nota: {stop.deliveryNote}</p>
                ) : null}

                <p className={stop.prepaid ? 'delivery-sheet-paid' : 'delivery-sheet-collect'}>
                  {stop.prepaid
                    ? 'Ya está pagado · no cobrar'
                    : `Cobrar ${formatMoney(stop.totalMinor, 'ARS')} · ${stop.paymentExpectation}`}
                </p>

                <div className="delivery-sheet-actions">
                  <a href={mapLink(stop)} rel="noreferrer" target="_blank">
                    Abrir en el mapa
                  </a>
                  {entregada ? null : abierta ? null : (
                    <button onClick={() => setOpenStopId(stop.id)} type="button">
                      Confirmar
                    </button>
                  )}
                </div>

                {abierta && !entregada ? (
                  <div className="delivery-sheet-confirm">
                    <label>
                      Nota (opcional)
                      <input
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="No estaba, dejé con el vecino"
                        value={note}
                      />
                    </label>
                    <div>
                      {stop.prepaid ? (
                        <button
                          disabled={busyStopId === stop.id}
                          onClick={() => void confirm(stop, false)}
                          type="button"
                        >
                          Entregada
                        </button>
                      ) : (
                        <>
                          <button
                            className="is-primary"
                            disabled={busyStopId === stop.id}
                            onClick={() => void confirm(stop, true)}
                            type="button"
                          >
                            Entregada y cobrada
                          </button>
                          {/* Entregar sin cobrar pasa, y esconderlo haría que se marque cobrado lo
                              que no se cobró, que es peor que un número feo. */}
                          <button
                            disabled={busyStopId === stop.id}
                            onClick={() => void confirm(stop, false)}
                            type="button"
                          >
                            Entregada sin cobrar
                          </button>
                        </>
                      )}
                      <button onClick={() => setOpenStopId(null)} type="button">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>

      {pendientes.length === 0 ? (
        <p className="delivery-sheet-finished">
          Terminaste la ruta. A rendir {formatMoney(sheet.collectedMinor, 'ARS')}.
        </p>
      ) : null}
    </main>
  );
}
