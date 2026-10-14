import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiRequest } from '../lib/api.js';
import { formatMoment } from '../lib/dates.js';
import { errorMessage, formatMoney, orderStatusLabel } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';
import { ConfirmDialog } from './ConfirmDialog.js';

interface DuplicateOrder {
  createdAt: string;
  id: string;
  paid: boolean;
  publicNumber: string;
  source: string;
  status: string;
  totalMinor: number;
}

interface DuplicateGroup {
  customerName: string;
  orders: DuplicateOrder[];
  summary: string;
}

/**
 * Los pedidos repetidos del período: el mismo cliente con exactamente el mismo pedido más de una
 * vez (una planilla importada dos veces, un pedido cargado a mano y también por correo).
 *
 * Se conserva el más viejo de cada grupo y los demás se pueden eliminar acá mismo, con el borrado
 * de siempre: pide confirmación, deja el motivo y queda auditado. No se elimina nada solo, porque
 * dos pedidos iguales pueden ser legítimos. No aparece si no hay repetidos.
 */
export function DuplicateOrdersPanel({
  canDelete,
  onChanged,
}: {
  canDelete: boolean;
  onChanged: () => void;
}) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [pending, setPending] = useState<{ keep: DuplicateOrder; order: DuplicateOrder } | null>(
    null,
  );
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await apiRequest('/api/v1/orders/duplicates', { notify: false });
    if (response.ok) setGroups(((await response.json()) as { groups: DuplicateGroup[] }).groups);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(order: DuplicateOrder, keep: DuplicateOrder) {
    setMessage('');
    const response = await apiRequest(`/api/v1/orders/${order.id}`, {
      body: JSON.stringify({ reason: `Pedido repetido de ${keep.publicNumber}` }),
      method: 'DELETE',
      notify: false,
    });
    setPending(null);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    showToast(`${order.publicNumber} eliminado. Queda ${keep.publicNumber}.`);
    await load();
    onChanged();
  }

  if (groups.length === 0) return null;
  const extras = groups.reduce((total, group) => total + group.orders.length - 1, 0);

  return (
    <section className="inbound-panel duplicate-orders">
      <h2>
        Pedidos repetidos en el período <span className="status-chip">{extras}</span>
      </h2>
      <p className="text-sm text-ink-muted">
        El mismo cliente con exactamente el mismo pedido más de una vez. Se conserva el más viejo de
        cada grupo; revisá los demás y eliminá los que sobran.
      </p>
      {message ? (
        <p className="screen-notice" role="alert">
          {message}
        </p>
      ) : null}
      <ul>
        {groups.map((group) => {
          const [keep] = group.orders;
          if (!keep) return null;
          return (
            <li className="duplicate-orders-group" key={keep.id}>
              <div>
                <strong>{group.customerName}</strong>
                <small>{group.summary}</small>
              </div>
              <ol>
                {group.orders.map((order) => (
                  <li key={order.id}>
                    <Link to={`/app/pedidos/${order.id}`}>{order.publicNumber}</Link>
                    <small>
                      {formatMoment(order.createdAt)} · {orderStatusLabel(order.status)} ·{' '}
                      {formatMoney(order.totalMinor, 'ARS')}
                      {order.paid ? ' · cobrado' : ''}
                    </small>
                    {order === keep ? (
                      <span className="inbound-kind">Se conserva</span>
                    ) : canDelete ? (
                      <button
                        className="button button-secondary"
                        onClick={() => setPending({ keep, order })}
                        type="button"
                      >
                        Eliminar
                      </button>
                    ) : null}
                  </li>
                ))}
              </ol>
            </li>
          );
        })}
      </ul>
      {pending ? (
        <ConfirmDialog
          confirmLabel={`Eliminar ${pending.order.publicNumber}`}
          detail={`Se elimina ${pending.order.publicNumber} y queda ${pending.keep.publicNumber}, que es el mismo pedido. Queda registrado como "Pedido repetido de ${pending.keep.publicNumber}".${pending.order.paid ? ' Este pedido figura cobrado: revisá el cobro antes.' : ''}`}
          onCancel={() => setPending(null)}
          onConfirm={() => remove(pending.order, pending.keep)}
          title="Eliminar el pedido repetido"
          tone="destructivo"
        />
      ) : null}
    </section>
  );
}
