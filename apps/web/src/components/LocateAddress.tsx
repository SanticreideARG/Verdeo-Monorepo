import { useCallback, useEffect, useRef, useState } from 'react';

import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';

export interface LocateResult {
  addressId: string | null;
  candidates: { confidence: number; formattedAddress: string; id: string }[];
  customerId: string;
  reason?: string;
  requestId: string | null;
  status: 'already_located' | 'failed' | 'located' | 'needs_zone' | 'no_match' | 'review';
}

/** Lo que se le dice a quien armó la ruta de cada resultado, sin jerga de geocodificación. */
export function locateStatusText(result: Pick<LocateResult, 'reason' | 'status'>): string {
  switch (result.status) {
    case 'located':
      return 'Ubicada.';
    case 'already_located':
      return 'Ya tenía ubicación.';
    case 'review':
      return result.reason ? `Revisala: ${result.reason}` : 'Revisala.';
    case 'no_match':
      return 'No se encontró la dirección. Revisá cómo está escrita.';
    case 'needs_zone':
      return result.reason ?? 'Falta asignar la zona del domicilio.';
    default:
      return result.reason ?? 'No se pudo ubicar.';
  }
}

/**
 * Los candidatos que el mapa encontró pero que no se aceptaron solos, para elegir uno.
 *
 * Usa la misma confirmación que la ficha del cliente, así que la dirección queda confirmada igual
 * que si se hubiera resuelto allá.
 */
function CandidateChooser({
  onConfirmed,
  result,
}: {
  onConfirmed: () => void;
  result: LocateResult;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!result.addressId || !result.requestId || result.candidates.length === 0) return null;
  const { addressId, customerId, requestId } = result;

  async function choose(candidateId: string) {
    setBusy(true);
    setMessage('');
    const response = await apiRequest(
      `/api/v1/customers/${customerId}/addresses/${addressId}/geocoding/${requestId}/confirm`,
      { body: JSON.stringify({ candidateId }), method: 'POST', notify: false },
    );
    setBusy(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    onConfirmed();
  }

  return (
    <ul className="locate-candidates">
      {result.candidates.map((candidate) => (
        <li key={candidate.id}>
          <span>
            {candidate.formattedAddress}{' '}
            <small>({String(Math.round(candidate.confidence * 100))}% seguro)</small>
          </span>
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => void choose(candidate.id)}
            type="button"
          >
            Usar esta
          </button>
        </li>
      ))}
      {message ? <li className="text-sm text-ink-muted">{message}</li> : null}
    </ul>
  );
}

/**
 * "Ubicar dirección" en el detalle del pedido: ordena el texto, lo busca en el mapa y, si el
 * resultado es seguro y cae dentro de la ciudad, lo deja confirmado. Si no, muestra los candidatos.
 *
 * Si no la encuentra, o la que encontró no es, deja corregir la dirección o pegar la ubicación (un
 * enlace de Google Maps o coordenadas) y buscar de nuevo. Antes un "no se encontró" no dejaba
 * ninguna salida desde acá: había que editar el pedido y volver a probar a ciegas.
 */
export function LocateOrderControl({
  address,
  onLocated,
  orderId,
}: {
  /** La dirección del pedido, para corregirla y volver a buscar. */
  address: string;
  onLocated: () => void;
  orderId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LocateResult | null>(null);
  const [message, setMessage] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [draftAddress, setDraftAddress] = useState(address);
  const [draftLocation, setDraftLocation] = useState('');

  async function locate(retry?: { address?: string; location?: string }) {
    setBusy(true);
    setMessage('');
    setResult(null);
    const response = await apiRequest(`/api/v1/orders/${orderId}/locate`, {
      ...(retry ? { body: JSON.stringify(retry) } : {}),
      method: 'POST',
      notify: false,
    });
    setBusy(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const body = (await response.json()) as LocateResult;
    setResult(body);
    if (body.status === 'located') setRetrying(false);
    // Con una dirección corregida el pedido cambió: se vuelve a leer aunque no se haya ubicado.
    if (body.status === 'located' || retry) onLocated();
  }

  const unresolved =
    result !== null && result.status !== 'located' && result.status !== 'needs_zone';

  return (
    <div className="locate-control">
      <button
        className="button button-secondary"
        disabled={busy}
        onClick={() => void locate()}
        type="button"
      >
        {busy ? 'Ubicando…' : 'Ubicar dirección'}
      </button>
      {message ? <p className="text-sm text-ink-muted">{message}</p> : null}
      {result ? (
        <>
          <p className="text-sm text-ink-muted">
            {result.status === 'already_located'
              ? 'Ya tenía ubicación. Si no es ahí, corregila y buscá de nuevo.'
              : locateStatusText(result)}
          </p>
          {result.status === 'review' ? (
            <CandidateChooser
              onConfirmed={() => {
                setResult({ ...result, candidates: [], status: 'located' });
                setRetrying(false);
                onLocated();
              }}
              result={result}
            />
          ) : null}
        </>
      ) : null}
      {unresolved && !retrying ? (
        <button className="locate-retry-open" onClick={() => setRetrying(true)} type="button">
          Corregir la dirección o pegar la ubicación
        </button>
      ) : null}
      {retrying ? (
        <form
          className="locate-retry"
          onSubmit={(event) => {
            event.preventDefault();
            const changedAddress =
              draftAddress.trim() !== address.trim() ? draftAddress.trim() : '';
            void locate({
              ...(changedAddress ? { address: changedAddress } : {}),
              ...(draftLocation.trim() ? { location: draftLocation.trim() } : {}),
            });
          }}
        >
          <label className="field">
            Dirección (calle y altura; el resto va en las notas)
            <input
              minLength={4}
              onChange={(event) => setDraftAddress(event.target.value)}
              value={draftAddress}
            />
          </label>
          <label className="field">
            O pegá la ubicación
            <input
              inputMode="url"
              onChange={(event) => setDraftLocation(event.target.value)}
              placeholder="Enlace de Google Maps o -34.58, -58.41"
              value={draftLocation}
            />
          </label>
          <div className="locate-retry-actions">
            <button
              className="button button-primary"
              disabled={busy || (draftAddress.trim() === address.trim() && !draftLocation.trim())}
              type="submit"
            >
              {busy ? 'Buscando…' : 'Buscar de nuevo'}
            </button>
            <button
              className="button button-secondary"
              onClick={() => setRetrying(false)}
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

interface UnlockedOrder {
  address: string;
  customerName: string;
  hasAddress: boolean;
  id: string;
  publicNumber: string;
  status: string;
}

/**
 * Los pedidos del día que quedarían afuera de la hoja de ruta por no tener ubicación.
 *
 * Antes se omitían sin aviso: la ruta salía más corta de lo esperado y nadie sabía cuáles faltaban.
 * Acá se listan, y se pueden ubicar de a tandas. El botón repite hasta que no quedan, pasando los
 * ya intentados para no volver sobre los que no se pudieron resolver.
 */
export function UnlocatedOrdersPanel({
  deliveryDate,
  onChanged,
}: {
  deliveryDate: string;
  onChanged: () => void;
}) {
  const [orders, setOrders] = useState<UnlockedOrder[]>([]);
  const [outcomes, setOutcomes] = useState<
    Record<string, { reason?: string | undefined; status: string }>
  >({});
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const cancelled = useRef(false);

  const load = useCallback(async () => {
    const response = await apiRequest(
      `/api/v1/delivery/unlocated?deliveryDate=${encodeURIComponent(deliveryDate)}`,
      { notify: false },
    );
    if (response.ok) setOrders(((await response.json()) as { items: UnlockedOrder[] }).items);
  }, [deliveryDate]);

  useEffect(() => {
    cancelled.current = false;
    setOutcomes({});
    setMessage('');
    void load();
    return () => {
      cancelled.current = true;
    };
  }, [load]);

  async function locateAll() {
    setRunning(true);
    setMessage('');
    const tried: string[] = [];
    for (;;) {
      const response = await apiRequest('/api/v1/delivery/locate-missing', {
        body: JSON.stringify({ deliveryDate, limit: 5, skipOrderIds: tried }),
        method: 'POST',
        notify: false,
      });
      if (!response.ok) {
        setMessage(await errorMessage(response));
        break;
      }
      const body = (await response.json()) as {
        remaining: number;
        results: { orderId: string; reason?: string; status: string }[];
      };
      if (cancelled.current) break;
      for (const result of body.results) tried.push(result.orderId);
      setOutcomes((current) => ({
        ...current,
        ...Object.fromEntries(
          body.results.map((r) => [r.orderId, { reason: r.reason, status: r.status }]),
        ),
      }));
      if (body.results.length === 0 || body.remaining === 0) break;
    }
    setRunning(false);
    await load();
    onChanged();
  }

  if (orders.length === 0) return null;

  return (
    <section className="unlocated-panel sm:col-span-3">
      <div className="unlocated-head">
        <p>
          <strong>
            {orders.length === 1
              ? '1 pedido no tiene ubicación'
              : `${String(orders.length)} pedidos no tienen ubicación`}
          </strong>{' '}
          y no entrarían en la hoja de ruta.
        </p>
        <button
          className="button button-primary"
          disabled={running}
          onClick={() => void locateAll()}
          type="button"
        >
          {running ? 'Ubicando…' : `Ubicar ${orders.length === 1 ? 'el pedido' : 'los pedidos'}`}
        </button>
      </div>
      {message ? <p className="text-sm text-ink-muted">{message}</p> : null}
      <ul className="unlocated-list">
        {orders.map((order) => {
          const outcome = outcomes[order.id];
          return (
            <li key={order.id}>
              <span>
                <strong>{order.publicNumber}</strong> · {order.customerName} — {order.address}
              </span>
              {outcome ? (
                <small>
                  {locateStatusText({
                    ...(outcome.reason ? { reason: outcome.reason } : {}),
                    status: outcome.status as LocateResult['status'],
                  })}
                </small>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-ink-muted">
        Lo que no se pueda ubicar solo queda para revisar desde el detalle del pedido.
      </p>
    </section>
  );
}
