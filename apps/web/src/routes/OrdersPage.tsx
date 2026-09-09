import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ColumnPicker } from '../components/ColumnPicker.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { DataTable } from '../components/DataTable.js';
import { apiRequest } from '../lib/api.js';
import {
  errorMessage,
  orderStatusLabel,
  type OrderSummary,
  type WeeklyMenu,
} from '../lib/operations.js';
import { maskSurname, readMaskSurnames, writeMaskSurnames } from '../lib/maskName.js';
import {
  buildOrderColumns,
  ORDER_COLUMNS,
  orderRowTone,
  readStoredColumns,
  writeStoredColumns,
} from '../lib/orderColumns.js';
import { PeriodPicker } from '../components/PeriodPicker.js';
import { currentPeriod, periodsFromMenus, type Period } from '../lib/periods.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

const STATUS_OPTIONS = ['DRAFT', 'CONFIRMED', 'READY', 'DELIVERED', 'CANCELLED'] as const;

/** Lo que se ve sin tocar nada: la fila de un pedido leída de un vistazo. */
const DEFAULT_COLUMNS = ['cliente', 'whatsapp', 'pedido', 'estado', 'total', 'cobrado', 'entrega'];

const COLUMNS_KEY = 'verdeo-orders-columns';

/** "Ver pedidos": browsing the full history, filterable by status, with a CSV export. No creation
 * or transition controls here — those live in "Tomar y confirmar pedidos".
 *
 * `?search=` deep-links a shared order reference here: the search matches its public number, so a
 * chat card can point at one order without a dedicated detail route. */
export function OrdersPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  /*
   * Sobre qué semana se está mirando.
   *
   * `null` es "todavía no sé cuál" y no "todas": la pantalla espera a saber cuál es el período
   * actual antes de pedir pedidos, para no traer el histórico entero y reemplazarlo un instante
   * después. Una cadena vacía sí significa todas, y es una elección explícita.
   */
  const [periods, setPeriods] = useState<Period[]>([]);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
    readStoredColumns(COLUMNS_KEY, DEFAULT_COLUMNS, ORDER_COLUMNS),
  );
  /*
   * Tapar apellidos.
   *
   * Esta pantalla se proyecta y se fotografía, y la planilla que sale de acá se reenvía. El nombre
   * de pila alcanza para saber de quién es cada pedido. Queda guardado porque quien lo necesita lo
   * necesita siempre, no una vez.
   */
  const [maskSurnames, setMaskSurnames] = useState(readMaskSurnames);

  /*
   * Los períodos salen de los menús: todo pedido referencia un menú, así que un ciclo sin menú
   * tampoco tiene pedidos. Se resuelve antes de pedir la primera página, para abrir directamente
   * sobre la semana actual en vez de traer el histórico y reemplazarlo un instante después.
   */
  useEffect(() => {
    if (!profile?.permissions.includes('orders.read')) return;
    let active = true;
    void apiRequest('/api/v1/menus')
      .then(async (response) => {
        if (!active) return;
        // Sin menús no hay períodos que ofrecer: la pantalla cae a "todos", que es lo que hacía
        // siempre, en vez de quedarse sin poder listar nada.
        const list = response.ok
          ? periodsFromMenus(((await response.json()) as { items: WeeklyMenu[] }).items)
          : [];
        if (!active) return;
        setPeriods(list);
        /*
         * Llegar con `?search=` es venir a buscar un pedido puntual —una tarjeta de chat apunta
         * acá con su número—, y ese pedido puede ser de cualquier semana. Abrir filtrado por el
         * período actual haría que el enlace no encontrara nada justamente cuando apunta a algo
         * viejo, que es cuando más se usa.
         *
         * Con `?cycleId=` es lo contrario: se viene desde un pedido a ver el resto de su semana,
         * así que ésa es la semana que hay que abrir, sea o no la actual.
         */
        const requestedCycle = searchParams.get('cycleId');
        if (requestedCycle) setCycleId(requestedCycle);
        else setCycleId(searchParams.get('search') ? '' : (currentPeriod(list)?.id ?? ''));
      })
      .catch(() => {
        if (active) setCycleId('');
      });
    return () => {
      active = false;
    };
  }, [profile?.permissions, searchParams]);

  const load = useCallback(
    async (cursor?: string) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      if (cycleId) params.set('cycleId', cycleId);
      if (cursor) params.set('cursor', cursor);
      const response = await apiRequest(`/api/v1/orders?${params.toString()}`);
      if (!response.ok) {
        setMessage(await errorMessage(response));
        return;
      }
      const body = (await response.json()) as { items: OrderSummary[]; nextCursor: string | null };
      setOrders((current) => (cursor ? [...current, ...body.items] : body.items));
      setNextCursor(body.nextCursor);
    },
    [cycleId, search, status],
  );

  useEffect(() => {
    if (!profile?.permissions.includes('orders.read')) return;
    // `null` es "todavía no sé sobre qué período": esperar evita una primera consulta al histórico.
    if (cycleId === null) return;
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [cycleId, load, profile?.permissions]);

  /**
   * El tilde de cobrado, directo en la lista.
   *
   * Reemplaza a la sección Pagos entera, que nunca registró un movimiento. Actualiza la fila en el
   * lugar en vez de recargar todo: con la lista paginada y filtrada, recargar la devolvería al
   * principio y perdería de vista justo la fila que se acaba de tildar.
   */
  async function togglePaid(order: OrderSummary) {
    const paid = !order.paidAt;
    const response = await apiRequest(`/api/v1/orders/${order.id}/paid`, {
      body: JSON.stringify({ paid }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const updated = (await response.json()) as OrderSummary;
    setOrders((current) =>
      current.map((row) => (row.id === updated.id ? { ...row, paidAt: updated.paidAt } : row)),
    );
  }

  /**
   * Bajar lo que se está mirando, como planilla.
   *
   * La ruta sigue sabiendo devolver CSV —es el formato para llevar los pedidos a otra herramienta—
   * pero el botón no está: acá se baja para abrir, mirar y reenviar, y dos botones para eso era uno
   * de más. Sale con los apellidos tapados si así se está mirando la pantalla: un archivo se
   * reenvía todavía más fácil.
   */
  async function exportOrders() {
    setMessage('');
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search.trim()) params.set('search', search.trim());
    // Se exporta lo que se está mirando, no el histórico entero.
    if (cycleId) params.set('cycleId', cycleId);
    params.set('format', 'xlsx');
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

  if (!profile.permissions.includes('orders.read')) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Ver pedidos</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver pedidos.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="dashboard-kicker">Pedidos</p>
            <h1 className="text-2xl font-semibold text-forest">Ver pedidos</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="field">
              Buscar
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="N° de pedido o cliente"
                value={search}
              />
            </label>
            <PeriodPicker allowAll onChange={setCycleId} periods={periods} value={cycleId ?? ''} />
            <label className="field">
              Estado
              <select onChange={(event) => setStatus(event.target.value)} value={status}>
                <option value="">Todos</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {orderStatusLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <ColumnPicker
              columns={ORDER_COLUMNS}
              extras={[
                {
                  checked: maskSurnames,
                  key: 'ocultar-apellidos',
                  label: 'Ocultar apellidos',
                  onToggle: () => {
                    setMaskSurnames((current) => {
                      writeMaskSurnames(!current);
                      return !current;
                    });
                  },
                },
              ]}
              onChange={(next) => {
                setVisibleColumns(next);
                writeStoredColumns(COLUMNS_KEY, next);
              }}
              visible={visibleColumns}
            />
            <button
              className="button button-secondary"
              onClick={() => void exportOrders()}
              type="button"
            >
              Exportar Excel
            </button>
          </div>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando pedidos…</p>
        ) : (
          <div className="mt-6 grid gap-3">
            {/*
             * Cuántos resultados trajo el filtro.
             *
             * Una lista filtrada sin número no dice si son tres pedidos o trescientos, y con la
             * lista paginada tampoco se puede contar mirando. Cuando quedan más por traer se
             * dice, para que "24" no se lea como "hay veinticuatro y se terminó".
             */}
            <p className="text-sm text-ink-muted" role="status">
              {orders.length === 1 ? '1 pedido' : String(orders.length) + ' pedidos'}
              {nextCursor ? ' cargados · hay más, seguí bajando' : ''}
              {/*
               * El vacío casi nunca es el estado real: es un filtro puesto de más. Sin un botón
               * para deshacerlo, la salida es acordarse de qué se tocó.
               */}
              {orders.length === 0 && (status || search.trim() || cycleId) ? (
                <>
                  {' · '}
                  <button
                    className="link-button"
                    onClick={() => {
                      setStatus('');
                      setSearch('');
                      setCycleId('');
                    }}
                    type="button"
                  >
                    Limpiar los filtros
                  </button>
                </>
              ) : null}
            </p>
            {/*
             * Tabla en escritorio, una tarjeta por pedido en teléfono — lo resuelve DataTable con
             * las mismas columnas, así que elegir qué ver vale para las dos formas.
             */}
            <DataTable
              caption="Pedidos"
              columns={buildOrderColumns({ maskSurnames })
                .filter((column) => visibleColumns.includes(column.key))
                .map(
                  // "Cobrado" se vuelve un tilde que se puede tocar cuando hay permiso para editar.
                  (column) =>
                    column.key === 'cobrado' && profile.permissions.includes('orders.edit')
                      ? {
                          ...column,
                          render: (order: OrderSummary) => (
                            <label className="paid-check">
                              <input
                                aria-label={`Marcar ${maskSurnames ? maskSurname(order.customer.displayName) : order.customer.displayName} como cobrado`}
                                checked={Boolean(order.paidAt)}
                                onChange={() => void togglePaid(order)}
                                type="checkbox"
                              />
                              <span>{order.paidAt ? 'Cobrado' : 'Pendiente'}</span>
                            </label>
                          ),
                        }
                      : column,
                )}
              empty={
                cycleId
                  ? 'No hay pedidos en este período. Probá con "Todos los períodos".'
                  : 'No hay pedidos para este filtro.'
              }
              rowKey={(order) => order.id}
              rowTone={orderRowTone}
              rows={orders}
            />
            {nextCursor ? (
              <button
                className="button button-secondary justify-self-center"
                onClick={() => void load(nextCursor)}
                type="button"
              >
                Cargar más
              </button>
            ) : null}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
