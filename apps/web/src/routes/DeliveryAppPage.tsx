import { useCallback, useEffect, useState } from 'react';

import { apiRequest } from '../lib/api.js';
import { errorMessage, formatMoney } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface MyStop {
  customerFirstName: string;
  deliveryAddress: string;
  deliveryLocationUrl: string | null;
  id: string;
  paymentExpectation: string;
  // Whether the money is already in. Nothing about how or by whom — the repartidor needs to know
  // not to ask for cash, and the reconciliation detail is none of their business.
  prepaid: boolean;
  publicNumber: string;
  routeId: string;
  sequence: number;
  status: string;
  totalMinor: number;
}

/** Repartidor-facing mobile app (DELIVERY_AND_ROUTES.md "Delivery App"). No DashboardShell chrome
 * — a driver on a phone doesn't need the admin nav. Shows only what the doc allows: first name, an
 * order id, the address, what to collect, a map link, message triggers, and one confirm-delivery
 * action. Never phone/email/notes/history — `listStopsForUser` doesn't even select those columns,
 * so there's nothing here to accidentally render. */
export function DeliveryAppPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [stops, setStops] = useState<MyStop[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyStopId, setBusyStopId] = useState<string | null>(null);
  const [failingStop, setFailingStop] = useState<MyStop | null>(null);
  const [reasons, setReasons] = useState<{ displayName: string; id: string }[]>([]);

  const canExecute = profile?.permissions.includes('delivery.execute') ?? false;
  const canTrigger = profile?.permissions.includes('delivery.trigger_messages') ?? false;

  const loadStops = useCallback(async () => {
    const response = await apiRequest('/api/v1/delivery/my-stops');
    if (response.ok) setStops(((await response.json()) as { items: MyStop[] }).items);
  }, []);

  useEffect(() => {
    if (!canExecute) {
      setLoading(false);
      return;
    }
    void loadStops().finally(() => setLoading(false));
    const interval = setInterval(() => void loadStops(), 30_000);
    return () => clearInterval(interval);
  }, [canExecute, loadStops]);

  async function setStatus(stopId: string, status: string) {
    setBusyStopId(stopId);
    const response = await apiRequest(`/api/v1/delivery/stops/${stopId}/status`, {
      body: JSON.stringify({ status }),
      method: 'PATCH',
    });
    setBusyStopId(null);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    await loadStops();
  }

  useEffect(() => {
    let active = true;
    void apiRequest('/api/v1/cancellation-reasons')
      .then(async (response) => {
        if (!response.ok || !active) return;
        const body = (await response.json()) as {
          items: { countsAsFailedDelivery: boolean; displayName: string; id: string }[];
        };
        // Only the failed-delivery ones — "cliente canceló" is not something a repartidor reports.
        if (active) setReasons(body.items.filter((item) => item.countsAsFailedDelivery));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function reportFailure(stopId: string, reasonId: string) {
    setBusyStopId(stopId);
    const response = await apiRequest(`/api/v1/delivery/stops/${stopId}/failed`, {
      body: JSON.stringify({ cancellationReasonId: reasonId }),
      method: 'POST',
    });
    setBusyStopId(null);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setFailingStop(null);
    await loadStops();
  }

  async function trigger(stopId: string, action: string) {
    const response = await apiRequest(`/api/v1/delivery/stops/${stopId}/trigger`, {
      body: JSON.stringify({ action }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const body = (await response.json()) as { reason?: string; sent: boolean };
    if (!body.sent) setMessage('No se pudo enviar el mensaje (revisá plantillas y cuentas).');
  }

  if (failed) {
    return (
      <main className="grid min-h-screen place-items-center bg-cream px-5 text-center text-forest">
        No pudimos cargar tu sesión.
      </main>
    );
  }
  if (!profile) {
    return (
      <main className="grid min-h-screen place-items-center bg-cream text-forest">Cargando…</main>
    );
  }

  if (!canExecute) {
    return (
      <main className="grid min-h-screen place-items-center bg-cream px-5 text-center text-forest">
        Tu usuario no tiene permiso para ver el reparto.
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-cream px-4 pb-10 pt-6 text-ink">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-forest">Mis entregas</h1>
        <button className="button button-secondary" onClick={() => void logout()} type="button">
          Salir
        </button>
      </header>

      {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}

      {loading ? (
        <p className="mt-6 text-ink-muted">Cargando…</p>
      ) : stops.length === 0 ? (
        <p className="mt-6 text-ink-muted">No tenés paradas asignadas por ahora.</p>
      ) : (
        <ul className="mt-6 grid gap-4">
          {stops.map((stop) => (
            <li
              className="rounded-2xl border border-forest/10 bg-white p-5 shadow-sm"
              key={stop.id}
            >
              <div className="delivery-stop-head">
                <span className="delivery-stop-seq" aria-label={`Parada ${stop.sequence}`}>
                  {stop.sequence}
                </span>
                <div>
                  <p className="eyebrow">{stop.publicNumber}</p>
                  <h2 className="text-xl font-semibold text-forest">{stop.customerFirstName}</h2>
                </div>
              </div>
              <p className="mt-2 text-lg leading-6 text-ink">{stop.deliveryAddress}</p>

              {/* What to collect is the thing that must not be got wrong, so it is stated plainly
                  and a prepaid stop says so instead of showing an amount to ask for. */}
              {stop.prepaid ? (
                <p className="delivery-stop-paid">Ya está pagado · no cobrar</p>
              ) : (
                <p className="delivery-stop-collect">
                  Cobrar {formatMoney(stop.totalMinor, 'ARS')}
                  <small>{stop.paymentExpectation}</small>
                </p>
              )}

              {stop.deliveryLocationUrl ? (
                <a
                  className="button button-secondary mt-3 w-full justify-center"
                  href={stop.deliveryLocationUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Abrir en el mapa
                </a>
              ) : null}

              {canTrigger ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    className="button button-secondary w-full justify-center"
                    onClick={() => void trigger(stop.id, 'ON_MY_WAY')}
                    type="button"
                  >
                    Estoy en camino
                  </button>
                  <button
                    className="button button-secondary w-full justify-center"
                    onClick={() => void trigger(stop.id, 'AT_ADDRESS')}
                    type="button"
                  >
                    Estoy en la puerta
                  </button>
                </div>
              ) : null}

              <button
                className="button button-primary mt-4 w-full"
                disabled={busyStopId === stop.id}
                onClick={() => {
                  void setStatus(stop.id, 'delivered');
                  if (canTrigger) void trigger(stop.id, 'DELIVERED_THANKS');
                }}
                type="button"
              >
                {busyStopId === stop.id ? 'Confirmando…' : 'Confirmar entrega'}
              </button>
              {/* Until now "entregado" was the only ending a repartidor could record, so a delivery
                  that failed either got marked delivered or left hanging. */}
              <button
                className="button button-secondary mt-2 w-full"
                disabled={busyStopId === stop.id}
                onClick={() => setFailingStop(stop)}
                type="button"
              >
                No se pudo entregar
              </button>
            </li>
          ))}
        </ul>
      )}
      {failingStop ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel">
            <h2 className="text-xl font-semibold text-forest">
              {failingStop.publicNumber} — ¿qué pasó?
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              El pedido se cancela con este motivo y queda registrado.
            </p>
            <div className="mt-4 grid gap-2">
              {reasons.map((reason) => (
                <button
                  className="button button-secondary w-full"
                  disabled={busyStopId === failingStop.id}
                  key={reason.id}
                  onClick={() => void reportFailure(failingStop.id, reason.id)}
                  type="button"
                >
                  {reason.displayName}
                </button>
              ))}
              {reasons.length === 0 ? (
                <p className="text-sm text-ink-muted">No hay motivos configurados.</p>
              ) : null}
            </div>
            <button
              className="button button-secondary mt-4 w-full"
              onClick={() => setFailingStop(null)}
              type="button"
            >
              Volver
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
