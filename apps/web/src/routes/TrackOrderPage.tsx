import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { apiRequest } from '../lib/api.js';
import { errorMessage, formatMoney } from '../lib/operations.js';

interface TrackedOrder {
  currency: string;
  deliveryAddress: string;
  deliveryDate: string;
  history: { at: string; status: string }[];
  items: { productName: string; quantityUnits: number; variantName: string }[];
  notes: string | null;
  publicNumber: string;
  status: string;
  totalMinor: number;
}

const STATUS_LABELS: Record<string, string> = {
  CANCELLED: 'Cancelado',
  CONFIRMED: 'Confirmado',
  DELIVERED: 'Entregado',
  DRAFT: 'Recibido',
  READY: 'Listo para entrega',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

/** Public "seguimiento" — a visitor who doesn't want to create an account can still check their
 * order's status by pairing the publicNumber they were given at checkout with the same contact
 * (email or phone) they ordered with. See CMS_AND_PUBLIC_WEB.md "obtener seguimiento por
 * token/enlace" and IMPLEMENTATION_ROADMAP.md Fase 4 "tracking base". */
export function TrackOrderPage() {
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    setOrder(null);
    const form = new FormData(event.currentTarget);
    const response = await apiRequest('/api/v1/public/orders/track', {
      body: JSON.stringify({
        contact: formText(form, 'contact').trim(),
        publicNumber: formText(form, 'publicNumber').trim(),
      }),
      method: 'POST',
    });
    setSubmitting(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setOrder((await response.json()) as TrackedOrder);
  }

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link className="brand" to="/">
          <img className="brand-icon" src="/brand/verdeo-icon.png" alt="" width="36" height="36" />
          verdeo<span>.</span>
        </Link>
        <Link className="button button-secondary" to="/">
          Volver
        </Link>
      </header>
      <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-6 sm:px-8">
        <p className="eyebrow">Seguimiento</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-forest sm:text-5xl">
          ¿Cómo va tu pedido?
        </h1>
        <p className="mt-4 max-w-lg leading-7 text-ink-muted">
          Ingresá el número de pedido y el email o teléfono que usaste al pedir.
        </p>

        <form
          className="mt-8 rounded-[2rem] border border-forest/10 bg-white p-6 shadow-sm sm:p-8"
          onSubmit={(event) => void submit(event)}
        >
          <div className="form-grid">
            <label className="field field-wide">
              Número de pedido
              <input name="publicNumber" placeholder="Ej. NQN-00042" required />
            </label>
            <label className="field field-wide">
              Email o teléfono
              <input name="contact" required />
            </label>
          </div>
          <button className="button button-primary button-large mt-6" disabled={submitting}>
            {submitting ? 'Buscando…' : 'Buscar pedido'}
          </button>
          {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}
        </form>

        {order ? (
          <section className="mt-8 rounded-[2rem] border border-forest/10 bg-white p-6 shadow-sm sm:p-8">
            <p className="eyebrow">{order.publicNumber}</p>
            <h2 className="mt-2 text-2xl font-semibold text-forest">{statusLabel(order.status)}</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Entrega: {order.deliveryDate} · {order.deliveryAddress}
            </p>
            <ul className="mt-4 grid gap-1 text-sm text-ink-muted">
              {order.items.map((item, index) => (
                <li key={`${item.productName}-${index}`}>
                  {item.quantityUnits}× {item.productName} {item.variantName}
                </li>
              ))}
            </ul>
            <p className="mt-3 font-semibold text-forest">
              {formatMoney(order.totalMinor, order.currency)}
            </p>
            {order.notes ? (
              <p className="mt-2 text-sm text-ink-muted">Nota: {order.notes}</p>
            ) : null}
            {order.history.length > 0 ? (
              <div className="mt-6 border-t border-forest/10 pt-4">
                <p className="text-sm font-semibold text-forest">Historial</p>
                <ul className="mt-2 grid gap-1 text-sm text-ink-muted">
                  {order.history.map((entry, index) => (
                    <li key={`${entry.at}-${index}`}>
                      {timeLabel(entry.at)} · {statusLabel(entry.status)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
