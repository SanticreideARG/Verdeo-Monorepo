import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import {
  errorMessage,
  formatMoney,
  type CustomerSummary,
  type OrderSummary,
  type WeeklyMenu,
} from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

function localDate(daysFromToday = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

/** "Tomar y confirmar pedidos": the operational screen — a compact intake form plus every order
 * still in motion (draft through ready) with its next action. Browsing the full history lives in
 * "Ver pedidos" instead, so this screen stays short. */
export function OrderIntakePage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [menus, setMenus] = useState<WeeklyMenu[]>([]);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedMenuId, setSelectedMenuId] = useState('');

  const loadedOnce = useRef(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!profile) return;
    if (!loadedOnce.current) setLoading(true);
    setPermissions(profile.permissions);

    const [customerResponse, menuResponse, orderResponse] = await Promise.all([
      profile.permissions.includes('customers.read') ? apiRequest('/api/v1/customers') : null,
      profile.permissions.some((permission) =>
        ['orders.read', 'production.read'].includes(permission),
      )
        ? apiRequest('/api/v1/menus')
        : null,
      profile.permissions.includes('orders.read') ? apiRequest('/api/v1/orders') : null,
    ]);
    if (customerResponse?.ok) {
      setCustomers(((await customerResponse.json()) as { items: CustomerSummary[] }).items);
    }
    if (menuResponse?.ok) {
      const loadedMenus = ((await menuResponse.json()) as { items: WeeklyMenu[] }).items;
      setMenus(loadedMenus);
      setSelectedMenuId(
        (current) =>
          current ||
          loadedMenus.find((menu) => menu.status === 'PUBLISHED')?.id ||
          loadedMenus[0]?.id ||
          '',
      );
    }
    if (orderResponse?.ok) {
      const items = ((await orderResponse.json()) as { items: OrderSummary[] }).items;
      // Only what still needs someone's attention; delivered and cancelled belong to "Ver pedidos".
      setOrders(
        items.filter((order) => order.status !== 'DELIVERED' && order.status !== 'CANCELLED'),
      );
    }
    loadedOnce.current = true;
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void loadData().catch((error: unknown) => {
      setLoading(false);
      setMessage(error instanceof Error ? error.message : 'No pudimos cargar los pedidos.');
    });
  }, [loadData]);

  const publishedMenus = menus.filter((menu) => menu.status === 'PUBLISHED');
  const selectedMenu = menus.find((menu) => menu.id === selectedMenuId) ?? null;

  async function mutate(path: string, payload?: unknown) {
    setMessage('');
    const response = await apiRequest(path, {
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      method: 'POST',
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    return response;
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedDishNames = formText(form, 'customDishes')
      .split('\n')
      .map((dish) => dish.trim())
      .filter(Boolean);
    if (selectedDishNames.length > 0 && selectedDishNames.length !== 5) {
      setMessage('Para un Intuitivo cargá exactamente cinco platos, uno por línea.');
      return;
    }
    try {
      await mutate('/api/v1/orders', {
        customerId: formText(form, 'customerId'),
        deliveryAddress: formText(form, 'deliveryAddress'),
        deliveryDate: formText(form, 'deliveryDate'),
        dietaryInstructions: formText(form, 'dietaryInstructions')
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean),
        items: [
          {
            offeringId: formText(form, 'offeringId'),
            quantityUnits: Number(form.get('quantityUnits')),
            ...(selectedDishNames.length === 5 ? { selectedDishNames } : {}),
          },
        ],
        menuId: formText(form, 'menuId'),
        paymentExpectation: formText(form, 'paymentExpectation'),
        source: formText(form, 'source'),
      });
      event.currentTarget.reset();
      setMessage('Pedido registrado como borrador.');
      setFormOpen(false);
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos crear el pedido.');
    }
  }

  async function transition(order: OrderSummary, status: OrderSummary['status']) {
    try {
      const reason =
        status === 'CANCELLED' ? window.prompt('Motivo de cancelación')?.trim() : undefined;
      if (status === 'CANCELLED' && !reason) return;
      await mutate(`/api/v1/orders/${order.id}/status`, {
        confirmedReversal: false,
        reason,
        status,
      });
      setMessage(`${order.publicNumber} actualizado a ${status}.`);
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos actualizar el pedido.');
    }
  }

  if (failed) return <DashboardFailed label="los pedidos" />;
  if (!profile) return <DashboardLoading />;
  if (loading) return <DashboardLoading />;

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="dashboard-kicker">Pedidos</p>
            <h1 className="text-2xl font-semibold text-forest">Tomar y confirmar pedidos</h1>
          </div>
          {permissions.includes('orders.create') ? (
            <button
              className="button button-primary"
              onClick={() => setFormOpen((current) => !current)}
              type="button"
            >
              {formOpen ? 'Cerrar formulario' : '+ Nuevo pedido'}
            </button>
          ) : null}
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {formOpen && permissions.includes('orders.create') ? (
          <form
            className="operation-card mt-6 max-w-xl"
            onSubmit={(event) => void createOrder(event)}
          >
            <div className="form-grid">
              <label className="field">
                Cliente
                <select name="customerId" required>
                  <option value="">Seleccionar</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Menú
                <select
                  name="menuId"
                  onChange={(event) => setSelectedMenuId(event.target.value)}
                  required
                  value={selectedMenuId}
                >
                  <option value="">Seleccionar</option>
                  {publishedMenus.map((menu) => (
                    <option key={menu.id} value={menu.id}>
                      {menu.cycle.alias}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field field-wide">
                Variedad
                <select name="offeringId" required>
                  <option value="">Seleccionar</option>
                  {selectedMenu?.offerings.map((offering) => (
                    <option key={offering.id} value={offering.id}>
                      {offering.familyName} {offering.variantName} ·{' '}
                      {formatMoney(offering.unitPriceMinor, offering.currency)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Unidades
                <input defaultValue="1" min="1" name="quantityUnits" required type="number" />
              </label>
              <label className="field">
                Entrega
                <input defaultValue={localDate(1)} name="deliveryDate" required type="date" />
              </label>
              <label className="field field-wide">
                Dirección
                <input minLength={4} name="deliveryAddress" required />
              </label>
              <label className="field">
                Origen
                <select defaultValue="manual" name="source">
                  <option value="manual">Manual</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="phone">Teléfono</option>
                  <option value="instagram">Instagram</option>
                  <option value="email">Email</option>
                </select>
              </label>
              <label className="field">
                Pago esperado
                <input name="paymentExpectation" placeholder="Transferencia" required />
              </label>
              <label className="field field-wide">
                Indicaciones para cocina
                <textarea name="dietaryInstructions" placeholder="Una por línea" rows={2} />
              </label>
              <label className="field field-wide">
                Intuitivo: cinco platos, uno por línea
                <textarea name="customDishes" rows={3} />
              </label>
            </div>
            <button className="button button-primary mt-4" type="submit">
              Registrar borrador
            </button>
          </form>
        ) : null}

        <div className="mt-6 grid gap-3">
          {orders.map((order) => (
            <article
              className="operation-card flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
              key={order.id}
            >
              <div>
                <div className="flex items-center gap-3">
                  <Link
                    className="text-xl font-semibold text-forest"
                    to={`/app/pedidos/${order.id}`}
                  >
                    {order.publicNumber}
                  </Link>
                  <span className="status-chip">{order.status}</span>
                </div>
                <p className="mt-2 text-sm text-ink-muted">
                  {order.customer.displayName} ·{' '}
                  {order.items
                    .map(
                      (item) => `${item.productName} ${item.variantName} × ${item.quantityUnits}`,
                    )
                    .join(', ')}
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {formatMoney(order.totalMinor, order.currency)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {order.status === 'DRAFT' && permissions.includes('orders.confirm') ? (
                  <button
                    className="button button-primary"
                    onClick={() => void transition(order, 'CONFIRMED')}
                  >
                    Confirmar
                  </button>
                ) : null}
                {order.status === 'CONFIRMED' && permissions.includes('orders.edit') ? (
                  <button
                    className="button button-secondary"
                    onClick={() => void transition(order, 'READY')}
                  >
                    Marcar listo
                  </button>
                ) : null}
                {['DRAFT', 'CONFIRMED'].includes(order.status) &&
                permissions.includes('orders.cancel') ? (
                  <button
                    className="button button-secondary"
                    onClick={() => void transition(order, 'CANCELLED')}
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
            </article>
          ))}
          {orders.length === 0 ? (
            <p className="empty-state">Ningún pedido pendiente de acción.</p>
          ) : null}
        </div>
      </section>
    </DashboardShell>
  );
}
