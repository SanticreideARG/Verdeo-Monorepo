import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { DraftNotice } from '../components/DraftNotice.js';
import { IntuitivoDishPicker } from '../components/IntuitivoDishPicker.js';
import { apiRequest, storedOperatingSiteId } from '../lib/api.js';
import { showToast } from '../lib/toast.js';
import {
  errorMessage,
  formatMoney,
  menusForAmbientScope,
  orderStatusLabel,
  type CustomerSummary,
  type OrderSummary,
  type PaymentMethod,
  type WeeklyMenu,
} from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';
import { useFormDraft } from '../lib/useFormDraft.js';

// The delivery date is fixed to the período's own close date — not a free pick — so it lives here,
// not as an editable form field.
function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date(dateOnly(iso)));
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
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const draft = useFormDraft(formRef, 'order-intake', formOpen);
  const [selectedMenuId, setSelectedMenuId] = useState('');
  const [selectedOfferingId, setSelectedOfferingId] = useState('');
  const [selectedDishes, setSelectedDishes] = useState<string[]>([]);

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

    const [menuResponse, orderResponse, methodsResponse] = await Promise.all([
      profile.permissions.some((permission) =>
        ['orders.read', 'production.read'].includes(permission),
      )
        ? apiRequest('/api/v1/menus')
        : null,
      profile.permissions.includes('orders.read') ? apiRequest('/api/v1/orders') : null,
      // Optional: staff without payments.read (e.g. cocina) still create orders fine — "Pago
      // esperado" just falls back to free text for them instead of the method picker.
      profile.permissions.includes('payments.read') ? apiRequest('/api/v1/payments/methods') : null,
    ]);
    if (menuResponse?.ok) {
      const loadedMenus = menusForAmbientScope(
        ((await menuResponse.json()) as { items: WeeklyMenu[] }).items,
        storedOperatingSiteId(),
      );
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
    if (methodsResponse?.ok) {
      const active = ((await methodsResponse.json()) as { items: PaymentMethod[] }).items.filter(
        (method) => method.active,
      );
      setPaymentMethods(active);
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
  const selectedOffering =
    selectedMenu?.offerings.find((offering) => offering.id === selectedOfferingId) ?? null;

  async function mutate(path: string, payload?: unknown) {
    setMessage('');
    const response = await apiRequest(path, {
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      method: 'POST',
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    return response;
  }

  // Live search: fires ~300ms after typing stops, no "Buscar" click needed. Two characters is
  // the floor — searching on one letter would hammer the endpoint for a result set too broad to
  // be useful anyway.
  useEffect(() => {
    if (customerMode !== 'search' || selectedCustomer) return;
    const trimmed = customerQuery.trim();
    if (trimmed.length < 2) {
      setCustomerResults([]);
      setCustomerSearching(false);
      return;
    }
    let active = true;
    setCustomerSearching(true);
    const timer = window.setTimeout(() => {
      void apiRequest(`/api/v1/customers?search=${encodeURIComponent(trimmed)}&limit=10`)
        .then(async (response) => {
          if (!active || !response.ok) return;
          setCustomerResults(((await response.json()) as { items: CustomerSummary[] }).items);
        })
        .finally(() => {
          if (active) setCustomerSearching(false);
        });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [customerQuery, customerMode, selectedCustomer]);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (selectedOffering?.composable && selectedDishes.length !== 5) {
      setMessage('Elegí exactamente cinco platos para el Intuitivo.');
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
        deliveryDate: selectedMenu ? dateOnly(selectedMenu.cycle.closeAt) : '',
        dietaryInstructions: formText(form, 'dietaryInstructions')
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean),
        items: [
          {
            offeringId: formText(form, 'offeringId'),
            quantityUnits: Number(form.get('quantityUnits')),
            ...(selectedDishes.length === 5 ? { selectedDishNames: selectedDishes } : {}),
          },
        ],
        menuId: formText(form, 'menuId'),
        paymentExpectation: formText(form, 'paymentExpectation'),
        source: formText(form, 'source'),
      });
      event.currentTarget.reset();
      // The draft is dropped on a successful save, not on unmount: that is what makes "I switched
      // screens and came back" restore, while "I already saved this" does not come back as a ghost.
      draft.discard();
      setSelectedCustomer(null);
      setCustomerResults([]);
      setCustomerQuery('');
      setSelectedOfferingId('');
      setSelectedDishes([]);
      setMessage('');
      setFormOpen(false);
      showToast('Pedido registrado como borrador.');
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
      showToast(`${order.publicNumber} actualizado a ${status}.`);
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
            className="operation-card mt-6 max-w-3xl"
            onSubmit={(event) => void createOrder(event)}
            ref={formRef}
          >
            {draft.restored ? <DraftNotice onDiscard={draft.dismissNotice} /> : null}
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
                      <div className="relative">
                        <input
                          autoComplete="off"
                          onChange={(event) => setCustomerQuery(event.target.value)}
                          placeholder="Empezá a escribir un nombre o teléfono…"
                          value={customerQuery}
                        />
                        {customerSearching ? (
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted">
                            Buscando…
                          </span>
                        ) : null}
                      </div>
                      {customerQuery.trim().length >= 2 &&
                      !customerSearching &&
                      customerResults.length === 0 ? (
                        <p className="mt-2 text-sm text-ink-muted">
                          Sin resultados para “{customerQuery.trim()}”.
                        </p>
                      ) : null}
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

            <div className="form-grid form-grid-wide">
              <label className="field">
                Período
                <select
                  name="menuId"
                  onChange={(event) => {
                    setSelectedMenuId(event.target.value);
                    setSelectedOfferingId('');
                  }}
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
                <select
                  name="offeringId"
                  onChange={(event) => {
                    setSelectedOfferingId(event.target.value);
                    setSelectedDishes([]);
                  }}
                  required
                  value={selectedOfferingId}
                >
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
              <div className="field">
                Entrega
                <p className="field-static">
                  {selectedMenu ? dateLabel(selectedMenu.cycle.closeAt) : '—'}
                </p>
              </div>
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
                {paymentMethods.length > 0 ? (
                  <select defaultValue="" name="paymentExpectation" required>
                    <option disabled value="">
                      Seleccionar
                    </option>
                    {paymentMethods.map((method) => (
                      <option key={method.code} value={method.code}>
                        {method.displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input name="paymentExpectation" placeholder="Transferencia" required />
                )}
              </label>
              <label className="field field-wide">
                Indicaciones para cocina
                <textarea name="dietaryInstructions" placeholder="Una por línea" rows={2} />
              </label>
            </div>
            {selectedOffering?.composable ? (
              <div className="field field-wide mt-4">
                Platos de Intuitivo
                <IntuitivoDishPicker
                  offerings={selectedMenu?.offerings ?? []}
                  onChange={setSelectedDishes}
                  selected={selectedDishes}
                />
              </div>
            ) : null}
            <div className="form-actions mt-4">
              <button className="button button-primary" type="submit">
                Registrar borrador
              </button>
              <button
                className="button button-secondary"
                onClick={() => {
                  draft.clear();
                  setSelectedCustomer(null);
                  setCustomerQuery('');
                  setCustomerResults([]);
                  setSelectedOfferingId('');
                  setSelectedDishes([]);
                }}
                type="button"
              >
                Limpiar
              </button>
            </div>
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
                  <span className="status-chip">{orderStatusLabel(order.status)}</span>
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
