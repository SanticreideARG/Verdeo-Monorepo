import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { DashboardShell, type DashboardProfile } from '../components/DashboardShell.js';
import { apiRequest } from '../lib/api.js';
import {
  errorMessage,
  formatMoney,
  type AIProviderConfig,
  type CustomerSummary,
  type KitchenSummary,
  type OrderSummary,
  type WeeklyMenu,
} from '../lib/operations.js';

interface OfferingDraft {
  composable: boolean;
  dishes: string;
  familyName: string;
  sizeName: string;
}

interface SizePriceDraft {
  sizeName: string;
  unitPrice: string;
}

const emptyOffering = (): OfferingDraft => ({
  composable: false,
  dishes: '',
  familyName: '',
  sizeName: '',
});

type DistributionMode = 'CREATE_MISSING' | 'UPDATE_UNCUSTOMIZED' | 'REPLACE';

// The price belongs to the size, so the week starts from its price list and the varieties hang off it.
const defaultSizePrices = (): SizePriceDraft[] => [
  { sizeName: '250', unitPrice: '' },
  { sizeName: '400', unitPrice: '' },
];

function localDate(daysFromToday = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

export function OperationsPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [menus, setMenus] = useState<WeeklyMenu[]>([]);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [kitchen, setKitchen] = useState<KitchenSummary | null>(null);
  const [aiProviders, setAIProviders] = useState<AIProviderConfig[]>([]);
  const [aiEncryptionConfigured, setAIEncryptionConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [offerings, setOfferings] = useState<OfferingDraft[]>([emptyOffering()]);
  const [sizePrices, setSizePrices] = useState<SizePriceDraft[]>(defaultSizePrices);
  const [sites, setSites] = useState<{ displayName: string; id: string }[]>([]);
  const [distributionSites, setDistributionSites] = useState<string[]>([]);
  const [distributionMode, setDistributionMode] = useState<DistributionMode>('CREATE_MISSING');
  const [selectedMenuId, setSelectedMenuId] = useState('');

  // Only the first load blanks the screen. A refresh after a mutation keeps the current content
  // and lets the progress bar carry the feedback.
  const loadedOnce = useRef(false);
  const loadData = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
    setMessage('');
    const profileResponse = await apiRequest('/api/v1/me');
    if (profileResponse.status === 401) {
      await navigate('/login', { replace: true });
      return;
    }
    if (!profileResponse.ok) throw new Error(await errorMessage(profileResponse));
    const loadedProfile = (await profileResponse.json()) as DashboardProfile;
    setProfile(loadedProfile);
    setPermissions(loadedProfile.permissions);

    const [customerResponse, menuResponse, orderResponse, aiResponse, siteResponse] =
      await Promise.all([
        loadedProfile.permissions.includes('customers.read')
          ? apiRequest('/api/v1/customers')
          : null,
        loadedProfile.permissions.some((permission) =>
          ['orders.read', 'production.read'].includes(permission),
        )
          ? apiRequest('/api/v1/menus')
          : null,
        loadedProfile.permissions.includes('orders.read') ? apiRequest('/api/v1/orders') : null,
        loadedProfile.permissions.includes('ai.providers.manage')
          ? apiRequest('/api/v1/ai/providers')
          : null,
        loadedProfile.permissions.includes('sites.read')
          ? apiRequest('/api/v1/operating-sites')
          : null,
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
      setOrders(((await orderResponse.json()) as { items: OrderSummary[] }).items);
    }
    if (aiResponse?.ok) {
      const result = (await aiResponse.json()) as {
        encryptionConfigured: boolean;
        items: AIProviderConfig[];
      };
      setAIEncryptionConfigured(result.encryptionConfigured);
      setAIProviders(result.items);
    }
    if (siteResponse?.ok) {
      const loadedSites = (
        (await siteResponse.json()) as {
          items: { active: boolean; displayName: string; id: string }[];
        }
      ).items;
      setSites(loadedSites.filter((site) => site.active));
    }
    loadedOnce.current = true;
    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    void loadData().catch((error: unknown) => {
      setLoading(false);
      setMessage(error instanceof Error ? error.message : 'No pudimos cargar la operación.');
    });
  }, [loadData]);

  const publishedMenus = menus.filter((menu) => menu.status === 'PUBLISHED');
  const selectedMenu = useMemo(
    () => menus.find((menu) => menu.id === selectedMenuId) ?? null,
    [menus, selectedMenuId],
  );

  async function mutate(path: string, payload?: unknown) {
    setMessage('');
    const response = await apiRequest(path, {
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      method: 'POST',
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    return response;
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await mutate('/api/v1/customers', {
        displayName: formText(form, 'displayName'),
        email: formText(form, 'email') || undefined,
        phone: formText(form, 'phone') || undefined,
      });
      event.currentTarget.reset();
      setMessage('Cliente registrado.');
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos crear el cliente.');
    }
  }

  async function distributeMenu(menuId: string) {
    // Replacing overwrites what an operator configured locally, so it is confirmed here as well as
    // gated by its own permission on the server.
    if (
      distributionMode === 'REPLACE' &&
      !window.confirm(
        'Reemplazar sobrescribe los precios y platos que cada ciudad haya personalizado. ¿Continuar?',
      )
    )
      return;

    try {
      const response = await mutate(`/api/v1/menus/${menuId}/distribute`, {
        confirmedReplace: distributionMode === 'REPLACE',
        mode: distributionMode,
        operatingSiteIds: distributionSites,
      });
      const results = (await response.json()) as { results: { outcome: string }[] };
      const created = results.results.filter((r) => r.outcome === 'CREATED').length;
      const skipped = results.results.filter((r) => r.outcome.startsWith('SKIPPED')).length;
      setMessage(
        `Distribución lista: ${created} creada(s), ${results.results.length - created - skipped} actualizada(s), ${skipped} omitida(s).`,
      );
      setDistributionSites([]);
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos distribuir el menú.');
    }
  }

  async function createMenu(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsedPrices = sizePrices
      .filter((price) => price.sizeName.trim() && price.unitPrice.trim())
      .map((price) => ({
        currency: 'ARS',
        mealsPerUnit: 5,
        sizeName: price.sizeName.trim(),
        unitPriceMinor: Math.round(Number(price.unitPrice) * 100),
      }));
    if (parsedPrices.length === 0) {
      setMessage('Definí al menos un tamaño con su precio.');
      return;
    }

    const parsedOfferings = offerings.map((offering) => ({
      composable: offering.composable,
      dishes: offering.dishes
        .split('\n')
        .map((dish) => dish.trim())
        .filter(Boolean),
      familyName: offering.familyName,
      sizeName: offering.sizeName.trim(),
    }));
    if (parsedOfferings.some((offering) => offering.dishes.length !== 5)) {
      setMessage('Cada opción del menú necesita exactamente cinco platos.');
      return;
    }
    const pricedSizes = new Set(parsedPrices.map((price) => price.sizeName));
    if (parsedOfferings.some((offering) => !pricedSizes.has(offering.sizeName))) {
      setMessage('Cada variedad debe usar un tamaño que tenga precio definido.');
      return;
    }

    try {
      await mutate('/api/v1/menus', {
        alias: formText(form, 'alias'),
        closeAt: new Date(formText(form, 'closeAt')).toISOString(),
        offerings: parsedOfferings,
        openAt: new Date(formText(form, 'openAt')).toISOString(),
        partialKitchenCutoffAt: new Date(formText(form, 'partialKitchenCutoffAt')).toISOString(),
        prices: parsedPrices,
      });
      setOfferings([emptyOffering()]);
      setSizePrices(defaultSizePrices());
      event.currentTarget.reset();
      setMessage('Menú guardado como borrador.');
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos crear el menú.');
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

  async function loadKitchen(menu: WeeklyMenu) {
    try {
      const response = await apiRequest(`/api/v1/production/${menu.cycle.id}`);
      if (!response.ok) throw new Error(await errorMessage(response));
      setKitchen((await response.json()) as KitchenSummary);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos generar el consolidado.');
    }
  }

  async function saveAIProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const response = await apiRequest('/api/v1/ai/providers', {
        body: JSON.stringify({
          adapterType: formText(form, 'adapterType'),
          apiKey: formText(form, 'apiKey') || undefined,
          baseUrl: formText(form, 'baseUrl'),
          defaultModel: formText(form, 'defaultModel'),
          displayName: formText(form, 'displayName'),
          enabled: form.get('enabled') === 'on',
          key: formText(form, 'key'),
        }),
        method: 'PUT',
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = (await response.json()) as {
        encryptionConfigured: boolean;
        items: AIProviderConfig[];
      };
      setAIEncryptionConfigured(result.encryptionConfigured);
      setAIProviders(result.items);
      event.currentTarget.reset();
      setMessage('Proveedor de IA guardado sin exponer la clave.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos guardar el proveedor.');
    }
  }

  async function logout() {
    await apiRequest('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    await navigate('/login', { replace: true });
  }

  if (loading)
    return (
      <main className="grid min-h-screen place-items-center bg-[#eef1e7] text-forest">
        Cargando operación…
      </main>
    );

  if (!profile) return null;

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <div className="operation-workspace">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Motor MVP</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-forest sm:text-5xl">
              Centro de pedidos
            </h1>
          </div>
          <button className="button button-secondary bg-white" onClick={() => void loadData()}>
            Actualizar datos
          </button>
        </div>
        {message ? (
          <p
            className="mt-6 rounded-2xl border border-forest/10 bg-white p-4 text-sm"
            role="status"
          >
            {message}
          </p>
        ) : null}

        <section className="operation-section" id="pedidos">
          <div>
            <p className="eyebrow">01 · Pedidos</p>
            <h2 className="operation-title">Tomar y confirmar pedidos</h2>
          </div>
          {permissions.includes('orders.create') ? (
            <form className="operation-card" onSubmit={(event) => void createOrder(event)}>
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
                    required
                    onChange={(event) => setSelectedMenuId(event.target.value)}
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
                  <input name="quantityUnits" type="number" min="1" defaultValue="1" required />
                </label>
                <label className="field">
                  Entrega
                  <input name="deliveryDate" type="date" defaultValue={localDate(1)} required />
                </label>
                <label className="field field-wide">
                  Dirección
                  <input name="deliveryAddress" required minLength={4} />
                </label>
                <label className="field">
                  Origen
                  <select name="source" defaultValue="manual">
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
                  <textarea name="dietaryInstructions" rows={2} placeholder="Una por línea" />
                </label>
                <label className="field field-wide">
                  Intuitivo: cinco platos, uno por línea
                  <textarea name="customDishes" rows={5} />
                </label>
              </div>
              <button className="button button-primary mt-5" type="submit">
                Registrar borrador
              </button>
            </form>
          ) : null}
          <div className="grid gap-3">
            {orders.map((order) => (
              <article
                className="operation-card flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
                key={order.id}
              >
                <div>
                  <div className="flex items-center gap-3">
                    <strong className="text-xl text-forest">{order.publicNumber}</strong>
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
            {orders.length === 0 ? <p className="empty-state">Todavía no hay pedidos.</p> : null}
          </div>
        </section>

        <section className="operation-section" id="menus">
          <div>
            <p className="eyebrow">02 · Menú semanal</p>
            <h2 className="operation-title">Configurar la semana</h2>
          </div>
          {permissions.includes('production.generate') ? (
            <form className="operation-card" onSubmit={(event) => void createMenu(event)}>
              <div className="form-grid">
                <label className="field field-wide">
                  Alias de la semana
                  <input name="alias" placeholder="Ej. Semana 34 · 24 al 28 de agosto" required />
                </label>
                <label className="field">
                  Apertura
                  <input name="openAt" type="datetime-local" required />
                </label>
                <label className="field">
                  Parcial de cocina
                  <input name="partialKitchenCutoffAt" type="datetime-local" required />
                </label>
                <label className="field">
                  Cierre
                  <input name="closeAt" type="datetime-local" required />
                </label>
              </div>
              <fieldset className="mt-6 rounded-2xl border border-forest/10 p-4">
                <legend className="px-2 text-sm font-bold text-forest">Precios por tamaño</legend>
                <p className="mb-3 text-sm text-ink-muted">
                  El precio depende del tamaño, no de la variedad: todas las variedades de un mismo
                  tamaño valen igual esta semana.
                </p>
                <div className="form-grid">
                  {sizePrices.map((price, index) => (
                    <label className="field" key={index}>
                      Precio de {price.sizeName || `tamaño ${index + 1}`} en ARS
                      <input
                        min="0"
                        onChange={(event) =>
                          setSizePrices((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, unitPrice: event.target.value }
                                : item,
                            ),
                          )
                        }
                        step="0.01"
                        type="number"
                        value={price.unitPrice}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="mt-6 grid gap-4">
                {offerings.map((offering, index) => (
                  <fieldset className="rounded-2xl border border-forest/10 p-4" key={index}>
                    <legend className="px-2 text-sm font-bold text-forest">
                      Opción {index + 1}
                    </legend>
                    <div className="form-grid">
                      <label className="field">
                        Variedad
                        <input
                          value={offering.familyName}
                          onChange={(event) =>
                            setOfferings((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, familyName: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          required
                        />
                      </label>
                      <label className="field">
                        Tamaño
                        <select
                          onChange={(event) =>
                            setOfferings((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, sizeName: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          required
                          value={offering.sizeName}
                        >
                          <option value="">Elegí un tamaño</option>
                          {sizePrices
                            .filter((price) => price.sizeName.trim())
                            .map((price) => (
                              <option key={price.sizeName} value={price.sizeName}>
                                {price.sizeName}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="field">
                        Composición
                        <select
                          onChange={(event) =>
                            setOfferings((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, composable: event.target.value === 'composable' }
                                  : item,
                              ),
                            )
                          }
                          value={offering.composable ? 'composable' : 'fixed'}
                        >
                          <option value="fixed">Fija (cinco platos definidos)</option>
                          <option value="composable">Elegida por el cliente</option>
                        </select>
                      </label>
                      <label className="field field-wide">
                        Cinco platos, uno por línea
                        <textarea
                          rows={5}
                          value={offering.dishes}
                          onChange={(event) =>
                            setOfferings((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, dishes: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          required
                        />
                      </label>
                    </div>
                  </fieldset>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setOfferings((current) => [...current, emptyOffering()])}
                >
                  Agregar opción
                </button>
                {offerings.length > 1 ? (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => setOfferings((current) => current.slice(0, -1))}
                  >
                    Quitar última
                  </button>
                ) : null}
                <button className="button button-primary" type="submit">
                  Guardar borrador
                </button>
              </div>
            </form>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {menus.map((menu) => (
              <article className="operation-card" key={menu.id}>
                <div className="flex justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-forest">{menu.cycle.alias}</h3>
                    <p className="mt-1 text-sm text-ink-muted">
                      {menu.operatingSiteName ?? 'Global'} · {menu.offerings.length} opciones ·
                      revisión {menu.revision}
                    </p>
                  </div>
                  <span className="status-chip">{menu.status}</span>
                </div>
                {menu.status === 'DRAFT' && permissions.includes('production.generate') ? (
                  <button
                    className="button button-primary mt-5"
                    onClick={() =>
                      void mutate(`/api/v1/menus/${menu.id}/publish`)
                        .then(loadData)
                        .catch((error: unknown) =>
                          setMessage(
                            error instanceof Error ? error.message : 'No pudimos publicar.',
                          ),
                        )
                    }
                  >
                    Publicar
                  </button>
                ) : null}
                {menu.operatingSiteId === null && permissions.includes('menus.distribute') ? (
                  <details className="mt-5">
                    <summary className="cursor-pointer text-sm font-semibold text-forest">
                      Distribuir por ciudad
                    </summary>
                    <p className="mt-2 text-sm text-ink-muted">
                      Crea una revisión propia en cada ciudad elegida. Lo que un operador ya
                      personalizó allá se conserva, salvo que reemplaces.
                    </p>
                    <div className="mt-3 grid gap-2">
                      {sites.map((site) => (
                        <label className="flex items-center gap-2 text-sm" key={site.id}>
                          <input
                            checked={distributionSites.includes(site.id)}
                            onChange={(event) =>
                              setDistributionSites((current) =>
                                event.target.checked
                                  ? [...current, site.id]
                                  : current.filter((id) => id !== site.id),
                              )
                            }
                            type="checkbox"
                          />
                          {site.displayName}
                        </label>
                      ))}
                      {sites.length === 0 ? (
                        <p className="text-sm text-ink-muted">
                          Todavía no hay ciudades configuradas.
                        </p>
                      ) : null}
                    </div>
                    <label className="field mt-3">
                      Modo
                      <select
                        onChange={(event) =>
                          setDistributionMode(event.target.value as DistributionMode)
                        }
                        value={distributionMode}
                      >
                        <option value="CREATE_MISSING">Sólo donde no exista</option>
                        <option value="UPDATE_UNCUSTOMIZED">Actualizar lo no personalizado</option>
                        {permissions.includes('menus.distribute_replace') ? (
                          <option value="REPLACE">Reemplazar personalizaciones</option>
                        ) : null}
                      </select>
                    </label>
                    <button
                      className="button button-secondary mt-3"
                      disabled={distributionSites.length === 0}
                      onClick={() => void distributeMenu(menu.id)}
                      type="button"
                    >
                      Distribuir
                    </button>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="operation-section" id="clientes">
          <div>
            <p className="eyebrow">03 · Clientes</p>
            <h2 className="operation-title">Registro operativo</h2>
          </div>
          {permissions.includes('customers.create') ? (
            <form className="operation-card" onSubmit={(event) => void createCustomer(event)}>
              <div className="form-grid">
                <label className="field field-wide">
                  Nombre visible
                  <input name="displayName" required />
                </label>
                <label className="field">
                  Email
                  <input name="email" type="email" />
                </label>
                <label className="field">
                  Teléfono
                  <input name="phone" />
                </label>
              </div>
              <button className="button button-primary mt-5" type="submit">
                Registrar cliente
              </button>
            </form>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {customers.map((customer) => (
              <article className="operation-card" key={customer.id}>
                <h3 className="font-semibold text-forest">{customer.displayName}</h3>
                <p className="mt-2 text-sm text-ink-muted">
                  {customer.email || customer.phone || 'Sin contacto visible'}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="operation-section" id="cocina">
          <div>
            <p className="eyebrow">04 · Cocina</p>
            <h2 className="operation-title">Consolidado determinista</h2>
          </div>
          <div className="operation-card flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="field grow">
              Ciclo
              <select
                value={selectedMenuId}
                onChange={(event) => setSelectedMenuId(event.target.value)}
              >
                <option value="">Seleccionar</option>
                {menus.map((menu) => (
                  <option key={menu.id} value={menu.id}>
                    {menu.cycle.alias}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button-primary"
              disabled={!selectedMenu}
              onClick={() => selectedMenu && void loadKitchen(selectedMenu)}
            >
              Generar salida
            </button>
          </div>
          {kitchen ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <article className="operation-card">
                <h3 className="text-xl font-semibold text-forest">Producción base</h3>
                <div className="mt-4 grid gap-3">
                  {kitchen.base.map((item) => (
                    <div
                      className="border-b border-forest/10 pb-3"
                      key={`${item.familyName}-${item.variantName}`}
                    >
                      <div className="flex justify-between">
                        <span>
                          {item.familyName} {item.variantName}
                        </span>
                        <strong>{item.quantityUnits}</strong>
                      </div>
                      {item.exceptions.map((exception) => (
                        <p
                          className="mt-2 text-sm font-semibold text-red-800"
                          key={`${exception.orderPublicNumber}-${exception.dietaryInstructions.join('-')}`}
                        >
                          {exception.quantityUnits} ({exception.customerDisplayName} ·{' '}
                          {exception.orderPublicNumber}):{' '}
                          {exception.dietaryInstructions.join(' · ')}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              </article>
              <article className="operation-card">
                <h3 className="text-xl font-semibold text-forest">Intuitivos</h3>
                <div className="mt-4 grid gap-4">
                  {kitchen.custom.map((item) => (
                    <div
                      className="border-b border-forest/10 pb-4"
                      key={`${item.orderPublicNumber}-${item.sequence}`}
                    >
                      <strong>
                        #{item.sequence} · {item.variantName} × {item.quantityUnits}
                      </strong>
                      <p className="mt-1 text-sm">
                        {item.customerDisplayName} ({item.orderPublicNumber})
                      </p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {item.dishSelections.join(' · ')}
                      </p>
                      {item.dietaryInstructions.length ? (
                        <p className="mt-2 text-sm font-semibold text-red-800">
                          {item.dietaryInstructions.join(' · ')}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </article>
              <p className="lg:col-span-2 text-right font-bold text-forest">
                Total: {kitchen.totalUnits} unidades
              </p>
            </div>
          ) : (
            <p className="empty-state">
              Elegí un ciclo para calcular la producción desde pedidos confirmados.
            </p>
          )}
        </section>

        {permissions.includes('ai.providers.manage') ? (
          <section className="operation-section" id="ia">
            <div>
              <p className="eyebrow">05 · IA y plantillas</p>
              <h2 className="operation-title">Configuración segura del motor</h2>
              <p className="mt-3 max-w-3xl leading-7 text-ink-muted">
                La clave se cifra en el servidor y nunca vuelve al navegador. Este corte prepara el
                registro de proveedores y modelos para el generador de plantillas; la generación
                queda desacoplada del motor determinista de pedidos.
              </p>
            </div>
            {!aiEncryptionConfigured ? (
              <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                Falta AI_CONFIG_ENCRYPTION_KEY en el servidor. Podés revisar proveedores, pero no
                guardar una API key hasta configurarla.
              </p>
            ) : null}
            <form className="operation-card" onSubmit={(event) => void saveAIProvider(event)}>
              <div className="form-grid">
                <label className="field">
                  Clave interna
                  <input
                    name="key"
                    placeholder="proveedor-principal"
                    pattern="[a-z0-9][a-z0-9_-]{1,79}"
                    required
                  />
                </label>
                <label className="field">
                  Nombre visible
                  <input name="displayName" required />
                </label>
                <label className="field">
                  Tipo de adaptador
                  <input name="adapterType" placeholder="openai-compatible" required />
                </label>
                <label className="field">
                  Modelo por defecto
                  <input name="defaultModel" required />
                </label>
                <label className="field field-wide">
                  URL base de API
                  <input
                    name="baseUrl"
                    type="url"
                    placeholder="https://api.example.com/v1"
                    required
                  />
                </label>
                <label className="field field-wide">
                  API key
                  <input
                    name="apiKey"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    disabled={!aiEncryptionConfigured}
                  />
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-forest">
                  <input name="enabled" type="checkbox" disabled={!aiEncryptionConfigured} />
                  Habilitar proveedor
                </label>
              </div>
              <button className="button button-primary mt-5" type="submit">
                Guardar configuración
              </button>
            </form>
            <div className="grid gap-3 sm:grid-cols-2">
              {aiProviders.map((provider) => (
                <article className="operation-card" key={provider.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-forest">{provider.displayName}</h3>
                      <p className="mt-1 text-sm text-ink-muted">
                        {provider.defaultModel} · {provider.adapterType}
                      </p>
                    </div>
                    <span className="status-chip">{provider.enabled ? 'ACTIVO' : 'INACTIVO'}</span>
                  </div>
                  <p className="mt-4 font-mono text-sm">
                    {provider.apiKeyMask ?? 'Sin clave configurada'}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </DashboardShell>
  );
}
