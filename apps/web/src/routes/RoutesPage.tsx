import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { EmptyState } from '../components/EmptyState.js';
import { RouteMap } from '../components/RouteMap.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest, storedOperatingSiteId } from '../lib/api.js';
import { formatDay, formatDayLong, todayInOperation } from '../lib/dates.js';
import { maskSurname } from '../lib/maskName.js';
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

interface RouteStop {
  customerDisplayName: string;
  deliveryAddress: string;
  deliveryLatitude: number | null;
  /** Qué entregar acá, ya escrito por el servidor: "Menú Keto 400", "Intuitivo 250 · Ana". */
  detail: string;
  deliveryLocationUrl: string | null;
  deliveryLongitude: number | null;
  id: string;
  orderId: string;
  paymentExpectation: string;
  publicNumber: string;
  sequence: number;
  status: string;
  totalMinor: number;
}

interface RouteDetail extends RouteSummary {
  stops: RouteStop[];
}

const STOP_STATUS_LABELS: Record<string, string> = {
  at_address: 'En el domicilio',
  delivered: 'Entregado',
  en_route: 'En camino',
  pending: 'Pendiente',
  skipped: 'Saltado',
};

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
  const [zoneId, setZoneId] = useState('');
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteDetail | null>(null);
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  /*
   * Qué se está por confirmar: descartar una propuesta, o publicarla.
   *
   * Publicar era la acción sin confirmación de esta pantalla, y es la que menos vuelve: manda la
   * hoja al teléfono del repartidor. Descartar usaba dos toques del mismo botón, que es un cuarto
   * patrón para lo mismo.
   */
  const [pending, setPending] = useState<{
    kind: 'descartar' | 'publicar';
    routeId: string;
  } | null>(null);
  /* El enlace recién generado. Se muestra una vez: el token no se puede volver a leer, sólo
     generar otro — y generar otro da de baja el anterior. */
  const [issuedLink, setIssuedLink] = useState<{ expiresAt: string; url: string } | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  /* Las rutas de semanas pasadas están, pero no estorbando: se piden. */
  const [mostrarViejas, setMostrarViejas] = useState(false);
  const [progress, setProgress] = useState<{
    collectedMinor: number;
    deliveredCount: number;
    pendingCollectionMinor: number;
    stopCount: number;
  } | null>(null);
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
    if (detail.status !== 'published') return;
    // Cómo va la ruta mientras alguien la está haciendo. Sólo para una ruta publicada: un borrador
    // no lo está repartiendo nadie.
    const avance = await apiRequest(`/api/v1/delivery/routes/${routeId}/progress`);
    if (avance.ok) {
      setProgress(
        (await avance.json()) as {
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
    const params = new URLSearchParams(zoneId ? { geographicZoneId: zoneId } : {});
    void apiRequest(`/api/v1/delivery/routable-dates?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) return;
        setRoutableDates(((await response.json()) as { items: RoutableDate[] }).items);
      })
      .catch(() => setRoutableDates([]));
  }, [canRead, zoneId]);

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
    const zoneId = formText(form, 'geographicZoneId');
    /*
     * Sin etiqueta escrita, la etiqueta es la zona.
     *
     * Con varias hojas del mismo día la lista las muestra sólo por fecha, y quedaban tres "2026-09-10"
     * indistinguibles. El nombre de la zona es exactamente lo que las separa.
     */
    const label =
      formText(form, 'label').trim() || zones.find((zone) => zone.id === zoneId)?.displayName || '';
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
        ...(zoneId ? { geographicZoneId: zoneId } : {}),
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
   * Prioridad a la ubicación que el cliente compartió: es la puerta exacta, dicha por quien vive
   * ahí. Si no hay, se arma con las coordenadas del domicilio. Y si tampoco hay coordenadas, una
   * búsqueda por la dirección escrita: peor que un pin, muchísimo mejor que tipearla a mano en el
   * teléfono, parado en la vereda.
   */
  function stopMapLink(stop: RouteStop): string {
    if (stop.deliveryLocationUrl) return stop.deliveryLocationUrl;
    if (stop.deliveryLatitude !== null && stop.deliveryLongitude !== null) {
      return `https://www.google.com/maps/search/?api=1&query=${String(stop.deliveryLatitude)},${String(stop.deliveryLongitude)}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.deliveryAddress)}`;
  }

  /**
   * La ruta como algo que se le puede pasar a alguien.
   *
   * Es el mensaje que se pega en el chat del repartidor: las paradas en orden, con el enlace de
   * mapa de cada una —que es lo que se abre en el teléfono, y lo que una dirección escrita no
   * resuelve— y lo que hay que cobrar ahí.
   *
   * Sin apellidos. El mensaje sale del sistema y entra a un chat de WhatsApp, que se reenvía sin
   * pensarlo; el nombre de pila alcanza de sobra para saber a quién se le entrega.
   */
  function routeMessage(route: RouteDetail): string {
    const header = `Reparto ${formatDay(route.deliveryDate)}${route.label ? ` · ${route.label}` : ''} — ${String(route.stops.length)} paradas`;
    const lines = route.stops.map((stop) =>
      [
        `${String(stop.sequence)}. ${maskSurname(stop.customerDisplayName)}`,
        // Qué entregar, antes que dónde: es lo que se busca en la caja al bajar del auto.
        ...(stop.detail ? [stop.detail] : []),
        stop.deliveryAddress,
        stopMapLink(stop),
        // El medio de pago va en la parada: es lo que el repartidor tiene que cobrar ahí.
        `${stop.paymentExpectation} · ${formatMoney(stop.totalMinor, 'ARS')}`,
      ].join('\n'),
    );
    return [header, '', ...lines].join('\n\n');
  }

  async function copyRoute(route: RouteDetail) {
    await navigator.clipboard.writeText(routeMessage(route));
    showToast('Mensaje de la ruta copiado. Pegalo en el chat del repartidor.');
  }

  /** La misma ruta como planilla, para quien prefiere abrirla en Excel. */
  function downloadRouteCsv(route: RouteDetail) {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [
      [
        'Orden',
        'Cliente',
        'Qué entregar',
        'Dirección',
        'Ubicación',
        'Medio de pago',
        'Total',
        'N° de pedido',
      ],
      ...route.stops.map((stop) => [
        String(stop.sequence),
        maskSurname(stop.customerDisplayName),
        stop.detail,
        stop.deliveryAddress,
        stopMapLink(stop),
        stop.paymentExpectation,
        String(stop.totalMinor / 100),
        stop.publicNumber,
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
   * deja de decir cuál es la ruta de mañana. Sólo borradores; una publicada ya salió a la calle.
   */
  async function discard(routeId: string) {
    const response = await apiRequest(`/api/v1/delivery/routes/${routeId}`, { method: 'DELETE' });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    if (selectedRoute?.id === routeId) setSelectedRoute(null);
    await loadRoutes();
    showToast('Propuesta descartada.');
  }

  async function publish(routeId: string) {
    const response = await apiRequest(`/api/v1/delivery/routes/${routeId}/publish`, {
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    await loadRoutes();
    await loadRouteDetail(routeId);
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

  async function move(index: number, direction: -1 | 1) {
    if (!selectedRoute) return;
    const stopIds = selectedRoute.stops.map((stop) => stop.id);
    const target = index + direction;
    if (target < 0 || target >= stopIds.length) return;
    [stopIds[index], stopIds[target]] = [stopIds[target]!, stopIds[index]!];
    const response = await apiRequest(`/api/v1/delivery/routes/${selectedRoute.id}/stops`, {
      body: JSON.stringify({ stopIds }),
      method: 'PUT',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    await loadRouteDetail(selectedRoute.id);
  }

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

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex items-center justify-between">
          <div>
            <p className="dashboard-kicker">Operación</p>
            <h1 className="text-2xl font-semibold text-forest">Rutas de reparto</h1>
          </div>
          {canManage ? (
            <button
              className="button button-secondary"
              onClick={() => setFormOpen((open) => !open)}
              type="button"
            >
              {formOpen ? 'Cancelar' : '+ Proponer ruta'}
            </button>
          ) : null}
        </header>

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
            <label className="field">
              Zona
              <select
                name="geographicZoneId"
                onChange={(event) => setZoneId(event.target.value)}
                value={zoneId}
              >
                <option value="">Toda la ciudad</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Fecha de entrega
              {/*
               * Sólo los días que tienen pedidos, con cuántos entrarían en la hoja. Un campo de
               * fecha libre dejaba proponer rutas para días vacíos, que es lo que venía pasando.
               */}
              {routableDates.length > 0 ? (
                <select name="deliveryDate" required>
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
                {zoneId ? ' y esta zona' : ''}. Un pedido entra en una hoja de ruta cuando está
                confirmado o listo, y su domicilio está geocodificado.
              </p>
            ) : (
              <p className="text-sm text-ink-muted sm:col-span-3">
                {routableDates.reduce(
                  (total, date) => total + date.total - date.geocoded - date.routed,
                  0,
                ) > 0
                  ? `Hay ${String(routableDates.reduce((total, date) => total + date.total - date.geocoded - date.routed, 0))} pedidos por repartir que no entran en ninguna hoja porque su domicilio no está geocodificado.`
                  : 'Todos los pedidos por repartir tienen domicilio geocodificado.'}
              </p>
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
                    <p className="text-xs text-ink-muted">
                      {route.stopCount} paradas ·{' '}
                      {route.status === 'draft'
                        ? 'Borrador'
                        : route.status === 'published'
                          ? 'Publicada'
                          : 'Completada'}
                    </p>
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
                  body="Se arma con los pedidos por repartir de una zona y una fecha, y no sale a la app del repartidor hasta que la publiques."
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
                  {progress && selectedRoute.status === 'published' ? (
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

                  {issuedLink ? (
                    <div className="route-link">
                      <p>
                        Pasale este enlace a quien reparte. Abre la hoja del día en el teléfono, sin
                        clave. Vence el {new Date(issuedLink.expiresAt).toLocaleString('es-AR')}.
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

                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-forest">
                      {formatDay(selectedRoute.deliveryDate)}{' '}
                      {selectedRoute.label ? `· ${selectedRoute.label}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
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
                          {/* El enlace del repartidor. Sólo con la ruta publicada: un borrador se
                              puede reordenar, y una hoja que cambia debajo de quien ya salió es
                              peor que no tener hoja. */}
                          {canPublish && selectedRoute.status === 'published' ? (
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
                      {canPublish && selectedRoute.status === 'draft' ? (
                        <button
                          className="button button-primary"
                          onClick={() =>
                            setPending({ kind: 'publicar', routeId: selectedRoute.id })
                          }
                          type="button"
                        >
                          Publicar
                        </button>
                      ) : null}
                      {canManage && selectedRoute.status === 'draft' ? (
                        <button
                          className="button button-danger"
                          onClick={() =>
                            setPending({ kind: 'descartar', routeId: selectedRoute.id })
                          }
                          type="button"
                        >
                          Descartar propuesta
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="routes-viewer mt-4">
                    <ol className="routes-stops grid content-start gap-2">
                      {selectedRoute.stops.map((stop, index) => (
                        <li className="rounded-xl border border-forest/10 p-3" key={stop.id}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-forest">
                                {stop.sequence}. {stop.customerDisplayName} — {stop.publicNumber}
                              </p>
                              {stop.detail ? (
                                <p className="text-sm font-semibold text-forest">{stop.detail}</p>
                              ) : null}
                              <p className="text-sm text-ink-muted">{stop.deliveryAddress}</p>
                              <p className="text-xs text-ink-muted">
                                {formatMoney(stop.totalMinor, 'ARS')} · {stop.paymentExpectation} ·{' '}
                                {STOP_STATUS_LABELS[stop.status] ?? stop.status}
                              </p>
                            </div>
                            {canManage ? (
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex gap-1">
                                  <button
                                    className="button button-secondary"
                                    disabled={index === 0}
                                    onClick={() => void move(index, -1)}
                                    type="button"
                                  >
                                    ↑
                                  </button>
                                  <button
                                    className="button button-secondary"
                                    disabled={index === selectedRoute.stops.length - 1}
                                    onClick={() => void move(index, 1)}
                                    type="button"
                                  >
                                    ↓
                                  </button>
                                </div>
                              </div>
                            ) : null}
                            {/* Lo que reportó quien está repartiendo. Antes acá decía a qué
                                usuario estaba asignada la parada; ahora no hay usuario, hay una
                                ruta con un enlace, y lo que importa es si esta parada ya se
                                entregó. */}
                            {stop.status === 'delivered' ? (
                              <p className="text-sm font-semibold text-forest">Entregada</p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                      {selectedRoute.stops.length === 0 ? (
                        <p className="text-ink-muted">
                          No hay pedidos por repartir en esa fecha y esa zona.
                        </p>
                      ) : null}
                    </ol>
                    {/* Todas las paradas juntas: es la única forma de ver si el orden propuesto
                      tiene sentido antes de publicarlo. */}
                    {selectedRoute.stops.length > 0 ? (
                      <RouteMap stops={selectedRoute.stops} />
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {pending ? (
        <ConfirmDialog
          confirmLabel={pending.kind === 'publicar' ? 'Publicar la ruta' : 'Descartar'}
          detail={
            pending.kind === 'publicar'
              ? `La hoja pasa a la aplicación de reparto y el repartidor la ve en su teléfono. ${String(selectedRoute?.stops.length ?? 0)} paradas.`
              : 'La propuesta se borra y sus pedidos vuelven a estar disponibles para otra hoja. No afecta a ningún pedido.'
          }
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            const target = pending;
            setPending(null);
            if (target.kind === 'publicar') await publish(target.routeId);
            else await discard(target.routeId);
          }}
          tone={pending.kind === 'descartar' ? 'destructivo' : 'normal'}
          title={pending.kind === 'publicar' ? '¿Publicar esta ruta?' : '¿Descartar la propuesta?'}
        />
      ) : null}
    </DashboardShell>
  );
}
