import { Link } from 'react-router-dom';

export interface MobileDashboardData {
  /** Si ya llegaron los datos. Antes de eso no se puede afirmar que no haya nada esperando. */
  loaded: boolean;
  pendingOrders: number;
  permissions: readonly string[];
  reminders: readonly { day: string; title: string }[];
  unreadChat: number;
}

interface WaitingItem {
  count: number;
  href: string;
  label: string;
  permission: string;
}

/** Un número grande pierde sentido pasado cierto punto: lo que se hace con 11 y con 40 es lo mismo. */
function short(count: number): string {
  return count > 99 ? '+99' : String(count);
}

/**
 * El tablero cuando la pantalla es un teléfono.
 *
 * Es otra pantalla, no la de escritorio más chica, y la diferencia está en qué se saca. Afuera
 * quedan la tarjeta de sprint —habla del estado del software, no del negocio— y la grilla de
 * módulos, que era navegación por tercera vez después de la barra inferior y el cajón, con dos
 * tarjetas que además apuntaban a anclas muertas.
 *
 * Lo que queda contesta una sola pregunta: qué está esperando por vos, y qué podés hacer ahora.
 * Filas y no tarjetas, porque en el alto de una tarjeta entran tres filas y lo que importa acá es
 * cuántas cosas hay, no que cada una luzca.
 */
export function MobileDashboard({ data }: { data: MobileDashboardData }) {
  const today = new Date().toISOString().slice(0, 10);
  const dueToday = data.reminders.filter((reminder) => reminder.day <= today);

  const waiting: WaitingItem[] = [
    {
      count: data.pendingOrders,
      href: '/app/pedidos/nuevo',
      label: data.pendingOrders === 1 ? 'pedido sin confirmar' : 'pedidos sin confirmar',
      permission: 'orders.confirm',
    },
    {
      count: data.unreadChat,
      href: '/app/chat',
      label: data.unreadChat === 1 ? 'mensaje sin leer' : 'mensajes sin leer',
      permission: 'chat.use',
    },
    {
      count: dueToday.length,
      href: '/app/calendario',
      label: dueToday.length === 1 ? 'recordatorio para hoy' : 'recordatorios para hoy',
      permission: 'calendar.use',
    },
  ].filter((item) => item.count > 0 && data.permissions.includes(item.permission));

  const actions = [
    { href: '/app/pedidos/nuevo', label: 'Tomar un pedido', permission: 'orders.read' },
    { href: '/app/cocina', label: 'Ver cocina', permission: 'production.read' },
    { href: '/app/reparto/rutas', label: 'Ruta de hoy', permission: 'routes.read' },
    { href: '/app/clientes', label: 'Buscar un cliente', permission: 'customers.read' },
  ].filter((action) => data.permissions.includes(action.permission));

  return (
    <div className="mobile-dashboard">
      <section aria-labelledby="esperando-titulo">
        <h2 id="esperando-titulo">Esperando por vos</h2>
        {!data.loaded ? (
          /* "Todo al día" antes de que lleguen los datos es una afirmación falsa sostenida durante
             segundos, y sobre lo único que esta pantalla existe para responder. */
          <p className="mobile-dashboard-clear" aria-live="polite">
            Buscando lo que necesita tu atención…
          </p>
        ) : waiting.length === 0 ? (
          /* El estado vacío se dice una vez y en voz baja. Tres tarjetas con cero no son
             información: son tres formas de ocupar la pantalla para decir que no pasa nada. */
          <p className="mobile-dashboard-clear">Nada pendiente. Todo al día.</p>
        ) : (
          <ul className="mobile-waiting">
            {waiting.map((item) => (
              <li key={item.href}>
                <Link to={item.href}>
                  <strong>{short(item.count)}</strong>
                  <span>{item.label}</span>
                  <svg aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="m9 6 6 6-6 6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {actions.length > 0 ? (
        <section aria-labelledby="acciones-titulo">
          <h2 id="acciones-titulo">Empezar algo</h2>
          <div className="mobile-actions">
            {actions.map((action) => (
              <Link key={action.href} to={action.href}>
                {action.label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
