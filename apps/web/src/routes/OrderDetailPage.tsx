import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { CancelOrderDialog } from '../components/CancelOrderDialog.js';
import { DeliveryMap } from '../components/DeliveryMap.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest, storedOperatingSiteId } from '../lib/api.js';
import { formatDayLong, formatMoment } from '../lib/dates.js';
import {
  OrderItemsEditor,
  itemsFromOrder,
  toItemPayload,
  type EditableItem,
} from '../components/OrderItemsEditor.js';
import {
  errorMessage,
  formatMoney,
  orderStatusLabel,
  type MenuOffering,
  type OrderRevision,
  type OrderStatusHistoryEntry,
  type OrderSummary,
  type WeeklyMenu,
} from '../lib/operations.js';
import { sourceLabel } from '../lib/orderColumns.js';
import { showToast } from '../lib/toast.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';
import { useOrderFormSettings } from '../lib/useOrderFormSettings.js';

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function statusLabel(status: OrderSummary['status'] | null): string {
  return status ? orderStatusLabel(status) : '—';
}

async function printLabels(orderId: string): Promise<string | null> {
  const response = await apiRequest(`/api/v1/orders/${orderId}/labels/export`);
  if (!response.ok) return errorMessage(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  // Revocar en el mismo turno corre carrera con la pestaña que recién se abre: a veces se queda
  // sin nada que cargar. Se libera un segundo después, ya con la página leída.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return null;
}

/** "Ver pedidos" drills into here for a single order: full detail, status history, revision
 * history, and an edit form for everything a PATCH can change — incluidos los ítems, que son lo que
 * más cambia. Todo cambio pide un motivo, igual que `orderUpdate` en el backend.
 *
 * Los ítems se editan en borradores y confirmados; de READY en adelante el backend lo rechaza,
 * porque a esa altura la cocina ya produjo contra esa composición. */
export function OrderDetailPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [history, setHistory] = useState<OrderStatusHistoryEntry[]>([]);
  const [revisions, setRevisions] = useState<OrderRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  /*
   * Los ítems se editan como estado y no como campos del formulario: son una lista de largo
   * variable con una sublista de platos adentro, que en `FormData` habría que serializar a mano y
   * volver a parsear.
   *
   * Las variedades salen del menú del propio pedido y no del de esta semana: un pedido de una
   * semana ya cerrada se sigue editando contra lo que esa semana ofrecía.
   */
  const [items, setItems] = useState<EditableItem[]>([]);
  const [offerings, setOfferings] = useState<MenuOffering[]>([]);
  /*
   * A qué semana pertenece el pedido.
   *
   * La ficha mostraba cliente, contacto, domicilio, entrega y pago, pero no la semana — que es la
   * que determina qué menú se le pudo vender y si todavía se puede editar. Sale del mismo pedido de
   * menús que ya se hace para poder editar los ítems, así que no cuesta una consulta más.
   */
  const [cycle, setCycle] = useState<{ alias: string; id: string } | null>(null);
  /*
   * Si se piden indicaciones alimentarias. Apagado saca el campo del formulario, no el dato: un
   * pedido viejo que las tiene las sigue mostrando más abajo, porque eso fue lo que pasó.
   */
  const { dietaryInstructionsEnabled } = useOrderFormSettings({ siteId: storedOperatingSiteId() });

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
    const loaded = (await orderResponse.json()) as OrderSummary;
    setOrder(loaded);
    setItems(itemsFromOrder(loaded));
    // El menú del pedido, para saber qué variedades se pueden elegir. Falla en silencio a
    // propósito: sin él la ficha se sigue viendo entera, sólo que no se pueden editar los ítems.
    void apiRequest('/api/v1/menus')
      .then(async (response) => {
        if (!response.ok) return;
        const menus = ((await response.json()) as { items: WeeklyMenu[] }).items;
        const menu = menus.find((candidate) => candidate.id === loaded.menuId);
        setOfferings(menu?.offerings ?? []);
        setCycle(menu ? { alias: menu.cycle.alias, id: menu.cycle.id } : null);
      })
      .catch(() => undefined);
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
    if (status === 'CANCELLED') {
      setCancelOpen(true);
      return;
    }
    setMessage('');
    const response = await apiRequest(`/api/v1/orders/${order.id}/status`, {
      body: JSON.stringify({ confirmedReversal: false, status }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setMessage(`Pedido actualizado a ${status}.`);
    await load();
  }

  async function cancelOrder({ notes, reasonId }: { notes: string; reasonId: string }) {
    if (!order) return;
    const response = await apiRequest(`/api/v1/orders/${order.id}/status`, {
      body: JSON.stringify({
        cancellationNotes: notes || undefined,
        cancellationReasonId: reasonId,
        confirmedReversal: false,
        status: 'CANCELLED',
      }),
      method: 'POST',
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    setCancelOpen(false);
    showToast('Pedido cancelado.');
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
    // Los ítems se mandan sólo si alguno cambió: un PATCH que los reenvía iguales igual dispara la
    // reescritura y la revisión auditada, y ensucia el historial con cambios que no lo son.
    const itemsChanged = JSON.stringify(items) !== JSON.stringify(itemsFromOrder(order));
    if (itemsChanged) {
      if (items.length === 0) {
        setMessage('El pedido tiene que llevar al menos un ítem.');
        return;
      }
      const incomplete = items.find(
        (item) =>
          !item.offeringId ||
          (offerings.find((offering) => offering.id === item.offeringId)?.composable === true &&
            item.selectedDishNames.length !== 5),
      );
      if (incomplete) {
        setMessage(
          !incomplete.offeringId
            ? 'Hay un ítem sin variedad elegida.'
            : 'Un Intuitivo tiene que llevar exactamente cinco platos.',
        );
        return;
      }
    }

    setMessage('');
    const response = await apiRequest(`/api/v1/orders/${order.id}`, {
      body: JSON.stringify({
        deliveryAddress: formText(form, 'deliveryAddress').trim(),
        deliveryDate: formText(form, 'deliveryDate'),
        deliveryLocationUrl: locationUrl ? locationUrl : null,
        dietaryInstructions,
        ...(itemsChanged ? { items: toItemPayload(items, offerings) } : {}),
        notes: notes ? notes : null,
        paymentExpectation: formText(form, 'paymentExpectation').trim(),
        // El motivo es opcional: pedirlo obligatorio no producía mejores motivos, frenaba la
        // edición del pedido, que es lo que de verdad hay que poder hacer.
        ...(formText(form, 'reason').trim() ? { reason: formText(form, 'reason').trim() } : {}),
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
              <h1 className="text-2xl font-semibold text-forest">{order.customer.displayName}</h1>
              <span className="status-chip">{orderStatusLabel(order.status)}</span>
            </div>
            {/* El número queda a mano —es lo que se dicta por teléfono— pero sin encabezar. */}
            <p className="order-card-meta mt-2">{order.publicNumber}</p>
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
          <button
            className="button button-secondary"
            onClick={() => void printLabels(order.id).then((error) => error && setMessage(error))}
            type="button"
          >
            Generar etiquetas
          </button>
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
              {dietaryInstructionsEnabled || order.dietaryInstructions.length > 0 ? (
                <label className="field field-wide">
                  Indicaciones para cocina
                  <textarea
                    defaultValue={order.dietaryInstructions.join('\n')}
                    name="dietaryInstructions"
                    placeholder="Una por línea"
                    rows={2}
                  />
                </label>
              ) : null}
              <label className="field field-wide">
                Notas
                <textarea defaultValue={order.notes ?? ''} name="notes" rows={2} />
              </label>
              <label className="field field-wide">
                Motivo del cambio
                <input maxLength={500} name="reason" placeholder="Opcional" />
              </label>
            </div>

            {/*
             * Los ítems son lo que más cambia —alguien pide dos y quiere tres, o cambia la variedad
             * el día antes—. Se editan en borradores y confirmados; de READY en adelante el backend
             * lo rechaza, así que acá no se ofrece.
             */}
            {order.status === 'DRAFT' || order.status === 'CONFIRMED' ? (
              <section className="mt-6">
                <h3 className="text-sm font-bold text-forest">Ítems</h3>
                {offerings.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">
                    No pudimos cargar las variedades de la semana de este pedido, así que los ítems
                    no se pueden editar acá.
                  </p>
                ) : (
                  <OrderItemsEditor items={items} offerings={offerings} onChange={setItems} />
                )}
              </section>
            ) : null}

            <button className="button button-primary mt-4" type="submit">
              Guardar cambios
            </button>
          </form>
        ) : null}

        {/*
         * Los datos a la izquierda y el mapa a la derecha; en el teléfono, el mapa debajo. Encontrar
         * la puerta y llamar al cliente son las dos acciones que siguen a abrir un pedido, y las dos
         * significaban salir de la pantalla.
         */}
        <div className="order-detail-body mt-8">
          <dl className="order-facts">
            <div>
              <dt>Cliente</dt>
              <dd>
                <Link className="underline" to={`/app/clientes?customerId=${order.customer.id}`}>
                  {order.customer.displayName}
                </Link>
              </dd>
            </div>
            {order.customer.phone || order.customer.whatsapp ? (
              <div>
                <dt>Teléfono</dt>
                <dd>
                  {/* tel: and wa.me so a click dials or opens the chat, rather than being text to
                    copy by hand. */}
                  {order.customer.phone ? (
                    <a href={`tel:${order.customer.phone.replace(/[^+d]/g, '')}`}>
                      {order.customer.phone}
                    </a>
                  ) : null}
                  {order.customer.whatsapp ? (
                    <>
                      {order.customer.phone ? ' · ' : ''}
                      <a
                        href={`https://wa.me/${order.customer.whatsapp.replace(/D/g, '')}`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        WhatsApp
                      </a>
                    </>
                  ) : null}
                </dd>
              </div>
            ) : null}
            {order.customer.email ? (
              <div>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${order.customer.email}`}>{order.customer.email}</a>
                </dd>
              </div>
            ) : null}
            <div className="order-facts-wide">
              <dt>Dirección de entrega</dt>
              <dd>
                {order.deliveryAddress}
                {order.deliveryLocationUrl ? (
                  <>
                    {' · '}
                    <a href={order.deliveryLocationUrl} rel="noreferrer" target="_blank">
                      Ver ubicación
                    </a>
                  </>
                ) : null}
              </dd>
            </div>
            {order.deliveryZone ? (
              <div>
                <dt>Zona</dt>
                <dd>{order.deliveryZone}</dd>
              </div>
            ) : null}
            <div>
              <dt>Entrega</dt>
              <dd>{formatDayLong(order.deliveryDate)}</dd>
            </div>
            {cycle ? (
              <div>
                <dt>Semana</dt>
                <dd>
                  {/* Enlazada a la lista filtrada por esa semana: desde un pedido, el resto de su
                      semana es la pregunta que sigue. */}
                  <Link className="underline" to={`/app/pedidos?cycleId=${cycle.id}`}>
                    {cycle.alias}
                  </Link>
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Pago esperado</dt>
              <dd>{order.paymentExpectation}</dd>
            </div>
            <div>
              <dt>Origen</dt>
              <dd>{sourceLabel(order.source)}</dd>
            </div>
            {order.dietaryInstructions.length > 0 ? (
              <div className="order-facts-wide">
                <dt>Indicaciones alimentarias</dt>
                <dd>{order.dietaryInstructions.join(' · ')}</dd>
              </div>
            ) : null}
            {order.notes ? (
              <div className="order-facts-wide">
                <dt>Notas</dt>
                <dd>{order.notes}</dd>
              </div>
            ) : null}
          </dl>

          <DeliveryMap
            address={order.deliveryAddress}
            latitude={order.deliveryLatitude}
            locationUrl={order.deliveryLocationUrl}
            longitude={order.deliveryLongitude}
          />
        </div>

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
              {/* Uno por línea: cinco platos separados por comas se leen como una frase larga, y lo
                  que hace falta es contarlos y ubicar uno. */}
              {item.dishSelections.length > 0 ? (
                <ul className="dish-selections mt-1">
                  {item.dishSelections.map((dish, index) => (
                    <li key={`${dish}-${String(index)}`}>{dish}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
          <p className="text-right font-semibold">
            {formatMoney(order.totalMinor, order.currency)}
          </p>
        </div>

        {cancelOpen && order ? (
          <CancelOrderDialog
            onCancel={() => setCancelOpen(false)}
            onConfirm={cancelOrder}
            orderNumber={order.publicNumber}
          />
        ) : null}

        <div className="mt-8 grid gap-2">
          <h2 className="text-sm font-bold text-forest">Historial de estado</h2>
          {history.map((entry) => (
            <p className="text-sm text-ink-muted" key={entry.id}>
              {formatMoment(entry.createdAt)} · {statusLabel(entry.fromStatus)} →{' '}
              {orderStatusLabel(entry.toStatus)}
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
                {formatMoment(revision.createdAt)} · revisión #{revision.revision} ·{' '}
                {revision.reason}
              </p>
            ))}
          </div>
        ) : null}
      </section>
    </DashboardShell>
  );
}
