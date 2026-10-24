import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ActionButton } from '../components/ActionButton.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { formatDay, todayInOperation } from '../lib/dates.js';
import { errorMessage, formatMoney } from '../lib/operations.js';
import { formatArgentinePhone, whatsappHref } from '../lib/phone.js';
import { showToast } from '../lib/toast.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

export interface ReceivableOrder {
  currency: string;
  cycleAlias: string;
  cycleCloseAt: string;
  deliveryDate: string;
  id: string;
  items: string;
  paymentExpectation: string;
  publicNumber: string;
  status: string;
  totalMinor: number;
}

export interface Receivable {
  customer: { displayName: string; id: string; phone: string | null; whatsapp: string | null };
  oldestDeliveryDate: string | null;
  orders: ReceivableOrder[];
  totalMinor: number;
}

type Sort = 'monto' | 'antiguedad';

/** "hace 3 semanas": desde cuándo se debe, contado desde la entrega más vieja. */
export function debtAge(deliveryDate: string | null, today: string): string {
  if (!deliveryDate) return '';
  const days = Math.max(
    0,
    Math.round(
      (Date.parse(`${today}T12:00:00`) - Date.parse(`${deliveryDate}T12:00:00`)) / 86_400_000,
    ),
  );
  if (days < 7) return days <= 1 ? 'desde esta semana' : `hace ${String(days)} días`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? 'hace 1 semana' : `hace ${String(weeks)} semanas`;
}

/** El mensaje para mandarle por WhatsApp: cada pedido adeudado y el total. */
export function reminderText(receivable: Receivable): string {
  const firstName = receivable.customer.displayName.split(/\s+/)[0] ?? '';
  const currency = receivable.orders[0]?.currency ?? 'ARS';
  const lines = receivable.orders.map(
    (order) =>
      `• ${formatDay(order.deliveryDate)}: ${order.items} — ${formatMoney(order.totalMinor, order.currency)}`,
  );
  return [
    `¡Hola${firstName ? ` ${firstName}` : ''}! Te escribimos de Verdeo: nos figura pendiente de pago:`,
    ...lines,
    `Total: ${formatMoney(receivable.totalMinor, currency)}.`,
    'Si ya lo pagaste, avisanos así lo registramos. ¡Gracias!',
  ].join('\n');
}

/**
 * "Por cobrar" (DISH_IDENTITY_AND_DEBTORS_PLAN.md, fase 4).
 *
 * Los clientes con pedidos impagos de períodos ya cerrados. No es un registro aparte: sale de los
 * pedidos, así que tildarlo cobrado acá o en Pedidos lo saca de la lista.
 */
export function ReceivablesPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [items, setItems] = useState<Receivable[] | null>(null);
  const [sort, setSort] = useState<Sort>('monto');
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [collecting, setCollecting] = useState<{
    customerName: string;
    orderIds: readonly string[];
    totalMinor: number;
  } | null>(null);

  const permissions = profile?.permissions ?? [];
  const canRead = permissions.includes('payments.read');
  const canCollect = permissions.includes('orders.edit');

  const load = useCallback(async () => {
    const response = await apiRequest('/api/v1/receivables');
    if (!response.ok) {
      setMessage(await errorMessage(response));
      setItems([]);
      return;
    }
    setItems(((await response.json()) as { items: Receivable[] }).items);
  }, []);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  /** Marcar como cobrado pide confirmación (2026-10-23): dice a quién y cuánto. */
  function askCollect(orderIds: readonly string[], customerName: string, totalMinor: number) {
    setCollecting({ customerName, orderIds, totalMinor });
  }

  async function collect(orderIds: readonly string[], customerName: string) {
    setMessage('');
    for (const id of orderIds) {
      const response = await apiRequest(`/api/v1/orders/${id}/paid`, {
        body: JSON.stringify({ paid: true }),
        method: 'POST',
      });
      if (!response.ok) {
        setMessage(await errorMessage(response));
        await load();
        return;
      }
    }
    showToast(
      orderIds.length === 1
        ? `Cobro de ${customerName} registrado.`
        : `${String(orderIds.length)} cobros de ${customerName} registrados.`,
    );
    await load();
  }

  if (failed) return <DashboardFailed label="lo que hay por cobrar" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Por cobrar</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver los cobros.</p>
        </section>
      </DashboardShell>
    );
  }

  const today = todayInOperation();
  const sorted = [...(items ?? [])].sort((left, right) =>
    sort === 'monto'
      ? right.totalMinor - left.totalMinor
      : (left.oldestDeliveryDate ?? '').localeCompare(right.oldestDeliveryDate ?? ''),
  );
  const grandTotal = sorted.reduce((sum, item) => sum + item.totalMinor, 0);
  const currency = sorted[0]?.orders[0]?.currency ?? 'ARS';

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="receivables-head">
          <div>
            <p className="dashboard-kicker">Cobros</p>
            <h1 className="text-2xl font-semibold text-forest">Por cobrar</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Pedidos de períodos cerrados que todavía no figuran cobrados.
            </p>
          </div>
          {items && items.length > 0 ? (
            <p className="receivables-total">
              <strong>{formatMoney(grandTotal, currency)}</strong>
              <span>{sorted.length === 1 ? '1 cliente' : `${String(sorted.length)} clientes`}</span>
            </p>
          ) : null}
        </header>

        {message ? (
          <p className="screen-notice mt-4" role="alert">
            {message}
          </p>
        ) : null}

        {items === null ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="empty-state mt-6">No hay nada pendiente de cobro. 🎉</p>
        ) : (
          <>
            <label className="field receivables-sort mt-5">
              Ordenar por
              <select onChange={(event) => setSort(event.target.value as Sort)} value={sort}>
                <option value="monto">Lo que más se debe</option>
                <option value="antiguedad">La deuda más vieja</option>
              </select>
            </label>
            <ul className="receivables-list mt-4">
              {sorted.map((item) => {
                const number = item.customer.whatsapp ?? item.customer.phone;
                const expanded = open === item.customer.id;
                return (
                  <li className="operation-card" key={item.customer.id}>
                    <button
                      aria-expanded={expanded}
                      className="receivables-row"
                      onClick={() => setOpen(expanded ? null : item.customer.id)}
                      type="button"
                    >
                      <span className="receivables-name">
                        <strong>{item.customer.displayName}</strong>
                        <small>
                          {item.orders.length === 1
                            ? '1 pedido'
                            : `${String(item.orders.length)} pedidos`}{' '}
                          · {debtAge(item.oldestDeliveryDate, today)}
                        </small>
                      </span>
                      <strong className="receivables-amount">
                        {formatMoney(item.totalMinor, item.orders[0]?.currency ?? 'ARS')}
                      </strong>
                    </button>
                    {expanded ? (
                      <div className="receivables-detail">
                        <ul>
                          {item.orders.map((order) => (
                            <li key={order.id}>
                              <span>
                                <Link to={`/app/pedidos/${order.id}`}>
                                  Entrega {formatDay(order.deliveryDate)}
                                </Link>{' '}
                                · {order.cycleAlias}
                                <small>
                                  {order.items} · {order.paymentExpectation}
                                </small>
                              </span>
                              <span className="receivables-order-actions">
                                <strong>{formatMoney(order.totalMinor, order.currency)}</strong>
                                {canCollect ? (
                                  <ActionButton
                                    className="button button-secondary"
                                    onClick={() =>
                                      askCollect(
                                        [order.id],
                                        item.customer.displayName,
                                        order.totalMinor,
                                      )
                                    }
                                    pendingLabel="Registrando…"
                                  >
                                    Cobrado
                                  </ActionButton>
                                ) : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div className="receivables-actions">
                          {number ? (
                            <a
                              className="button button-secondary"
                              href={whatsappHref(number, reminderText(item))}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Avisar por WhatsApp ({formatArgentinePhone(number)})
                            </a>
                          ) : (
                            <span className="text-sm text-ink-muted">Sin teléfono cargado.</span>
                          )}
                          {canCollect && item.orders.length > 1 ? (
                            <ActionButton
                              className="button button-primary"
                              onClick={() =>
                                askCollect(
                                  item.orders.map((order) => order.id),
                                  item.customer.displayName,
                                  item.totalMinor,
                                )
                              }
                              pendingLabel="Registrando…"
                            >
                              Cobrar todo
                            </ActionButton>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
      {collecting ? (
        <ConfirmDialog
          confirmLabel="Marcar como cobrado"
          detail={`${collecting.orderIds.length === 1 ? 'El pedido' : `Los ${String(collecting.orderIds.length)} pedidos`} de ${collecting.customerName} (${formatMoney(collecting.totalMinor, 'ARS')}) pasa${collecting.orderIds.length === 1 ? '' : 'n'} de pendiente a cobrado. Confirmalo sólo si el pago ya entró.`}
          onCancel={() => setCollecting(null)}
          onConfirm={async () => {
            await collect(collecting.orderIds, collecting.customerName);
            setCollecting(null);
          }}
          title="¿Ya pagó?"
        />
      ) : null}
    </DashboardShell>
  );
}
