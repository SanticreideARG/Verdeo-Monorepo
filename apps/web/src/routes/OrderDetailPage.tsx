import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import {
  errorMessage,
  formatMoney,
  type OrderRevision,
  type OrderStatusHistoryEntry,
  type OrderSummary,
} from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function statusLabel(status: OrderSummary['status'] | null): string {
  return status ?? '—';
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

/** "Ver pedidos" drills into here for a single order: full detail, status history, revision
 * history, and an edit form for everything a PATCH can change short of the line composition —
 * reprogramming date/address/payment/notes requires a reason, mirroring the audit-first design of
 * `orderUpdate` on the backend. Line-item editing (re-picking offerings) is not built yet; see
 * CRM_ORDER_CYCLE_IMPLEMENTATION.md "Still OPEN". */
export function OrderDetailPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [history, setHistory] = useState<OrderStatusHistoryEntry[]>([]);
  const [revisions, setRevisions] = useState<OrderRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [orderResponse, historyResponse, revisionResponse] = await Promise.all([
      apiRequest(`/api/v1/orders/${id}`),
      apiRequest(`/api/v1/orders/${id}/history`),
      apiRequest(`/api/v1/orders/${id}/revisions`),
    ]);
    if (orderResponse.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    if (!orderResponse.ok) {
      setMessage(await errorMessage(orderResponse));
      setLoading(false);
      return;
    }
    setOrder((await orderResponse.json()) as OrderSummary);
    if (historyResponse.ok) {
      setHistory(((await historyResponse.json()) as { items: OrderStatusHistoryEntry[] }).items);
    }
    if (revisionResponse.ok) {
      setRevisions(((await revisionResponse.json()) as { items: OrderRevision[] }).items);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!profile?.permissions.includes('orders.read')) return;
    void load();
  }, [load, profile?.permissions]);

  async function transition(status: OrderSummary['status']) {
    if (!order) return;
    setMessage('');
    const reason =
      status === 'CANCELLED' ? window.prompt('Motivo de cancelación')?.trim() : undefined;
    if (status === 'CANCELLED' && !reason) return;
    const response = await apiRequest(`/api/v1/orders/${order.id}/status`, {
      body: JSON.stringify({ confirmedReversal: false, reason, status }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setMessage(`Pedido actualizado a ${status}.`);
    await load();
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order) return;
    const form = new FormData(event.currentTarget);
    const dietaryInstructions = formText(form, 'dietaryInstructions')
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean);
    const notes = formText(form, 'notes').trim();
    const locationUrl = formText(form, 'deliveryLocationUrl').trim();
    setMessage('');
    const response = await apiRequest(`/api/v1/orders/${order.id}`, {
      body: JSON.stringify({
        deliveryAddress: formText(form, 'deliveryAddress').trim(),
        deliveryDate: formText(form, 'deliveryDate'),
        deliveryLocationUrl: locationUrl ? locationUrl : null,
        dietaryInstructions,
        notes: notes ? notes : null,
        paymentExpectation: formText(form, 'paymentExpectation').trim(),
        reason: formText(form, 'reason').trim(),
      }),
      method: 'PATCH',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setMessage('Pedido actualizado.');
    setEditing(false);
    await load();
  }

  if (failed) return <DashboardFailed label="el pedido" />;
  if (!profile) return <DashboardLoading />;

  if (!profile.permissions.includes('orders.read')) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Pedido</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver pedidos.</p>
        </section>
      </DashboardShell>
    );
  }

  if (loading) return <DashboardLoading />;

  if (notFound || !order) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Pedido no encontrado</h1>
          <Link className="button button-secondary mt-5 inline-flex" to="/app/pedidos">
            Volver a Ver pedidos
          </Link>
        </section>
      </DashboardShell>
    );
  }

  const canEdit = profile.permissions.includes('orders.edit');
  const canConfirm = profile.permissions.includes('orders.confirm');
  const canCancel = profile.permissions.includes('orders.cancel');

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="dashboard-kicker">Pedidos</p>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-forest">{order.publicNumber}</h1>
              <span className="status-chip">{order.status}</span>
            </div>
            <p className="mt-2 text-sm text-ink-muted">{order.customer.displayName}</p>
          </div>
          <Link className="button button-secondary" to="/app/pedidos">
            Volver a Ver pedidos
          </Link>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          {order.status === 'DRAFT' && canConfirm ? (
            <button className="button button-primary" onClick={() => void transition('CONFIRMED')}>
              Confirmar
            </button>
          ) : null}
          {order.status === 'CONFIRMED' && canEdit ? (
            <button className="button button-secondary" onClick={() => void transition('READY')}>
              Marcar listo
            </button>
          ) : null}
          {['DRAFT', 'CONFIRMED'].includes(order.status) && canCancel ? (
            <button
              className="button button-secondary"
              onClick={() => void transition('CANCELLED')}
            >
              Cancelar
            </button>
          ) : null}
          {canEdit ? (
            <button
              className="button button-secondary"
              onClick={() => setEditing((current) => !current)}
              type="button"
            >
              {editing ? 'Cerrar edición' : 'Editar pedido'}
            </button>
          ) : null}
        </div>

        {editing && canEdit ? (
          <form className="operation-card mt-6 max-w-xl" onSubmit={(event) => void saveEdit(event)}>
            <div className="form-grid">
              <label className="field field-wide">
                Dirección
                <input
                  defaultValue={order.deliveryAddress}
                  minLength={4}
                  name="deliveryAddress"
                  required
                />
              </label>
              <label className="field">
                Entrega
                <input defaultValue={order.deliveryDate} name="deliveryDate" required type="date" />
              </label>
              <label className="field">
                Pago esperado
                <input defaultValue={order.paymentExpectation} name="paymentExpectation" required />
              </label>
              <label className="field field-wide">
                Enlace de ubicación
                <input defaultValue={order.deliveryLocationUrl ?? ''} name="deliveryLocationUrl" />
              </label>
              <label className="field field-wide">
                Indicaciones para cocina
                <textarea
                  defaultValue={order.dietaryInstructions.join('\n')}
                  name="dietaryInstructions"
                  placeholder="Una por línea"
                  rows={2}
                />
              </label>
              <label className="field field-wide">
                Notas
                <textarea defaultValue={order.notes ?? ''} name="notes" rows={2} />
              </label>
              <label className="field field-wide">
                Motivo del cambio
                <input
                  maxLength={500}
                  minLength={3}
                  name="reason"
                  placeholder="Obligatorio"
                  required
                />
              </label>
            </div>
            <button className="button button-primary mt-4" type="submit">
              Guardar cambios
            </button>
          </form>
        ) : null}

        <div className="mt-8 grid gap-3">
          <h2 className="text-sm font-bold text-forest">Ítems</h2>
          {order.items.map((item) => (
            <article className="operation-card" key={item.id}>
              <div className="flex items-center justify-between gap-3">
                <strong>
                  {item.productName} {item.variantName} × {item.quantityUnits}
                </strong>
                <span>{formatMoney(item.totalMinor, order.currency)}</span>
              </div>
              {item.dishSelections.length > 0 ? (
                <p className="mt-1 text-sm text-ink-muted">{item.dishSelections.join(', ')}</p>
              ) : null}
            </article>
          ))}
          <p className="text-right font-semibold">
            {formatMoney(order.totalMinor, order.currency)}
          </p>
        </div>

        <div className="mt-8 grid gap-2">
          <h2 className="text-sm font-bold text-forest">Historial de estado</h2>
          {history.map((entry) => (
            <p className="text-sm text-ink-muted" key={entry.id}>
              {timeLabel(entry.createdAt)} · {statusLabel(entry.fromStatus)} → {entry.toStatus}
              {entry.reason ? ` · ${entry.reason}` : ''}
            </p>
          ))}
          {history.length === 0 ? <p className="text-sm text-ink-muted">Sin registros.</p> : null}
        </div>

        {revisions.length > 0 ? (
          <div className="mt-8 grid gap-2">
            <h2 className="text-sm font-bold text-forest">Historial de ediciones</h2>
            {revisions.map((revision) => (
              <p className="text-sm text-ink-muted" key={revision.id}>
                {timeLabel(revision.createdAt)} · revisión #{revision.revision} · {revision.reason}
              </p>
            ))}
          </div>
        ) : null}
      </section>
    </DashboardShell>
  );
}
