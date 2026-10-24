import { useState } from 'react';
import { Link } from 'react-router-dom';

import { apiRequest } from '../lib/api.js';
import { errorMessage, orderStatusLabel } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';

export interface RunOrder {
  customerName: string;
  deliveryAddress: string;
  deliveryDate: string;
  deliveryRunId: string | null;
  id: string;
  items: string;
  located: boolean;
  neighborhood: string | null;
  paymentExpectation: string;
  publicNumber: string;
  status: string;
}

export interface MovedOrder {
  customerName: string;
  orderId: string;
  phone: string | null;
  publicNumber: string;
}

/**
 * Los pedidos de un reparto (o los que no tienen ninguno), agrupados por barrio, con selección
 * para moverlos a otro reparto (DELIVERY_RUNS_PLAN.md, regla 4). Moverlos les cambia la fecha a la
 * del destino; los que cambian de fecha vuelven con su cliente para ofrecer el aviso.
 */
export function DeliveryRunOrders({
  canManage,
  currentRunId,
  onMoved,
  orders,
  targets,
}: {
  canManage: boolean;
  /** El reparto que se está mirando: no aparece como destino. Nulo para "sin reparto". */
  currentRunId: string | null;
  onMoved: (result: { date: string; moved: MovedOrder[] }) => void;
  orders: readonly RunOrder[];
  targets: readonly { deliveryDate: string; id: string; label: string; title: string }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const destinos = targets.filter((option) => option.id !== currentRunId);
  const barrios = [...new Set(orders.map((order) => order.neighborhood ?? 'Sin barrio'))];

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function move() {
    const destino = destinos.find((option) => option.id === target);
    if (!destino || selected.size === 0) return;
    setBusy(true);
    setMessage('');
    const response = await apiRequest(`/api/v1/delivery/runs/${destino.id}/orders`, {
      body: JSON.stringify({ orderIds: [...selected] }),
      method: 'POST',
      notify: false,
    });
    setBusy(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const result = (await response.json()) as { moved: MovedOrder[]; total: number };
    showToast(
      `${String(result.total)} pedido${result.total === 1 ? '' : 's'} movido${result.total === 1 ? '' : 's'} a ${destino.title}.`,
    );
    setSelected(new Set());
    onMoved({ date: destino.deliveryDate, moved: result.moved });
  }

  if (orders.length === 0) {
    return <p className="text-sm text-ink-muted">No hay pedidos.</p>;
  }

  return (
    <div className="run-orders">
      {message ? (
        <p className="screen-notice" role="alert">
          {message}
        </p>
      ) : null}
      {barrios.map((barrio) => (
        <section key={barrio}>
          <h3 className="routes-neighborhood">{barrio}</h3>
          <ul>
            {orders
              .filter((order) => (order.neighborhood ?? 'Sin barrio') === barrio)
              .map((order) => (
                <li key={order.id}>
                  {canManage ? (
                    <input
                      aria-label={`Elegir el pedido de ${order.customerName}`}
                      checked={selected.has(order.id)}
                      onChange={() => toggle(order.id)}
                      type="checkbox"
                    />
                  ) : null}
                  <div>
                    <p>
                      <Link to={`/app/pedidos/${order.id}`}>
                        <strong>{order.customerName}</strong>
                      </Link>
                    </p>
                    <small>
                      {[
                        order.items,
                        order.deliveryAddress,
                        orderStatusLabel(order.status),
                        order.located ? null : 'sin ubicación',
                        order.paymentExpectation.trim() ? null : 'sin medio de pago',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
      {canManage && destinos.length > 0 ? (
        <div className="run-orders-move">
          <label className="field">
            Mover {selected.size > 0 ? `los ${String(selected.size)} elegidos` : 'los elegidos'} a
            <select onChange={(event) => setTarget(event.target.value)} value={target}>
              <option value="">Elegir reparto…</option>
              {destinos.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title} · {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button-primary"
            disabled={busy || selected.size === 0 || !target}
            onClick={() => void move()}
            type="button"
          >
            {busy ? 'Moviendo…' : 'Mover'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
