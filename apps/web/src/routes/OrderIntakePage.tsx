import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { AfterSaveDialog } from '../components/AfterSaveDialog.js';
import { CancelOrderDialog } from '../components/CancelOrderDialog.js';
import { ColumnPicker } from '../components/ColumnPicker.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { DataTable } from '../components/DataTable.js';
import { DraftNotice } from '../components/DraftNotice.js';
import { IntuitivoDishPicker } from '../components/IntuitivoDishPicker.js';
import { apiRequest, storedOperatingSiteId } from '../lib/api.js';
import { maskSurname, readMaskSurnames, writeMaskSurnames } from '../lib/maskName.js';
import {
  buildOrderColumns,
  ORDER_COLUMNS,
  readStoredColumns,
  writeStoredColumns,
  type OrderColumn,
} from '../lib/orderColumns.js';
import { PeriodPicker } from '../components/PeriodPicker.js';
import { currentPeriod, periodsFromMenus, type Period } from '../lib/periods.js';
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

/**
 * Qué se ve de cada pedido en la cola de trabajo.
 *
 * Menos que en "Ver pedidos" a propósito: acá no se consulta, se decide si confirmar o cancelar. El
 * número de pedido queda disponible pero apagado —sirve para citarlo, no para reconocerlo—; lo que
 * identifica la fila es el nombre, y lo que se necesita a mano para terminar de acordarlo es el
 * WhatsApp.
 */
const DEFAULT_COLUMNS = ['cliente', 'whatsapp', 'pedido', 'estado', 'total', 'acciones'];

const COLUMNS_KEY = 'verdeo-intake-columns';

/** Sólo claves y candados: los botones se arman en el render, donde están los permisos. */
const INTAKE_CATALOGUE: readonly { key: string; locked?: boolean }[] = [
  ...ORDER_COLUMNS,
  { key: 'acciones', locked: true },
];

/**
 * Cómo se llama cada campo para una persona.
 *
 * Un aviso que dice "deliveryAddress" no ayuda a nadie. Se declara acá y no se lee del DOM porque
 * la etiqueta de un `select` incluye su valor y saldría "Pago esperado Transferencia".
 */
const FIELD_LABELS: Record<string, string> = {
  deliveryAddress: 'la dirección de entrega',
  menuId: 'el período',
  newCustomerDisplayName: 'el nombre del cliente nuevo',
  offeringId: 'la variedad',
  paymentExpectation: 'el pago esperado',
  quantityUnits: 'las unidades',
  source: 'el origen del pedido',
};

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
  // Número del pedido recién guardado: mientras haya uno, el diálogo pregunta qué sigue.
  const [savedNumber, setSavedNumber] = useState<string | null>(null);

  // "Nuevo cliente" (quick alta) vs "Buscar cliente" (by name/number) — a client is picked before
  // the rest of the order form matters, so this drives what `customerId` ends up as on submit.
  const [customerMode, setCustomerMode] = useState<'new' | 'search'>('search');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerSummary[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);

  const loadedOnce = useRef(false);
  const [loading, setLoading] = useState(true);
  // El pedido que se está por cancelar: mientras haya uno, el diálogo pide el motivo.
  const [cancelling, setCancelling] = useState<OrderSummary | null>(null);
  // La zona cuyo lote se está marcando: deshabilita todos los botones mientras corre, para que dos
  // clics seguidos no manden la misma tanda dos veces.
  const [markingZone, setMarkingZone] = useState<string | null>(null);
  /*
   * Sobre qué semana trabaja la cola.
   *
   * `null` es "todavía no se resolvió"; la primera carga lo fija en el período actual. Es una cola
   * de trabajo: sin esto, un borrador que alguien dejó a medias hace tres semanas se queda acá para
   * siempre.
   */
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
    readStoredColumns(COLUMNS_KEY, DEFAULT_COLUMNS, INTAKE_CATALOGUE),
  );
  /*
   * Tapar apellidos.
   *
   * Esta es la pantalla que se proyecta cuando se arma la semana, y la planilla que sale de acá va
   * a cocina y al repartidor. El nombre de pila alcanza para saber de quién es cada vianda.
   */
  const [maskSurnames, setMaskSurnames] = useState(readMaskSurnames);

  const loadData = useCallback(async () => {
    if (!profile) return;
    if (!loadedOnce.current) setLoading(true);
    setPermissions(profile.permissions);

    /*
     * Los menús se piden primero y no en paralelo con los pedidos, a propósito.
     *
     * La cola tiene que salir filtrada por período, y para eso hay que saber cuál es antes de
     * pedirla. Filtrar del lado del cliente no alcanzaría: la lista viene paginada de a treinta, y
     * con doscientos treinta pedidos históricos la primera página podría no traer ni uno de la
     * semana actual — la cola se vería vacía teniendo trabajo pendiente.
     */
    const menuResponse = profile.permissions.some((permission) =>
      ['orders.read', 'production.read'].includes(permission),
    )
      ? await apiRequest('/api/v1/menus')
      : null;

    let queueCycleId = periodId;
    if (menuResponse?.ok) {
      const allMenus = ((await menuResponse.json()) as { items: WeeklyMenu[] }).items;
      const loadedMenus = menusForAmbientScope(allMenus, storedOperatingSiteId());
      setMenus(loadedMenus);
      setSelectedMenuId(
        (current) =>
          current ||
          loadedMenus.find((menu) => menu.status === 'PUBLISHED')?.id ||
          loadedMenus[0]?.id ||
          '',
      );
      const list = periodsFromMenus(allMenus);
      setPeriods(list);
      // La primera carga elige el período actual; después manda lo que el operador haya elegido.
      queueCycleId ??= currentPeriod(list)?.id ?? '';
      setPeriodId(queueCycleId);
    }

    const [orderResponse, methodsResponse] = await Promise.all([
      profile.permissions.includes('orders.read')
        ? apiRequest(`/api/v1/orders${queueCycleId ? `?cycleId=${queueCycleId}` : ''}`)
        : null,
      // Optional: staff without payments.read (e.g. cocina) still create orders fine — "Pago
      // esperado" just falls back to free text for them instead of the method picker.
      profile.permissions.includes('payments.read') ? apiRequest('/api/v1/payments/methods') : null,
    ]);
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
  }, [periodId, profile]);

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
    const formEl = event.currentTarget;
    const form = new FormData(formEl);

    /*
     * La validación la reporta la pantalla, no el navegador.
     *
     * El formulario lleva `noValidate` justamente para llegar hasta acá: con la validación nativa,
     * el navegador cortaba el envío antes de ejecutar nada y mostraba su globo sobre el primer
     * campo vacío. En un formulario de esta altura ese campo suele estar fuera de la pantalla —y en
     * un teléfono, encima, el globo se va solo—, así que apretar "Registrar borrador" no parecía
     * hacer nada. Los `required` se conservan porque siguen sirviendo para los lectores de
     * pantalla; lo que cambia es quién avisa.
     */
    const missing = [...formEl.elements].filter(
      (element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
        (element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement) &&
        element.willValidate &&
        !element.checkValidity(),
    );
    if (missing.length > 0) {
      const names = missing.map((element) => FIELD_LABELS[element.name] ?? 'un dato');
      setMessage(
        names.length === 1
          ? `Falta completar: ${names[0]}.`
          : `Faltan completar: ${[...new Set(names)].join(', ')}.`,
      );
      // Llevar la vista al primero: el mensaje dice qué falta, esto dice dónde.
      missing[0]?.scrollIntoView({ block: 'center' });
      missing[0]?.focus({ preventScroll: true });
      return;
    }

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

      const createdOrder = await mutate('/api/v1/orders', {
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
      // The draft is dropped on a successful save, not on unmount: that is what makes "I switched
      // screens and came back" restore, while "I already saved this" does not come back as a ghost.
      draft.discard();
      setMessage('');
      showToast('Pedido registrado como borrador.');
      /*
       * El formulario NO se limpia ni se cierra acá: eso lo decide el diálogo.
       *
       * Antes se reseteaba y se cerraba solo, y con la pantalla scrolleada abajo ese cambio pasaba
       * desapercibido: alguien tocó el botón treinta y seis veces en ochenta segundos creyendo que
       * no pasaba nada, y creó treinta y seis pedidos. Un paso que corta y obliga a elegir hace
       * imposible esa confusión.
       */
      setSavedNumber(((await createdOrder.json()) as OrderSummary).publicNumber);
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos crear el pedido.');
    }
  }

  async function transition(order: OrderSummary, status: OrderSummary['status']) {
    /*
     * Cancelar abre el mismo diálogo que la ficha del pedido, con los motivos ya cargados.
     *
     * Antes era un `window.prompt`: la ventanita gris del navegador, con el dominio arriba, pidiendo
     * texto libre. Además de no parecerse en nada al resto, cada quien escribía el motivo como se le
     * ocurría, así que "cliente ausente" y "no estaba" quedaban como dos motivos distintos y las
     * estadísticas de entregas fallidas no significaban nada.
     */
    if (status === 'CANCELLED') {
      setCancelling(order);
      return;
    }
    try {
      await mutate(`/api/v1/orders/${order.id}/status`, {
        confirmedReversal: false,
        status,
      });
      showToast(
        `Pedido de ${order.customer.displayName} (${order.publicNumber}) ${orderStatusLabel(status).toLowerCase()}.`,
      );
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos actualizar el pedido.');
    }
  }

  /**
   * Pasa a "listo" todos los confirmados de una zona.
   *
   * Manda los ids que están a la vista y no un filtro: el servidor transiciona exactamente lo que
   * se vio, en vez de volver a resolver una condición que entre medio pudo cambiar.
   */
  async function markZoneReady(zone: string, batch: readonly OrderSummary[]) {
    setMarkingZone(zone);
    try {
      const response = await apiRequest('/api/v1/orders/ready-batch', {
        body: JSON.stringify({ orderIds: batch.map((order) => order.id) }),
        method: 'POST',
      });
      if (!response.ok) {
        setMessage(await errorMessage(response));
        return;
      }
      const body = (await response.json()) as {
        results: { error?: string; orderId: string; ready: boolean }[];
      };
      const failed = body.results.filter((result) => !result.ready);
      // Los que fallaron se nombran: "18 de 20" sin decir cuáles dos deja buscándolos a mano.
      if (failed.length === 0) {
        showToast(`${String(body.results.length)} pedidos de ${zone} marcados listos.`);
      } else {
        const names = failed
          .map(
            (result) =>
              batch.find((order) => order.id === result.orderId)?.customer.displayName ??
              result.orderId,
          )
          .join(', ');
        setMessage(
          `${String(body.results.length - failed.length)} de ${String(body.results.length)} marcados listos. Quedaron sin marcar: ${names}.`,
        );
      }
      await loadData();
    } finally {
      setMarkingZone(null);
    }
  }

  /** Confirma la cancelación con el motivo elegido en el diálogo. */
  async function cancelOrder(
    order: OrderSummary,
    { notes, reasonId }: { notes: string; reasonId: string },
  ) {
    await mutate(`/api/v1/orders/${order.id}/status`, {
      cancellationNotes: notes || undefined,
      cancellationReasonId: reasonId,
      confirmedReversal: false,
      status: 'CANCELLED',
    });
    setCancelling(null);
    showToast(`Pedido de ${order.customer.displayName} cancelado.`);
    await loadData();
  }

  /**
   * La planilla del período que se está mirando.
   *
   * No es el CSV de "Ver pedidos": ahí se baja para meter los pedidos en otra herramienta, acá se
   * baja para mirar y reenviar. Trae la lista tal como se ve más las dos consolidaciones que si no
   * hay que hacer a mano —cuántas viandas de cada tipo y cómo se reparten por zona—, y respeta el
   * tilde de tapar apellidos, porque un archivo se reenvía todavía más fácil que una pantalla.
   */
  async function exportPeriod() {
    setMessage('');
    const params = new URLSearchParams({ format: 'xlsx' });
    if (periodId) params.set('cycleId', periodId);
    if (maskSurnames) params.set('maskSurnames', '1');
    const response = await apiRequest(`/api/v1/orders/export?${params.toString()}`);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'verdeo-pedidos.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  }

  if (failed) return <DashboardFailed label="los pedidos" />;
  if (!profile) return <DashboardLoading />;
  if (loading) return <DashboardLoading />;

  /*
   * El catálogo compartido más los botones. Se arma en el render y no en un `useMemo` porque
   * depende de `transition`, que se redefine en cada render: memorizarlo guardaría una versión
   * vieja de la función y los botones dejarían de recargar la lista.
   */
  /*
   * Los confirmados agrupados por zona, que es como cocina termina de producir.
   *
   * Sólo los CONFIRMED: un borrador todavía no se produjo y uno ya listo no vuelve a marcarse. Sin
   * zona cargada caen juntos en su propio grupo en vez de desaparecer del lote.
   */
  const readyBatches = [
    ...orders
      .filter((order) => order.status === 'CONFIRMED')
      .reduce((groups, order) => {
        const zone = order.deliveryZone ?? 'Sin zona';
        groups.set(zone, [...(groups.get(zone) ?? []), order]);
        return groups;
      }, new Map<string, OrderSummary[]>())
      .entries(),
  ]
    .map(([zone, zoneOrders]) => ({ orders: zoneOrders, zone }))
    .sort((left, right) => left.zone.localeCompare(right.zone, 'es-AR'));

  const intakeColumns: readonly OrderColumn[] = [
    ...buildOrderColumns({ maskSurnames }),
    {
      key: 'acciones',
      label: 'Acciones',
      locked: true,
      render: (order) => (
        <div className="row-actions">
          {order.status === 'DRAFT' && permissions.includes('orders.confirm') ? (
            <button
              className="button button-primary"
              onClick={() => void transition(order, 'CONFIRMED')}
              type="button"
            >
              Confirmar
            </button>
          ) : null}
          {order.status === 'CONFIRMED' && permissions.includes('orders.edit') ? (
            <button
              className="button button-secondary"
              onClick={() => void transition(order, 'READY')}
              type="button"
            >
              Marcar listo
            </button>
          ) : null}
          {['DRAFT', 'CONFIRMED'].includes(order.status) &&
          permissions.includes('orders.cancel') ? (
            <button
              className="button button-secondary"
              onClick={() => void transition(order, 'CANCELLED')}
              type="button"
            >
              Cancelar
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="dashboard-kicker">Pedidos</p>
            <h1 className="text-2xl font-semibold text-forest">Tomar y confirmar pedidos</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Sin "todos los períodos": esto es la cola de esta semana, no un archivo. Para
                buscar en el histórico está "Ver pedidos". */}
            <PeriodPicker onChange={setPeriodId} periods={periods} value={periodId ?? ''} />
            <ColumnPicker
              columns={intakeColumns}
              onChange={(next) => {
                setVisibleColumns(next);
                writeStoredColumns(COLUMNS_KEY, next);
              }}
              visible={visibleColumns}
            />
            <label className="field-inline">
              <input
                checked={maskSurnames}
                onChange={(event) => {
                  setMaskSurnames(event.target.checked);
                  writeMaskSurnames(event.target.checked);
                }}
                type="checkbox"
              />
              Ocultar apellidos
            </label>
            <button
              className="button button-secondary"
              onClick={() => void exportPeriod()}
              type="button"
            >
              Exportar Excel
            </button>
            {permissions.includes('orders.create') ? (
              <button
                className="button button-primary"
                onClick={() => setFormOpen((current) => !current)}
                type="button"
              >
                {formOpen ? 'Cerrar formulario' : '+ Nuevo pedido'}
              </button>
            ) : null}
          </div>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {formOpen && permissions.includes('orders.create') ? (
          <form
            className="operation-card mt-6 max-w-3xl"
            // El navegador no reporta: cortaba el envío y mostraba su globo sobre un campo que en
            // este formulario suele estar fuera de la pantalla. Lo reporta createOrder.
            noValidate
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
                {/*
                 * Sin opción por defecto, igual que "Pago esperado" acá al lado. "Manual" era la
                 * primera y la preseleccionada, así que nadie la cambiaba nunca: los 230 pedidos
                 * cargados decían "Manual" y el campo no informaba absolutamente nada. Obligar a
                 * elegir es lo que lo vuelve un dato.
                 */}
                <select defaultValue="" name="source" required>
                  <option disabled value="">
                    Seleccionar
                  </option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="phone">Teléfono</option>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
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

            {/*
             * El estado de la regla, al lado del botón y contando en vivo.
             *
             * El aviso de "elegí exactamente cinco" se dibuja arriba de todo el formulario, a
             * doscientas líneas de acá: en un teléfono, con la lista de platos abierta, apretar
             * "Registrar borrador" parecía no hacer nada porque el mensaje aparecía fuera de la
             * pantalla. Contar antes de apretar evita llegar a ese punto.
             */}
            {selectedOffering?.composable ? (
              <p className={`intake-rule mt-3 ${selectedDishes.length === 5 ? 'is-ready' : ''}`}>
                {selectedDishes.length === 5
                  ? 'Cinco platos elegidos. Ya podés registrar el borrador.'
                  : `Elegiste ${selectedDishes.length} de 5 platos.`}
              </p>
            ) : null}

            {/* El mismo mensaje que arriba, acá abajo, donde está el dedo cuando algo falla. */}
            {message ? (
              <p className="intake-rule intake-rule-alert mt-3" role="alert">
                {message}
              </p>
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

        {/*
         * La misma tabla configurable que "Ver pedidos", más la columna de acciones —que no se
         * puede apagar, porque esta pantalla existe para tocar esos botones.
         */}
        {/*
         * Marcar listos por zona.
         *
         * Cocina produce por lote: cuando termina una zona, termina entera. Pasar veinte pedidos de
         * a uno es repetir el mismo clic sobre una decisión que ya se tomó para todo el grupo.
         *
         * Sólo aparecen las zonas que tienen algo que marcar, y el botón dice cuántos son: "Marcar
         * listos" a secas obliga a contar las filas antes de animarse a tocarlo.
         */}
        {permissions.includes('orders.edit') && readyBatches.length > 0 ? (
          <div className="ready-batches mt-6">
            <p className="ready-batches-title">Marcar listos por zona</p>
            <div className="ready-batches-row">
              {readyBatches.map((batch) => (
                <button
                  className="button button-secondary"
                  disabled={markingZone !== null}
                  key={batch.zone}
                  onClick={() => void markZoneReady(batch.zone, batch.orders)}
                  type="button"
                >
                  {markingZone === batch.zone
                    ? 'Marcando…'
                    : `${batch.zone} · ${String(batch.orders.length)}`}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          <DataTable
            caption="Pedidos pendientes de acción"
            columns={intakeColumns.filter((column) => visibleColumns.includes(column.key))}
            empty="Ningún pedido pendiente de acción."
            rowKey={(order) => order.id}
            rows={orders}
          />
        </div>
      </section>

      {cancelling ? (
        <CancelOrderDialog
          onCancel={() => setCancelling(null)}
          onConfirm={(input) => cancelOrder(cancelling, input)}
          orderNumber={`el pedido de ${maskSurnames ? maskSurname(cancelling.customer.displayName) : cancelling.customer.displayName}`}
        />
      ) : null}

      {savedNumber ? (
        <AfterSaveDialog
          detail={`Quedó como borrador con el número ${savedNumber}.`}
          keepLabel="Conservar los datos"
          newLabel="Cargar otro pedido"
          onKeep={() => setSavedNumber(null)}
          onNew={() => {
            // Vaciar de verdad: el formulario, lo elegido y el cliente. Lo guardado no se pierde,
            // ya está en la base.
            formRef.current?.reset();
            setSelectedCustomer(null);
            setCustomerResults([]);
            setCustomerQuery('');
            setSelectedOfferingId('');
            setSelectedDishes([]);
            setSavedNumber(null);
          }}
          title="Pedido registrado"
        />
      ) : null}
    </DashboardShell>
  );
}
