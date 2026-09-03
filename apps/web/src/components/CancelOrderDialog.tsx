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
  onCancel,
  onConfirm,
  orderNumber,
}: {
  onCancel: () => void;
  onConfirm: (input: { notes: string; reasonId: string }) => Promise<void>;
  orderNumber: string;
}) {
  const [reasons, setReasons] = useState<CancellationReason[]>([]);
  const [reasonId, setReasonId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void apiRequest('/api/v1/cancellation-reasons')
      .then(async (response) => {
        if (!response.ok || !active) return;
        const body = (await response.json()) as { items: CancellationReason[] };
        if (!active) return;
        setReasons(body.items);
        setReasonId((current) => current || (body.items[0]?.id ?? ''));
      })
      .catch(() => undefined);
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
      await onConfirm({ notes: notes.trim(), reasonId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos cancelar el pedido.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Cancelar pedido">
      <div className="modal-panel">
        <h2 className="text-xl font-semibold text-forest">Cancelar {orderNumber}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          El motivo queda registrado en el pedido y en su historial.
        </p>

        {reasons.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">Cargando motivos…</p>
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
