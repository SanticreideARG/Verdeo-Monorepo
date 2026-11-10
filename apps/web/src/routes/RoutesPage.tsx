import { RouteTimingPanel, type RoutePoint } from '../components/RouteTimingPanel.js';
import { clockPlus, routeTiming } from '../lib/routeTiming.js';
import { RouteMoneyBreakdown, type RouteMoney } from '../components/RouteMoneyBreakdown.js';
import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { useSearchParams } from 'react-router-dom';

import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DeliveryRunsPanel } from '../components/DeliveryRunsPanel.js';
import { UnlocatedOrdersPanel } from '../components/LocateAddress.js';
import { EmptyState } from '../components/EmptyState.js';
import {
  RouteManualOrderBar,
  RouteManualOrderList,
  splitManualOrder,
} from '../components/RouteManualOrder.js';
import { RouteMap } from '../components/RouteMap.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest, storedOperatingSiteId } from '../lib/api.js';
import { formatDay, formatDayLong, todayInOperation } from '../lib/dates.js';
import { googleMapsLink } from '../lib/mapLinks.js';
import { maskSurname } from '../lib/maskName.js';
import { neighborhoodHeading } from '../lib/neighborhoodGroups.js';
import { courierCollects, routeMessage, withoutNewMark } from '../lib/routeMessage.js';
import { errorMessage, formatMoney } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';
import { useNarrowViewport } from '../lib/useNarrowViewport.js';
import { showToast } from '../lib/toast.js';

interface RouteSummary {
  deliveryDate: string;
  id: string;
  label: string | null;
  operatingSiteId: string;
  publishedAt: string | null;
  status: 'draft' | 'published' | 'completed';
  stopCount: number;
}

/** Un pedido del día sin hoja (`GET /delivery/routes/:id/available-orders`). */
interface AvailableOrder {
  customerDisplayName: string;
  deliveryAddress: string | null;
  id: string;
  located: boolean;
  neighborhood: string | null;
  publicNumber: string;
  zone: string | null;
}

interface RouteStop {
  customerDisplayName: string;
  deliveryAddress: string;
  deliveryAddressLine2?: string | null;
  deliveryLatitude: number | null;
  /** Qué entregar acá, ya escrito por el servidor: "Menú Keto 400", "Intuitivo 250". */
  detail: string;
  deliveryLocationUrl: string | null;
  deliveryLongitude: number | null;
  /** La franja horaria del pedido (o, si no tiene, la de la ficha). Texto libre. */
  deliveryWindow: string | null;
  id: string;
  /** El barrio del domicilio: agrupa las paradas. */
  neighborhood: string | null;
  orderId: string;
  paymentExpectation: string;
  publicNumber: string;
  sequence: number;
  status: string;
  totalMinor: number;
}

interface RouteDetail extends RouteSummary {
  departureTime?: string | null;
  end?: RoutePoint | null;
  start?: RoutePoint | null;
  stops: RouteStop[];
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

/** Fechas de entrega con pedidos por repartir, y en qué estado están para poder rutearlos. */
interface RoutableDate {
  deliveryDate: string;
  /** Por repartir, geocodificados y todavía sin ruta: los que entrarían en la hoja. */
  geocoded: number;
  /** Ya están en otra ruta activa. */
  routed: number;
  total: number;
}

/** "Rutas" (Operación): se propone una hoja para una ciudad, una fecha y opcionalmente una zona; el
 * optimizador secuencia todo pedido por repartir —confirmado o listo— con domicilio geocodificado,
 * y después se reordena, se asigna y se publica. Nada llega a la app de reparto (`/delivery`) hasta
 * publicar (DELIVERY_AND_ROUTES.md: "optimización asistida, decisión humana"). */
export function RoutesPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const narrow = useNarrowViewport();
  /*
   * Las zonas de la ciudad que está elegida arriba.
   *
   * `/api/v1/zones` ya viene acotado al ámbito de la barra, así que no hace falta filtrar acá; y
   * cambiar de ciudad recarga la pantalla entera, así que alcanza con pedirlas una vez.
   */
  const [zones, setZones] = useState<{ displayName: string; id: string }[]>([]);
  /*
   * Los días que tienen pedidos esperando una ruta.
   *
   * Reemplazan al campo de fecha libre. La fecha de entrega de un pedido es la del cierre de su
   * semana, no "mañana": el formulario proponía para mañana, no encontraba nada, y contestaba "0
   * paradas" sin decir por qué. Se recargan al cambiar de zona, porque la respuesta depende de ella.
   */
  const [routableDates, setRoutableDates] = useState<RoutableDate[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  /** Se vuelve a pedir la lista de días después de ubicar pedidos. */
  const [datesVersion, setDatesVersion] = useState(0);
  const activeDate = routableDates.some((date) => date.deliveryDate === selectedDate)
    ? selectedDate
    : (routableDates[0]?.deliveryDate ?? '');
  /*
   * Las zonas de la hoja (2026-11-05): una o varias. Neuquén y Plottier salen en el mismo reparto,
   * así que una hoja tiene que poder juntarlas. Ninguna tildada es la ciudad entera.
   */
  const [zoneIds, setZoneIds] = useState<string[]>([]);
  // "?reparto=<id>" abre ese reparto (la alerta del día lleva al de hoy); "?vista=hojas", las hojas.
  const [searchParams] = useSearchParams();
  const runToOpen = searchParams.get('reparto');
  const [tab, setTab] = useState<'hojas' | 'repartos'>(
    searchParams.get('vista') === 'hojas' ? 'hojas' : 'repartos',
  );
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteDetail | null>(null);
  // La parada que se está arrastrando y sobre cuál va (2026-10-25).
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  // "Establecer orden manualmente": las paradas elegidas hasta ahora; null, fuera de ese modo.
  const [manualOrder, setManualOrder] = useState<string[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  /*
   * Qué se está por confirmar: descartar una propuesta, o publicarla.
   *
   * Publicar era la acción sin confirmación de esta pantalla, y es la que menos vuelve: manda la
   * hoja al teléfono del repartidor. Descartar usaba dos toques del mismo botón, que es un cuarto
   * patrón para lo mismo.
   */
  const [pending, setPending] = useState<
    | {
        kind: 'descartar';
        routeId: string;
      }
    | { kind: 'sacar'; name: string; routeId: string; stopId: string }
    | null
  >(null);
  /*
   * Sumar pedidos a la hoja (2026-11-05): los del día que no están en ninguna. Una hoja nunca es
   * definitiva, publicada o no.
   */
  const [adding, setAdding] = useState<AvailableOrder[] | null>(null);
  const [addPick, setAddPick] = useState<string[]>([]);
  const [addBusy, setAddBusy] = useState(false);
  /* El enlace recién generado. Se muestra una vez: el token no se puede volver a leer, sólo
     generar otro — y generar otro da de baja el anterior. */
  const [issuedLink, setIssuedLink] = useState<{ expiresAt: string; url: string } | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  /* Las rutas de semanas pasadas están, pero no estorbando: se piden. */
  const [mostrarViejas, setMostrarViejas] = useState(false);
  const [progress, setProgress] = useState<
    | (RouteMoney & {
        collectedMinor: number;
        deliveredCount: number;
        pendingCollectionMinor: number;
        stopCount: number;
      })
    | null
  >(null);
  const [loading, setLoading] = useState(true);

  /*
   * Las rutas que importan hoy, primero la más próxima.
   *
   * La lista venía en el orden que la devolvía el servidor y con el histórico entero adentro: para
   * encontrar la ruta de mañana había que pasar por las de agosto. Lo que se reparte es de esta
   * semana en adelante, así que eso es lo que se muestra; lo anterior sigue estando, a un toque.
   *
   * El corte es la fecha de hoy en la operación, no "el período abierto": una ruta es de un día.
   */
  const hoy = todayInOperation();
  const rutasVigentes = routes.filter((route) => route.deliveryDate >= hoy);
  const rutasViejas = routes.filter((route) => route.deliveryDate < hoy);
  const rutasVisibles = [...(mostrarViejas ? routes : rutasVigentes)].sort((left, right) =>
    // Cronológico de verdad: la de mañana arriba. Entre dos del mismo día manda la etiqueta, para
    // que dos hojas de la misma fecha no bailen de lugar entre recargas.
    left.deliveryDate === right.deliveryDate
      ? (left.label ?? '').localeCompare(right.label ?? '', 'es-AR')
      : left.deliveryDate.localeCompare(right.deliveryDate),
  );

  const canRead = profile?.permissions.includes('routes.read') ?? false;
  const canManage = profile?.permissions.includes('routes.manage') ?? false;
  const canPublish = profile?.permissions.includes('routes.publish') ?? false;

  const loadRoutes = useCallback(async () => {
    const response = await apiRequest('/api/v1/delivery/routes');
    if (response.ok) setRoutes(((await response.json()) as { items: RouteSummary[] }).items);
  }, []);

  const loadRouteDetail = useCallback(async (routeId: string) => {
    const response = await apiRequest(`/api/v1/delivery/routes/${routeId}`);
    if (!response.ok) return;
    const detail = (await response.json()) as RouteDetail;
    setSelectedRoute(detail);
    // El enlace que se mostró es de la ruta anterior: dejarlo en pantalla sería ofrecer el enlace
    // de una hoja mirando otra.
    setIssuedLink(null);
    setProgress(null);
    // Cómo va la ruta mientras alguien la está haciendo.
    const avance = await apiRequest(`/api/v1/delivery/routes/${routeId}/progress`);
    if (avance.ok) {
      setProgress(
        (await avance.json()) as RouteMoney & {
          collectedMinor: number;
          deliveredCount: number;
          pendingCollectionMinor: number;
          stopCount: number;
        },
      );
    }
  }, []);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    void Promise.all([
      loadRoutes(),
      apiRequest('/api/v1/zones').then(async (response) => {
        if (response.ok) {
          setZones(
            ((await response.json()) as { items: { displayName: string; id: string }[] }).items,
          );
        }
      }),
    ]).finally(() => setLoading(false));
  }, [canRead, loadRoutes]);

  useEffect(() => {
    if (!canRead) return;
    const params = new URLSearchParams(
      zoneIds.length > 0 ? { geographicZoneId: zoneIds.join(',') } : {},
    );
    void apiRequest(`/api/v1/delivery/routable-dates?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) return;
        setRoutableDates(((await response.json()) as { items: RoutableDate[] }).items);
      })
      .catch(() => setRoutableDates([]));
  }, [canRead, datesVersion, zoneIds]);

  async function createRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    /*
     * El formulario se guarda ANTES del await. React deja `event.currentTarget` en null en cuanto
     * el handler cede el control, así que el `.reset()` de después tiraba un TypeError y se llevaba
     * puesto todo lo que venía atrás: cerrar el formulario, recargar la lista y mostrar la ruta
     * recién creada. La ruta se creaba —hay siete en la base— y la pantalla no decía nada.
     */
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    /*
     * Sin etiqueta escrita, la etiqueta son las zonas ("Neuquén + Plottier").
     *
     * Con varias hojas del mismo día la lista las muestra sólo por fecha, y quedaban tres "2026-09-10"
     * indistinguibles. El nombre de la zona es exactamente lo que las separa.
     */
    const label =
      formText(form, 'label').trim() ||
      zones
        .filter((zone) => zoneIds.includes(zone.id))
        .map((zone) => zone.displayName)
        .join(' + ');
    const operatingSiteId = storedOperatingSiteId();
    if (!operatingSiteId) {
      setMessage('Elegí una ciudad en el selector de arriba antes de proponer una ruta.');
      return;
    }
    const response = await apiRequest('/api/v1/delivery/routes', {
      body: JSON.stringify({
        deliveryDate: formText(form, 'deliveryDate'),
        // La ciudad sale del selector de la barra, que es el que manda en toda la pantalla.
        operatingSiteId,
        ...(zoneIds.length > 0 ? { geographicZoneIds: zoneIds } : {}),
        ...(label ? { label } : {}),
      }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const route = (await response.json()) as RouteDetail;
    formEl.reset();
    setFormOpen(false);
    await loadRoutes();
    setSelectedRoute(route);
    setMessage(
      route.stops.length > 0
        ? `Ruta creada con ${String(route.stops.length)} paradas.`
        : 'Ruta creada, pero sin paradas: no hay pedidos por repartir ese día en esa zona.',
    );
  }

  /**
   * El enlace de mapa de una parada.
   *
   * Primero las coordenadas del domicilio, que ya pasaron por el ubicador; después el enlace que
   * compartió el cliente (a veces es una búsqueda por texto, no un punto); y si no hay ninguno, una
   * búsqueda por la dirección escrita. Ver `googleMapsLink`.
   */
  function stopMapLink(stop: RouteStop): string {
    return googleMapsLink({
      address: stop.deliveryAddress,
      latitude: stop.deliveryLatitude,
      locationUrl: stop.deliveryLocationUrl,
      longitude: stop.deliveryLongitude,
    });
  }

  async function copyRoute(route: RouteDetail) {
    await navigator.clipboard.writeText(routeMessage(route, stopMapLink));
    showToast('Mensaje de la ruta copiado. Pegalo en el chat del repartidor.');
  }

  /** La misma ruta como planilla, para quien prefiere abrirla en Excel. */
  function downloadRouteCsv(route: RouteDetail) {
    /*
     * Se entrecomilla sólo lo que lo necesita.
     *
     * Entrecomillar todo parecía más seguro y resultó lo contrario: el archivo empieza con el BOM
     * que le dice a Excel que esto es UTF-8, y con el BOM pegado a la comilla de apertura el primer
     * campo deja de parecer entrecomillado. Google Sheets en el teléfono lo lee así y muestra
     * `Orden"` con la comilla a la vista — y, como no reconoció el BOM, encima lee el archivo en
     * la codificación del sistema y parte cada acento en dos: "Neuquén" sale "NeuquÃ©n".
     *
     * Con comillas sólo donde hacen falta, el primer campo es texto plano y el BOM queda solo al
     * principio, que es donde un lector lo espera.
     */
    const escape = (value: string) =>
      /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    const rows = [
      [
        'Orden',
        'Barrio',
        'Cliente',
        'Recibe',
        'Qué entregar',
        'Dirección',
        'Ubicación',
        'Medio de pago',
        'Total',
      ],
      ...route.stops.map((stop) => [
        String(stop.sequence),
        stop.neighborhood ?? '',
        maskSurname(withoutNewMark(stop.customerDisplayName)),
        stop.deliveryWindow ?? '',
        withoutNewMark(stop.detail),
        [stop.deliveryAddress, stop.deliveryAddressLine2 ?? ''].filter(Boolean).join(' · '),
        stopMapLink(stop),
        // Sólo lo que cobra quien reparte; la transferencia no (2026-10-25).
        courierCollects(stop.paymentExpectation) ? stop.paymentExpectation : 'No cobrar',
        courierCollects(stop.paymentExpectation) ? String(stop.totalMinor / 100) : '',
      ]),
    ];
    // BOM para que Excel abra los acentos bien; sin esto "Neuquén" sale roto.
    const csv = `\uFEFF${rows.map((row) => row.map(escape).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `ruta-${formatDay(route.deliveryDate)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  /**
   * Descartar una propuesta.
   *
   * Proponer es barato y las propuestas se acumulan: la lista se llena de "0 paradas · Borrador" y
   * deja de decir cuál es la ruta de mañana. Se puede siempre: una hoja es orden interno.
   */
  async function discard(routeId: string) {
    const response = await apiRequest(`/api/v1/delivery/routes/${routeId}`, { method: 'DELETE' });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    if (selectedRoute?.id === routeId) setSelectedRoute(null);
    await loadRoutes();
    showToast('Hoja borrada.');
  }

  async function issueLink(routeId: string) {
    setLinkBusy(true);
    setMessage('');
    const response = await apiRequest(`/api/v1/delivery/routes/${routeId}/link`, {
      body: JSON.stringify({}),
      method: 'POST',
    });
    setLinkBusy(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setIssuedLink((await response.json()) as { expiresAt: string; url: string });
    showToast('Enlace generado. Pasáselo a quien reparte.');
  }

  async function revokeLink(routeId: string) {
    const response = await apiRequest(`/api/v1/delivery/routes/${routeId}/link`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setIssuedLink(null);
    showToast('El enlace dejó de servir.');
  }

  /**
   * Mover una parada de `from` a `to` (2026-10-25: arrastrando, en lugar de las flechas). La lista
   * cambia en el acto; si el servidor no acepta el orden, se vuelve a leer la ruta.
   */
  async function reorder(from: number, to: number) {
    if (!selectedRoute || from === to) return;
    const stops = [...selectedRoute.stops];
    if (to < 0 || to >= stops.length) return;
    const [moved] = stops.splice(from, 1);
    if (!moved) return;
    stops.splice(to, 0, moved);
    await saveOrder(selectedRoute, stops);
  }

  async function saveOrder(route: RouteDetail, stops: RouteStop[]) {
    setSelectedRoute({
      ...route,
      stops: stops.map((stop, index) => ({ ...stop, sequence: index + 1 })),
    });
    const response = await apiRequest(`/api/v1/delivery/routes/${route.id}/stops`, {
      body: JSON.stringify({ stopIds: stops.map((stop) => stop.id) }),
      method: 'PUT',
    });
    if (!response.ok) setMessage(await errorMessage(response));
    else showToast('Cambios guardados.');
    await loadRouteDetail(route.id);
    return response.ok;
  }

  // La lista de "Sumar pedidos" es de una hoja: al pasar a otra se cierra, para no mostrar la vieja.
  const openRouteId = selectedRoute?.id;
  useEffect(() => {
    setAdding(null);
    setAddPick([]);
  }, [openRouteId]);

  async function openAdd(routeId: string) {
    setAddPick([]);
    const response = await apiRequest(`/api/v1/delivery/routes/${routeId}/available-orders`);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setAdding(((await response.json()) as { orders: AvailableOrder[] }).orders);
  }

  async function confirmAdd(routeId: string) {
    if (addPick.length === 0) return;
    setAddBusy(true);
    const response = await apiRequest(`/api/v1/delivery/routes/${routeId}/stops`, {
      body: JSON.stringify({ orderIds: addPick }),
      method: 'POST',
    });
    setAddBusy(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setSelectedRoute((await response.json()) as RouteDetail);
    setAdding(null);
    setDatesVersion((version) => version + 1);
    showToast(
      addPick.length === 1
        ? 'Pedido sumado al final de la hoja. Acomodalo arrastrándolo.'
        : `${String(addPick.length)} pedidos sumados al final de la hoja. Acomodalos arrastrándolos.`,
    );
  }

  async function removeStop(routeId: string, stopId: string) {
    const response = await apiRequest(`/api/v1/delivery/routes/${routeId}/stops/${stopId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setSelectedRoute((await response.json()) as RouteDetail);
    setDatesVersion((version) => version + 1);
    // Con "Sumar pedidos" abierto, el que se acaba de sacar tiene que aparecer ahí.
    if (adding) await openAdd(routeId);
    showToast('Parada sacada. El pedido queda libre para otra hoja.');
  }

  async function saveManualOrder() {
    if (!selectedRoute || !manualOrder) return;
    const { pending, picked } = splitManualOrder(selectedRoute.stops, manualOrder);
    if (pending.length > 0) return;
    setSavingOrder(true);
    const saved = await saveOrder(selectedRoute, picked);
    setSavingOrder(false);
    if (saved) {
      setManualOrder(null);
    }
  }

  function pickStop(stopId: string) {
    setManualOrder((current) =>
      current && !current.includes(stopId) ? [...current, stopId] : current,
    );
  }

  /*
   * Arrastrar y soltar con el puntero (mouse o dedo, el mismo código): se toma la parada por la
   * manija y se suelta sobre otra. Con el teclado, la manija se mueve con las flechas.
   */
  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ from: index, over: index });
  }

  function dragOver(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-stop-index]');
    const over = target ? Number(target.dataset.stopIndex) : drag.over;
    if (over !== drag.over) setDrag({ ...drag, over });
  }

  function endDrag() {
    if (!drag) return;
    setDrag(null);
    void reorder(drag.from, drag.over);
  }

  // El orden a medio elegir es de esa ruta: al cambiar de ruta, se abandona.
  const selectedRouteId = selectedRoute?.id;
  useEffect(() => {
    setManualOrder(null);
    setAdding(null);
  }, [selectedRouteId]);

  if (failed) return <DashboardFailed label="las rutas" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Rutas</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver rutas.</p>
        </section>
      </DashboardShell>
    );
  }

  // Los tiempos estimados de cada parada de la ruta elegida (ver RouteTimingPanel).
  const stopTiming = routeTiming(
    selectedRoute?.start ?? null,
    selectedRoute?.end ?? null,
    selectedRoute?.stops ?? [],
  );

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex items-center justify-between">
          <div>
            <p className="dashboard-kicker">Operación</p>
            <h1 className="text-2xl font-semibold text-forest">Rutas y repartos</h1>
          </div>
          {canManage && tab === 'hojas' ? (
            <button
              className="button button-secondary"
              onClick={() => setFormOpen((open) => !open)}
              type="button"
            >
              {formOpen ? 'Cancelar' : '+ Proponer ruta'}
            </button>
          ) : null}
        </header>

        {/*
          Primero los repartos —qué sale cada día y con qué pedidos— y después las hojas de ruta,
          que salen de ellos (DELIVERY_RUNS_PLAN.md).
        */}
        <div className="order-import-tabs routes-tabs" role="tablist">
          <button
            aria-selected={tab === 'repartos'}
            className={tab === 'repartos' ? 'is-active' : ''}
            onClick={() => setTab('repartos')}
            role="tab"
            type="button"
          >
            Repartos
          </button>
          <button
            aria-selected={tab === 'hojas'}
            className={tab === 'hojas' ? 'is-active' : ''}
            onClick={() => setTab('hojas')}
            role="tab"
            type="button"
          >
            Hojas de ruta
          </button>
        </div>
        {tab === 'repartos' ? (
          <DeliveryRunsPanel
            canManage={canManage}
            onRoutesCreated={() => {
              setTab('hojas');
              void loadRoutes();
            }}
            openRunId={runToOpen}
          />
        ) : null}
        <div hidden={tab !== 'hojas'}>
          {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}

          {formOpen ? (
            <form
              className="mt-6 grid gap-3 rounded-2xl border border-forest/10 bg-[var(--db-surface)] p-6 sm:grid-cols-3"
              onSubmit={(event) => void createRoute(event)}
            >
              {/*
              La ciudad ya está elegida arriba, en el selector de la barra: volver a preguntarla acá
              es pedir dos veces lo mismo y dejar abierta la posibilidad de armar una ruta para una
              ciudad distinta de la que se está mirando. Lo que sí hace falta elegir es la zona: el
              reparto sale por zona, y una hoja por zona es una hoja que se puede seguir.
            */}
              <fieldset className="field routes-zone-picker">
                <legend>Zonas</legend>
                <small>Sin tildar, toda la ciudad. Podés juntar varias en la misma hoja.</small>
                {zones.map((zone) => (
                  <label className="label-switch" key={zone.id}>
                    <input
                      checked={zoneIds.includes(zone.id)}
                      onChange={(event) =>
                        setZoneIds((current) =>
                          event.target.checked
                            ? [...current, zone.id]
                            : current.filter((id) => id !== zone.id),
                        )
                      }
                      type="checkbox"
                    />
                    {zone.displayName}
                  </label>
                ))}
              </fieldset>
              <label className="field">
                Fecha de entrega
                {/*
                 * Sólo los días que tienen pedidos, con cuántos entrarían en la hoja. Un campo de
                 * fecha libre dejaba proponer rutas para días vacíos, que es lo que venía pasando.
                 */}
                {routableDates.length > 0 ? (
                  <select
                    name="deliveryDate"
                    onChange={(event) => setSelectedDate(event.target.value)}
                    required
                    value={activeDate}
                  >
                    {routableDates.map((date) => (
                      <option key={date.deliveryDate} value={date.deliveryDate}>
                        {formatDayLong(date.deliveryDate)} · {String(date.geocoded)} para rutear
                        {date.routed > 0 ? ` (${String(date.routed)} ya en ruta)` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input disabled placeholder="No hay pedidos por repartir" />
                )}
              </label>
              <label className="field">
                Etiqueta (opcional)
                <input name="label" placeholder="Ej. Turno mañana" />
              </label>
              <button
                className="button button-primary sm:col-span-3"
                disabled={routableDates.length === 0}
                type="submit"
              >
                Proponer ruta
              </button>
              {/*
               * Por qué no hay nada que rutear, cuando no lo hay. "0 paradas" tiene dos causas muy
               * distintas —sin geocodificar, o ya en otra ruta— y sin decirlas no hay forma de saber
               * qué hacer al respecto.
               */}
              {routableDates.length === 0 ? (
                <p className="text-sm text-ink-muted sm:col-span-3">
                  No hay pedidos por repartir en esta ciudad
                  {zoneIds.length === 1
                    ? ' y esta zona'
                    : zoneIds.length > 1
                      ? ' y estas zonas'
                      : ''}
                  . Un pedido entra en una hoja de ruta cuando está confirmado o listo, y su
                  domicilio está geocodificado.
                </p>
              ) : (
                <>
                  {/*
                   * Los pedidos sin ubicación del día elegido, que antes se omitían de la hoja sin
                   * avisar: se listan y se pueden ubicar acá, antes de proponer la ruta.
                   */}
                  {activeDate ? (
                    <UnlocatedOrdersPanel
                      deliveryDate={activeDate}
                      onChanged={() => setDatesVersion((version) => version + 1)}
                    />
                  ) : null}
                  <p className="text-sm text-ink-muted sm:col-span-3">
                    {routableDates.reduce(
                      (total, date) => total + date.total - date.geocoded - date.routed,
                      0,
                    ) > 0
                      ? `Hay ${String(routableDates.reduce((total, date) => total + date.total - date.geocoded - date.routed, 0))} pedidos por repartir que no entran en ninguna hoja porque su domicilio no está geocodificado.`
                      : 'Todos los pedidos por repartir tienen domicilio geocodificado.'}
                  </p>
                </>
              )}
            </form>
          ) : null}

          {loading ? (
            <p className="mt-6 text-ink-muted">Cargando…</p>
          ) : (
            <div className={`routes-layout mt-6 ${narrow && selectedRoute ? 'is-detail' : ''}`}>
              {/*
               * `content-start` es el arreglo de la lista rota: la columna mide lo que mide el visor
               * de al lado —que con veinte paradas es larguísimo— y sin esto cada tarjeta se repartía
               * ese alto, quedando fichas gigantes y casi vacías.
               */}
              <ul className="routes-list grid content-start gap-2">
                {rutasVisibles.map((route) => (
                  <li key={route.id}>
                    <button
                      className={`w-full rounded-xl border px-4 py-3 text-left ${
                        selectedRoute?.id === route.id
                          ? 'border-forest bg-forest/5'
                          : 'border-forest/10 bg-[var(--db-surface)]'
                      }`}
                      onClick={() => void loadRouteDetail(route.id)}
                      type="button"
                    >
                      <p className="font-semibold text-forest">
                        {formatDay(route.deliveryDate)} {route.label ? `· ${route.label}` : ''}
                      </p>
                      <p className="text-xs text-ink-muted">{route.stopCount} paradas</p>
                    </button>
                  </li>
                ))}
                {rutasViejas.length > 0 ? (
                  <li>
                    <button
                      className="routes-older"
                      onClick={() => setMostrarViejas((current) => !current)}
                      type="button"
                    >
                      {mostrarViejas
                        ? 'Ocultar las anteriores'
                        : `Ver ${String(rutasViejas.length)} anteriores`}
                    </button>
                  </li>
                ) : null}
                {rutasVisibles.length === 0 ? (
                  <EmptyState
                    action={
                      canManage ? (
                        <button
                          className="button button-primary"
                          onClick={() => setFormOpen(true)}
                          type="button"
                        >
                          + Proponer ruta
                        </button>
                      ) : null
                    }
                    body="Se arma con los pedidos por repartir de una zona y una fecha, y quien reparte la ve cuando le pasás el enlace."
                    title="Todavía no hay ninguna ruta"
                  />
                ) : null}
              </ul>

              <div className="rounded-2xl border border-forest/10 bg-[var(--db-surface)] p-4">
                {!selectedRoute ? (
                  <p className="text-ink-muted">Elegí una ruta para ver sus paradas.</p>
                ) : (
                  <>
                    {/* En el teléfono el detalle reemplaza a la lista, así que hay que poder
                      volver. En escritorio están los dos a la vez y este botón no existe. */}
                    {narrow ? (
                      <button
                        className="routes-back"
                        onClick={() => setSelectedRoute(null)}
                        type="button"
                      >
                        ← Todas las rutas
                      </button>
                    ) : null}

                    {/* Cómo va la ruta: lo mismo que ve quien reparte. Que las dos pantallas
                      discrepen sobre cuánta plata hay en la calle sería peor que no mostrarlo. */}
                    {progress ? (
                      <p className="route-progress">
                        <span>
                          {progress.deliveredCount} de {progress.stopCount} entregadas
                        </span>
                        <span>Cobrado {formatMoney(progress.collectedMinor, 'ARS')}</span>
                        {progress.pendingCollectionMinor > 0 ? (
                          <span>
                            Falta cobrar {formatMoney(progress.pendingCollectionMinor, 'ARS')}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    {progress ? <RouteMoneyBreakdown money={progress} /> : null}

                    {issuedLink ? (
                      <div className="route-link">
                        <p>
                          Pasale este enlace a quien reparte. Abre la hoja del día en el teléfono,
                          sin clave. Vence el{' '}
                          {new Date(issuedLink.expiresAt).toLocaleString('es-AR')}.
                        </p>
                        <code>{issuedLink.url}</code>
                        <div>
                          <button
                            onClick={() => void navigator.clipboard.writeText(issuedLink.url)}
                            type="button"
                          >
                            Copiar
                          </button>
                          <button onClick={() => void revokeLink(selectedRoute.id)} type="button">
                            Dar de baja el enlace
                          </button>
                          <button onClick={() => setIssuedLink(null)} type="button">
                            Listo
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-forest">
                        {formatDay(selectedRoute.deliveryDate)}{' '}
                        {selectedRoute.label ? `· ${selectedRoute.label}` : ''}
                      </p>
                      {manualOrder ? null : (
                        <div className="flex flex-wrap gap-2">
                          {canManage &&
                          selectedRoute.status !== 'completed' &&
                          selectedRoute.stops.length > 1 ? (
                            <button
                              className="button button-secondary"
                              onClick={() => setManualOrder([])}
                              type="button"
                            >
                              Establecer orden manualmente
                            </button>
                          ) : null}
                          {canManage && selectedRoute.status !== 'completed' ? (
                            <button
                              className="button button-secondary"
                              onClick={() =>
                                adding ? setAdding(null) : void openAdd(selectedRoute.id)
                              }
                              type="button"
                            >
                              {adding ? 'Cerrar' : 'Sumar pedidos'}
                            </button>
                          ) : null}
                          {/* Lo que faltaba: poder sacar la ruta de la pantalla. */}
                          {selectedRoute.stops.length > 0 ? (
                            <>
                              <button
                                className="button button-secondary"
                                onClick={() => void copyRoute(selectedRoute)}
                                type="button"
                              >
                                Copiar para el repartidor
                              </button>
                              <button
                                className="button button-secondary"
                                onClick={() => downloadRouteCsv(selectedRoute)}
                                type="button"
                              >
                                Descargar planilla
                              </button>
                              {/* El enlace la lee en vivo: quien reparte ve los cambios al recargar. */}
                              {canPublish && selectedRoute.status !== 'completed' ? (
                                <button
                                  className="button button-primary"
                                  disabled={linkBusy}
                                  onClick={() => void issueLink(selectedRoute.id)}
                                  type="button"
                                >
                                  {linkBusy ? 'Generando…' : 'Enlace para el repartidor'}
                                </button>
                              ) : null}
                            </>
                          ) : null}
                          {canManage ? (
                            <button
                              className="button button-danger"
                              onClick={() =>
                                setPending({ kind: 'descartar', routeId: selectedRoute.id })
                              }
                              type="button"
                            >
                              Borrar hoja
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                    {adding && !manualOrder ? (
                      <div className="routes-add-panel">
                        {adding.length === 0 ? (
                          <p className="text-ink-muted">
                            No hay pedidos de este día sin hoja: todos ya están en alguna.
                          </p>
                        ) : (
                          <>
                            <p className="routes-add-hint">
                              Pedidos de este día que no están en ninguna hoja. Van al final;
                              después los acomodás arrastrándolos.
                            </p>
                            <ul className="routes-add-list">
                              {adding.map((order) => (
                                <li key={order.id}>
                                  <label className={order.located ? '' : 'is-disabled'}>
                                    <input
                                      checked={addPick.includes(order.id)}
                                      disabled={!order.located}
                                      onChange={(event) =>
                                        setAddPick((current) =>
                                          event.target.checked
                                            ? [...current, order.id]
                                            : current.filter((id) => id !== order.id),
                                        )
                                      }
                                      type="checkbox"
                                    />
                                    <span>
                                      <strong>{order.customerDisplayName}</strong>{' '}
                                      <small>{order.publicNumber}</small>
                                      <br />
                                      <small>
                                        {[order.deliveryAddress, order.neighborhood, order.zone]
                                          .filter(Boolean)
                                          .join(' · ')}
                                        {order.located
                                          ? ''
                                          : ' · Sin ubicación: confirmala en la ficha del cliente'}
                                      </small>
                                    </span>
                                  </label>
                                </li>
                              ))}
                            </ul>
                            <button
                              className="button button-primary"
                              disabled={addBusy || addPick.length === 0}
                              onClick={() => void confirmAdd(selectedRoute.id)}
                              type="button"
                            >
                              {addBusy
                                ? 'Sumando…'
                                : addPick.length === 0
                                  ? 'Elegí los pedidos'
                                  : `Sumar ${String(addPick.length)} a la hoja`}
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                    {manualOrder ? (
                      <RouteManualOrderBar
                        onCancel={() => setManualOrder(null)}
                        onReset={() => setManualOrder([])}
                        onSave={() => void saveManualOrder()}
                        onUndo={() => setManualOrder((current) => current?.slice(0, -1) ?? null)}
                        pickedCount={
                          splitManualOrder(selectedRoute.stops, manualOrder).picked.length
                        }
                        saving={savingOrder}
                        total={selectedRoute.stops.length}
                      />
                    ) : (
                      <RouteTimingPanel
                        canManage={canManage}
                        departureTime={selectedRoute.departureTime ?? null}
                        end={selectedRoute.end ?? null}
                        onUpdated={(route) => setSelectedRoute(route as RouteDetail)}
                        routeId={selectedRoute.id}
                        start={selectedRoute.start ?? null}
                        stops={selectedRoute.stops}
                      />
                    )}
                    <div className={`routes-viewer mt-4 ${manualOrder ? 'is-picking' : ''}`}>
                      {manualOrder ? (
                        <RouteManualOrderList
                          onPick={pickStop}
                          order={manualOrder}
                          stops={selectedRoute.stops}
                        />
                      ) : (
                        <ol className="routes-stops grid content-start gap-2">
                          {selectedRoute.stops.map((stop, index) => (
                            <Fragment key={stop.id}>
                              {neighborhoodHeading(selectedRoute.stops, index) ? (
                                <li aria-hidden="true" className="routes-neighborhood">
                                  {neighborhoodHeading(selectedRoute.stops, index)}
                                </li>
                              ) : null}
                              <li
                                className={[
                                  'routes-stop',
                                  drag?.from === index ? 'is-dragging' : '',
                                  drag && drag.from !== index && drag.over === index
                                    ? drag.from < index
                                      ? 'is-drop-after'
                                      : 'is-drop-before'
                                    : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                data-stop-index={index}
                              >
                                {/*
                                 * El número de parada va en su propia columna, fija.
                                 *
                                 * Estaba adentro del párrafo del nombre, así que al angostarse la
                                 * columna "1. Sofía Romero — NQN-00012" se partía en cuatro renglones y
                                 * el orden de la ruta —que es lo único que se lee de corrido— dejaba de
                                 * leerse. Afuera y en ancho fijo, el número siempre está donde se lo
                                 * busca.
                                 */}
                                <span className="routes-stop-seq">{stop.sequence}</span>
                                <div className="routes-stop-body">
                                  <p className="routes-stop-name">{stop.customerDisplayName}</p>
                                  {stopTiming.byStop.get(stop.id) ? (
                                    <p className="routes-stop-eta">
                                      +{stopTiming.byStop.get(stop.id)?.leg} min
                                      {clockPlus(
                                        selectedRoute.departureTime,
                                        stopTiming.byStop.get(stop.id)?.fromStart ?? 0,
                                      )
                                        ? ` · llega ≈ ${String(
                                            clockPlus(
                                              selectedRoute.departureTime,
                                              stopTiming.byStop.get(stop.id)?.fromStart ?? 0,
                                            ),
                                          )}`
                                        : ''}
                                    </p>
                                  ) : null}
                                  {stop.detail ? (
                                    <p className="routes-stop-detail">{stop.detail}</p>
                                  ) : null}
                                  <p className="routes-stop-address">
                                    {stop.deliveryAddress}
                                    {stop.deliveryAddressLine2 ? (
                                      <small> · {stop.deliveryAddressLine2}</small>
                                    ) : null}
                                  </p>
                                  {/* La franja horaria, donde iban el monto, el medio y el estado
                                  (2026-10-25): es lo que decide dónde va la parada. */}
                                  {stop.deliveryWindow ? (
                                    <p className="routes-stop-window">🕒 {stop.deliveryWindow}</p>
                                  ) : null}
                                </div>
                                {/* Reordenar y el estado, en una columna angosta que no empuja al texto:
                              dos botones de flecha no pueden costarle la mitad del ancho al
                              nombre del cliente. */}
                                <div className="routes-stop-aside">
                                  {canManage ? (
                                    <button
                                      aria-label={`Mover la parada ${String(stop.sequence)}: arrastrala, o usá las flechas del teclado`}
                                      className="routes-stop-handle"
                                      onKeyDown={(event) => {
                                        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                                          event.preventDefault();
                                          void reorder(
                                            index,
                                            index + (event.key === 'ArrowUp' ? -1 : 1),
                                          );
                                        }
                                      }}
                                      onPointerCancel={() => setDrag(null)}
                                      onPointerDown={(event) => startDrag(event, index)}
                                      onPointerMove={dragOver}
                                      onPointerUp={endDrag}
                                      title="Arrastrar para cambiar el orden"
                                      type="button"
                                    >
                                      ⠿
                                    </button>
                                  ) : null}
                                  {stop.status === 'delivered' ? (
                                    <span className="routes-stop-done">Entregada</span>
                                  ) : canManage && selectedRoute.status !== 'completed' ? (
                                    <button
                                      aria-label={`Sacar de la hoja a ${stop.customerDisplayName}`}
                                      className="routes-stop-remove"
                                      onClick={() =>
                                        setPending({
                                          kind: 'sacar',
                                          name: stop.customerDisplayName,
                                          routeId: selectedRoute.id,
                                          stopId: stop.id,
                                        })
                                      }
                                      title="Sacar de la hoja"
                                      type="button"
                                    >
                                      Sacar
                                    </button>
                                  ) : null}
                                </div>
                              </li>
                            </Fragment>
                          ))}
                          {selectedRoute.stops.length === 0 ? (
                            <p className="text-ink-muted">
                              No hay pedidos por repartir en esa fecha y esa zona.
                            </p>
                          ) : null}
                        </ol>
                      )}
                      {/* Todas las paradas juntas: es la única forma de ver si el orden propuesto
                      tiene sentido antes de publicarlo. */}
                      {selectedRoute.stops.length > 0 ? (
                        <RouteMap
                          end={selectedRoute.end ?? null}
                          picking={manualOrder ? { onPick: pickStop, order: manualOrder } : null}
                          start={selectedRoute.start ?? null}
                          stops={selectedRoute.stops}
                        />
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {pending ? (
        <ConfirmDialog
          confirmLabel={pending.kind === 'sacar' ? 'Sacar de la hoja' : 'Borrar hoja'}
          detail={
            pending.kind === 'sacar'
              ? `${pending.name} sale de esta hoja. El pedido no cambia: queda libre para sumarlo a otra.`
              : 'La hoja se borra y su enlace deja de servir. Los pedidos no cambian: los entregados siguen entregados y el resto queda disponible para otra hoja.'
          }
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            const target = pending;
            setPending(null);
            if (target.kind === 'sacar') await removeStop(target.routeId, target.stopId);
            else await discard(target.routeId);
          }}
          tone="destructivo"
          title={pending.kind === 'sacar' ? '¿Sacar esta parada?' : '¿Borrar esta hoja?'}
        />
      ) : null}
    </DashboardShell>
  );
}
