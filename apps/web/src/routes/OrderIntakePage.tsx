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
  const [menus, setMenus] = useState<WeeklyMenu[]>([]);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedMenuId, setSelectedMenuId] = useState('');

  // "Nuevo cliente" (quick alta) vs "Buscar cliente" (by name/number) — a client is picked before
  // the rest of the order form matters, so this drives what `customerId` ends up as on submit.
  const [customerMode, setCustomerMode] = useState<'new' | 'search'>('search');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerSummary[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);

  const loadedOnce = useRef(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!profile) return;
    if (!loadedOnce.current) setLoading(true);
    setPermissions(profile.permissions);

    const [menuResponse, orderResponse] = await Promise.all([
      profile.permissions.some((permission) =>
        ['orders.read', 'production.read'].includes(permission),
      )
        ? apiRequest('/api/v1/menus')
        : null,
      profile.permissions.includes('orders.read') ? apiRequest('/api/v1/orders') : null,
    ]);
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

  async function searchCustomers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customerQuery.trim()) {
      setCustomerResults([]);
      return;
    }
    setCustomerSearching(true);
    try {
      const response = await apiRequest(
        `/api/v1/customers?search=${encodeURIComponent(customerQuery.trim())}&limit=10`,
      );
      if (response.ok) {
        setCustomerResults(((await response.json()) as { items: CustomerSummary[] }).items);
      }
    } finally {
      setCustomerSearching(false);
    }
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

    let customerId = selectedCustomer?.id ?? '';
    try {
      if (customerMode === 'new') {
        const newDisplayName = formText(form, 'newCustomerDisplayName').trim();
        if (!newDisplayName) {
          setMessage('Ingresá el nombre del cliente nuevo.');
          return;
        }
        const createdCustomer = await mutate('/api/v1/customers', {
          displayName: newDisplayName,
          phone: formText(form, 'newCustomerPhone').trim() || undefined,
        });
        customerId = ((await createdCustomer.json()) as CustomerSummary).id;
      } else if (!customerId) {
        setMessage('Buscá y elegí un cliente antes de continuar.');
        return;
      }

      await mutate('/api/v1/orders', {
        customerId,
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
      setSelectedCustomer(null);
      setCustomerResults([]);
      setCustomerQuery('');
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
            <fieldset className="mb-5 rounded-2xl border border-forest/10 p-4">
              <legend className="px-2 text-sm font-bold text-forest">Cliente</legend>
              <div className="flex gap-2">
                <button
                  className={`button ${customerMode === 'search' ? 'button-primary' : 'button-secondary'}`}
                  onClick={() => setCustomerMode('search')}
                  type="button"
                >
                  Buscar cliente
                </button>
                <button
                  className={`button ${customerMode === 'new' ? 'button-primary' : 'button-secondary'}`}
                  onClick={() => {
                    setCustomerMode('new');
                    setSelectedCustomer(null);
                  }}
                  type="button"
                >
                  Nuevo cliente
                </button>
              </div>

              {customerMode === 'search' ? (
                <div className="mt-3">
                  {selectedCustomer ? (
                    <p className="flex items-center gap-2 text-sm">
                      <span className="status-chip">{selectedCustomer.displayName}</span>
                      <button
                        className="button button-secondary"
                        onClick={() => setSelectedCustomer(null)}
                        type="button"
                      >
                        Cambiar
                      </button>
                    </p>
                  ) : (
                    <>
                      <form
                        className="flex gap-2"
                        onSubmit={(event) => void searchCustomers(event)}
                      >
                        <input
                          onChange={(event) => setCustomerQuery(event.target.value)}
                          placeholder="Nombre o número de teléfono"
                          value={customerQuery}
                        />
                        <button className="button button-secondary" type="submit">
                          {customerSearching ? 'Buscando…' : 'Buscar'}
                        </button>
                      </form>
                      {customerResults.length > 0 ? (
                        <ul className="mt-2 grid gap-1">
                          {customerResults.map((customer) => (
                            <li key={customer.id}>
                              <button
                                className="w-full rounded-lg border border-forest/10 px-3 py-2 text-left text-sm hover:bg-forest/5"
                                onClick={() => {
                                  setSelectedCustomer(customer);
                                  setCustomerResults([]);
                                }}
                                type="button"
                              >
                                {customer.displayName}
                                {customer.phone ? ` · ${customer.phone}` : ''}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <div className="form-grid mt-3">
                  <label className="field">
                    Nombre
                    <input name="newCustomerDisplayName" required />
                  </label>
                  <label className="field">
                    Teléfono
                    <input name="newCustomerPhone" />
                  </label>
                </div>
              )}
            </fieldset>

            <div className="form-grid">
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
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="email">Email</option>
                  <option value="referral">Recomendación</option>
                  <option value="opportunity_sale">Venta de oportunidad (excedente)</option>
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
