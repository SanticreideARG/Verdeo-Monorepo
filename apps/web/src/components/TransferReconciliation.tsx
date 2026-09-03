import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { apiRequest } from '../lib/api.js';
import { errorMessage, formatMoney } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';

interface Reconciliation {
  amountMinor: number;
  createdAt: string;
  currency: string;
  id: string;
  notes: string | null;
  operationCode: string;
  receiptExpiresAt: string | null;
  receiptUrl: string | null;
  reconciledByName: string;
}

/** FormData.get returns string | File | null; only a string is ever meaningful here. */
function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

/**
 * "Conciliar transferencias": the evidence that a transfer actually arrived, tied to one order.
 *
 * A transfer used to be marked paid on somebody's word — the system trusted whoever ticked the box
 * and never saw the bank. This records the operation code, the amount and the receipt instead, and
 * settles the order in the same step.
 */
export function TransferReconciliation({
  canRecord,
  orderId,
}: {
  canRecord: boolean;
  orderId: string;
}) {
  const [items, setItems] = useState<Reconciliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState<{ expiresAt: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    const response = await apiRequest(`/api/v1/payments/orders/${orderId}/transfers`);
    if (!response.ok) throw new Error(await errorMessage(response));
    setItems(((await response.json()) as { items: Reconciliation[] }).items);
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    void load().catch((error: unknown) => {
      setLoading(false);
      setMessage(error instanceof Error ? error.message : 'No pudimos cargar las conciliaciones.');
    });
  }, [load]);

  async function uploadReceipt(file: File) {
    setUploading(true);
    setMessage('');
    try {
      const response = await apiRequest('/api/v1/payments/receipts', {
        body: file,
        headers: { 'content-type': file.type },
        method: 'POST',
      });
      if (!response.ok) {
        setMessage(await errorMessage(response));
        return;
      }
      setReceipt((await response.json()) as { expiresAt: string; url: string });
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const operationCode = formText(form, 'operationCode');
    const amount = Number(form.get('amount'));

    if (!/^[0-9]{6,32}$/.test(operationCode)) {
      setMessage('El código de operación son sólo dígitos (6 a 32). El de Mercado Pago tiene 10.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage('Ingresá el monto de la transferencia.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const response = await apiRequest(`/api/v1/payments/orders/${orderId}/transfers`, {
        body: JSON.stringify({
          amountMinor: Math.round(amount * 100),
          notes: formText(form, 'notes') || undefined,
          operationCode,
          ...(receipt ? { receiptExpiresAt: receipt.expiresAt, receiptUrl: receipt.url } : {}),
        }),
        method: 'POST',
      });
      if (!response.ok) {
        setMessage(await errorMessage(response));
        return;
      }
      formRef.current?.reset();
      setReceipt(null);
      showToast('Transferencia conciliada. El pedido queda pagado.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos conciliar la transferencia.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="operation-card mt-4">
      <h2 className="text-lg font-semibold text-forest">Transferencias conciliadas</h2>
      <p className="mt-1 text-sm text-ink-muted">
        El código de operación es único: la misma transferencia no puede pagar dos pedidos.
      </p>

      {message ? (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {message}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-ink-muted">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">Todavía no hay transferencias conciliadas.</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {items.map((item) => (
            <li className="rounded-xl border border-forest/10 p-3" key={item.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-forest">
                  {formatMoney(item.amountMinor, item.currency)} · op. {item.operationCode}
                </p>
                <p className="text-xs text-ink-muted">
                  {dateLabel(item.createdAt)} · {item.reconciledByName}
                </p>
              </div>
              {item.notes ? <p className="mt-1 text-sm text-ink-muted">{item.notes}</p> : null}
              {item.receiptUrl ? (
                <a
                  className="mt-2 inline-block text-sm underline"
                  href={item.receiptUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Ver comprobante
                  {item.receiptExpiresAt
                    ? ` (disponible hasta ${dateLabel(item.receiptExpiresAt)})`
                    : ''}
                </a>
              ) : (
                <p className="mt-2 text-xs text-ink-muted">Sin comprobante adjunto.</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {canRecord ? (
        <form className="mt-5" onSubmit={(event) => void submit(event)} ref={formRef}>
          <div className="form-grid">
            <label className="field">
              Código de operación
              <input inputMode="numeric" name="operationCode" placeholder="1234567890" required />
            </label>
            <label className="field">
              Monto transferido
              <input min="0" name="amount" required step="0.01" type="number" />
            </label>
            <label className="field field-wide">
              Notas (opcional)
              <input name="notes" placeholder="Ej. transferencia desde otra titularidad" />
            </label>
          </div>

          <div className="mt-3">
            <input
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void uploadReceipt(file);
              }}
              ref={receiptInputRef}
              type="file"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="button button-secondary"
                disabled={uploading}
                onClick={() => receiptInputRef.current?.click()}
                type="button"
              >
                {uploading ? 'Subiendo…' : receipt ? 'Cambiar comprobante' : 'Adjuntar comprobante'}
              </button>
              {receipt ? (
                <span className="text-sm text-ink-muted">
                  Comprobante adjunto · se guarda 40 días
                </span>
              ) : null}
            </div>
          </div>

          <button className="button button-primary mt-4" disabled={saving} type="submit">
            {saving ? 'Conciliando…' : 'Conciliar transferencia'}
          </button>
        </form>
      ) : null}
    </section>
  );
}
