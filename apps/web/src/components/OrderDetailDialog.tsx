import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import { formatDayLong, formatMoment } from '../lib/dates.js';
import { formatArgentinePhone, whatsappHref } from '../lib/phone.js';
import { paymentMethodLabel, type PaymentChoice } from '../lib/paymentMethods.js';
import { formatMoney, orderStatusLabel, type OrderSummary } from '../lib/operations.js';

function mapHref(order: OrderSummary): string | null {
  if (order.deliveryLocationUrl) return order.deliveryLocationUrl;
  if (order.deliveryLatitude !== null && order.deliveryLongitude !== null) {
    return `https://www.google.com/maps?q=${String(order.deliveryLatitude)},${String(order.deliveryLongitude)}`;
  }
  if (order.deliveryAddress) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.deliveryAddress)}`;
  }
  return null;
}

/**
 * El pedido entero, sin salir de la cola.
 *
 * Tocar una fila llevaba a la pantalla del pedido, y volver dejaba la cola arriba de todo: con
 * treinta pedidos cargados, mirar tres seguidos costaba tres viajes de ida y vuelta y tres
 * scrolleos. Lo que se quiere al tocar una fila casi nunca es editarla — es ver el teléfono, la
 * dirección, qué pidió y si pagó.
 *
 * Así que esto muestra todo lo que la lista ya trajo, sin pedir nada más al servidor, y deja la
 * pantalla del pedido a un clic para lo que sí es editar.
 *
 * Las acciones no se repiten acá a propósito. Confirmar, marcar listo, revertir y cancelar viven en
 * la tarjeta, que es donde se las busca; un segundo lugar para la misma acción obliga a mantener
 * dos veces las mismas reglas de permisos y de estado, y tarde o temprano una de las dos se olvida.
 */
export function OrderDetailDialog({
  onClose,
  order,
  paymentMethods = [],
}: {
  onClose: () => void;
  order: OrderSummary;
  paymentMethods?: readonly PaymentChoice[];
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const phone = order.customer.whatsapp ?? order.customer.phone;
  const map = mapHref(order);
  const units = order.items.reduce((total, item) => total + item.quantityUnits, 0);

  return (
    <div
      aria-label={`Pedido ${order.publicNumber}`}
      aria-modal="true"
      className="modal-backdrop"
      role="dialog"
    >
      <div className="modal-panel order-detail">
        <header className="order-detail-head">
          <div>
            <p className="eyebrow">{order.publicNumber}</p>
            <h2>{order.customer.displayName}</h2>
          </div>
          <span className="order-detail-status" data-status={order.status}>
            {orderStatusLabel(order.status)}
          </span>
          <button aria-label="Cerrar" onClick={onClose} ref={closeRef} type="button">
            ✕
          </button>
        </header>

        <div className="order-detail-body">
          <section>
            <h3>Entrega</h3>
            <dl>
              <div>
                <dt>Fecha</dt>
                <dd>{formatDayLong(order.deliveryDate)}</dd>
              </div>
              {order.operatingSiteName ? (
                <div>
                  <dt>Ciudad</dt>
                  <dd>{order.operatingSiteName}</dd>
                </div>
              ) : null}
              {order.deliveryZone ? (
                <div>
                  <dt>Zona</dt>
                  <dd>{order.deliveryZone}</dd>
                </div>
              ) : null}
              <div>
                <dt>Domicilio</dt>
                <dd>
                  {order.deliveryAddress || 'Sin domicilio cargado'}
                  {map ? (
                    <>
                      {' '}
                      <a href={map} rel="noreferrer" target="_blank">
                        Ver en el mapa
                      </a>
                    </>
                  ) : null}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h3>Contacto</h3>
            <dl>
              <div>
                <dt>WhatsApp</dt>
                <dd>
                  {phone ? (
                    <a href={whatsappHref(phone)} rel="noreferrer" target="_blank">
                      {formatArgentinePhone(phone)}
                    </a>
                  ) : (
                    'Sin teléfono cargado'
                  )}
                </dd>
              </div>
              {order.customer.email ? (
                <div>
                  <dt>Correo</dt>
                  <dd>{order.customer.email}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section>
            <h3>Qué pidió</h3>
            <ul className="order-detail-items">
              {order.items.map((item) => (
                <li key={item.id}>
                  <span>
                    {item.productName} {item.variantName}
                    {item.quantityUnits > 1 ? ` ×${String(item.quantityUnits)}` : ''}
                  </span>
                  <b>{formatMoney(item.totalMinor, order.currency)}</b>
                  {/* Los platos de un Intuitivo: sin esto, dos Intuitivo del mismo tamaño se ven
                      idénticos y no hay forma de saber qué lleva cada uno. */}
                  {item.dishSelections.length > 0 ? (
                    <small>{item.dishSelections.join(' · ')}</small>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="order-detail-total">
              <span>
                {units} {units === 1 ? 'unidad' : 'unidades'}
              </span>
              <b>{formatMoney(order.totalMinor, order.currency)}</b>
            </p>
          </section>

          <section>
            <h3>Cobro</h3>
            <dl>
              <div>
                <dt>Medio</dt>
                <dd>{paymentMethodLabel(order.paymentExpectation, paymentMethods)}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                {/* Lo que importa no es que exista un pago, es si la plata entró y cuándo. */}
                <dd>{order.paidAt ? `Cobrado ${formatMoment(order.paidAt)}` : 'Sin cobrar'}</dd>
              </div>
            </dl>
          </section>

          {order.dietaryInstructions.length > 0 || order.notes ? (
            <section>
              <h3>Indicaciones</h3>
              {order.dietaryInstructions.length > 0 ? (
                <p>{order.dietaryInstructions.join(' · ')}</p>
              ) : null}
              {order.notes ? <p>{order.notes}</p> : null}
            </section>
          ) : null}

          <section>
            <h3>Registro</h3>
            <dl>
              <div>
                <dt>Origen</dt>
                <dd>{order.source}</dd>
              </div>
              <div>
                <dt>Tomado</dt>
                <dd>{formatMoment(order.createdAt)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <footer className="order-detail-foot">
          <Link className="button button-secondary" to={`/app/pedidos/${order.id}`}>
            Abrir para editar
          </Link>
          <button className="button button-primary" onClick={onClose} type="button">
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}
