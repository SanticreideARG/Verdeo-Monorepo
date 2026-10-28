import { useEffect, useState } from 'react';

import { apiRequest } from '../lib/api.js';

export interface CancellationReason {
  active: boolean;
  code: string;
  countsAsFailedDelivery: boolean;
  displayName: string;
  id: string;
  sortOrder: number;
}

/**
 * Cancelling asks *why*, from a catalogue rather than free text.
 *
 * "Cancelado" alone cannot tell a customer who changed their mind from a delivery that failed, and
 * those need different follow-up: in the second case the food exists and the money may already be
 * collected. The reasons flagged as failed deliveries are grouped separately here for that reason —
 * the grouping comes from the data, not from a hardcoded list of names.
 */
export function CancelOrderDialog({
  cooked = false,
  onCancel,
  onConfirm,
  orderId,
  orderNumber,
}: {
  /** Para saber si ya salió en una planilla de cocina (2026-10-28). */
  orderId?: string;
  /** Ya se cocinó (confirmado, listo o entregado): se ofrece pasar sus viandas al stock. */
  cooked?: boolean;
  onCancel: () => void;
  onConfirm: (input: { notes: string; reasonId: string; toStock: boolean }) => Promise<void>;
  orderNumber: string;
}) {
  // Pasar lo cocinado al stock (2026-10-25): se pregunta, porque a veces se lo lleva igual.
  const [toStock, setToStock] = useState(false);
  const [reasons, setReasons] = useState<CancellationReason[]>([]);
  const [reasonId, setReasonId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  /*
   * Tres estados distintos, y antes eran uno solo.
   *
   * "Cargando motivos…" se mostraba mientras la lista estuviera vacía, así que un fallo de la
   * petición y una lista genuinamente vacía se veían igual que estar cargando: el cartel quedaba
   * para siempre y no había forma de cancelar el pedido ni de saber por qué.
   */
  const [loadingReasons, setLoadingReasons] = useState(true);
  /*
   * Si ya salió en una planilla de cocina (2026-10-28): se avisa y "Pasar a stock" viene tildado.
   * Un pedido cancelado después de que la planilla fue a cocina se cocinó igual; sin tildar, esa
   * comida no quedaba en ningún lado.
   */
  const [sentAt, setSentAt] = useState<string | null>(null);

  useEffect(() => {
    if (!cooked || !orderId) return;
    let active = true;
    void apiRequest(`/api/v1/orders/${orderId}/kitchen-status`, { notify: false }).then(
      async (response) => {
        if (!active || !response.ok) return;
        const body = (await response.json()) as { sentToKitchenAt: string | null };
        if (!active || !body.sentToKitchenAt) return;
        setSentAt(body.sentToKitchenAt);
        setToStock(true);
      },
    );
    return () => {
      active = false;
    };
  }, [cooked, orderId]);

  useEffect(() => {
    let active = true;
    void apiRequest('/api/v1/cancellation-reasons')
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          setError('No pudimos cargar los motivos de cancelación. Probá de nuevo en un momento.');
          return;
        }
        const body = (await response.json()) as { items: CancellationReason[] };
        if (!active) return;
        setReasons(body.items);
        setReasonId((current) => current || (body.items[0]?.id ?? ''));
      })
      .catch(() => {
        if (active) setError('No pudimos cargar los motivos de cancelación.');
      })
      .finally(() => {
        if (active) setLoadingReasons(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const failed = reasons.filter((reason) => reason.countsAsFailedDelivery);
  const other = reasons.filter((reason) => !reason.countsAsFailedDelivery);

  async function confirm() {
    if (!reasonId) {
      setError('Elegí un motivo.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onConfirm({ notes: notes.trim(), reasonId, toStock: cooked && toStock });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos cancelar el pedido.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Cancelar pedido">
      <div className="modal-panel">
        <h2 className="text-xl font-semibold text-forest">Cancelar el pedido de {orderNumber}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          El motivo queda registrado en el pedido y en su historial.
        </p>

        {loadingReasons ? (
          <p className="mt-4 text-sm text-ink-muted">Cargando motivos…</p>
        ) : reasons.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">
            No hay motivos de cancelación cargados. Se configuran en Ajustes.
          </p>
        ) : (
          <div className="mt-4 grid gap-4">
            {failed.length > 0 ? (
              <fieldset className="grid gap-1.5">
                <legend className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                  Entrega fallida — se produjo y no se pudo entregar
                </legend>
                {failed.map((reason) => (
                  <label className="flex items-center gap-2 text-sm" key={reason.id}>
                    <input
                      checked={reasonId === reason.id}
                      name="cancellationReason"
                      onChange={() => setReasonId(reason.id)}
                      type="radio"
                    />
                    {reason.displayName}
                  </label>
                ))}
              </fieldset>
            ) : null}

            {other.length > 0 ? (
              <fieldset className="grid gap-1.5">
                <legend className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                  Otros motivos
                </legend>
                {other.map((reason) => (
                  <label className="flex items-center gap-2 text-sm" key={reason.id}>
                    <input
                      checked={reasonId === reason.id}
                      name="cancellationReason"
                      onChange={() => setReasonId(reason.id)}
                      type="radio"
                    />
                    {reason.displayName}
                  </label>
                ))}
              </fieldset>
            ) : null}

            <label className="field">
              Detalle (opcional)
              <textarea
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ej. el portero no recibió el pedido"
                rows={2}
                value={notes}
              />
            </label>
            {cooked && sentAt ? (
              <p className="intake-rule intake-rule-alert" role="status">
                Este pedido ya salió en la planilla de cocina del{' '}
                {new Date(sentAt).toLocaleString('es-AR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
                : probablemente ya está cocinado. Si no lo está, destildá la casilla de abajo.
              </p>
            ) : null}
            {cooked ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  checked={toStock}
                  className="mt-1"
                  onChange={(event) => setToStock(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>Pasar las viandas a stock.</strong> Ya están cocinadas: quedan para
                  venderse desde Nuevo pedido (un Intuitivo, con sus platos). Si se reactiva el
                  pedido, vuelven.
                </span>
              </label>
            ) : null}
          </div>
        )}

        {error ? (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="button button-primary"
            disabled={saving || reasons.length === 0}
            onClick={() => void confirm()}
            type="button"
          >
            {saving ? 'Cancelando…' : 'Confirmar cancelación'}
          </button>
          <button
            className="button button-secondary"
            disabled={saving}
            onClick={onCancel}
            type="button"
          >
            Volver
          </button>
        </div>
      </div>
    </div>
  );
}
