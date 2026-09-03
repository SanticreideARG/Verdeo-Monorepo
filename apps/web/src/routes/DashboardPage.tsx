import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { DashboardShell, type DashboardProfile } from '../components/DashboardShell.js';
import {
  DEFAULT_LAYOUT,
  resolveWidgets,
  WIDGET_CATALOGUE,
  type WidgetData,
} from '../components/dashboard-widgets.js';
import { BrandLoading } from '../components/BrandLoading.js';
import { apiRequest } from '../lib/api.js';

const modules = [
  {
    accent: 'green',
    cluster: 'Operación',
    copy: 'Identidades, direcciones y preferencias para sostener cada vínculo.',
    href: '/app/clientes',
    permission: 'customers.read',
    title: 'Clientes',
  },
  {
    accent: 'gold',
    cluster: 'Operación',
    copy: 'Registro, confirmación y seguimiento del ciclo comercial semanal.',
    href: '/app/pedidos/nuevo',
    permission: 'orders.read',
    title: 'Pedidos',
  },
  {
    accent: 'blue',
    cluster: 'Operación',
    copy: 'Menús, cantidades consolidadas y formularios listos para cocina.',
    href: '/app/cocina',
    permission: 'production.read',
    title: 'Producción',
  },
  {
    accent: 'violet',
    cluster: 'Logística',
    copy: 'Rutas, entregas y ejecución en calle desde una única vista.',
    href: '#reparto',
    permission: 'routes.read',
    title: 'Reparto',
  },
  {
    accent: 'slate',
    cluster: 'Administración',
    copy: 'Usuarios, roles, permisos y trazabilidad de accesos.',
    href: '#usuarios',
    permission: 'users.read',
    title: 'Administración',
  },
  {
    accent: 'lime',
    cluster: 'Inteligencia',
    copy: 'Proveedores, modelos y plantillas asistidas para acelerar el contenido.',
    href: '/app/ia',
    permission: 'ai.providers.manage',
    title: 'IA y plantillas',
  },
] as const;

function ModuleArrow() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-5-5 5 5-5 5" />
    </svg>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [demand, setDemand] = useState<{ day: string; orderCount: number }[]>([]);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [unreadChat, setUnreadChat] = useState(0);
  const [reminders, setReminders] = useState<{ day: string; title: string }[]>([]);
  const [layout, setLayout] = useState<string[]>([...DEFAULT_LAYOUT]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let active = true;

    const load = async <T,>(path: string, allowed: boolean): Promise<T | null> => {
      if (!allowed) return null;
      const response = await apiRequest(path).catch(() => null);
      if (!response?.ok) return null;
      return (await response.json().catch(() => null)) as T | null;
    };

    void (async () => {
      const permissions = profile.permissions;
      const [stored, orders, chat, calendar] = await Promise.all([
        load<{ widgets: string[] }>('/api/v1/dashboard/layout', true),
        load<{ items: unknown[] }>(
          '/api/v1/orders?status=DRAFT&limit=11',
          permissions.includes('orders.confirm'),
        ),
        load<{ items: { unreadCount: number }[] }>(
          '/api/v1/chat/conversations',
          permissions.includes('chat.use'),
        ),
        load<{ items: { day: string; kind: string; title: string }[] }>(
          `/api/v1/calendar?from=${new Date().toISOString().slice(0, 10)}&to=${new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)}`,
          permissions.includes('calendar.use'),
        ),
      ]);
      if (!active) return;

      // An empty stored array is a real choice — "I want nothing" — and must not be mistaken for
      // "never customised", which is what the default is for.
      if (stored) setLayout(stored.widgets.length > 0 ? stored.widgets : [...DEFAULT_LAYOUT]);
      if (orders) setPendingOrders(orders.items.length);
      if (chat) setUnreadChat(chat.items.reduce((total, item) => total + item.unreadCount, 0));
      if (calendar) setReminders(calendar.items.filter((item) => item.kind === 'reminder'));
    })();

    return () => {
      active = false;
    };
  }, [profile]);

  async function persistLayout(next: string[]) {
    setLayout(next);
    await apiRequest('/api/v1/dashboard/layout', {
      body: JSON.stringify({ widgets: next }),
      method: 'PUT',
    }).catch(() => undefined);
  }

  async function toggleWidget(key: string) {
    await persistLayout(
      layout.includes(key) ? layout.filter((item) => item !== key) : [...layout, key],
    );
  }

  async function moveWidget(key: string, delta: number) {
    const index = layout.indexOf(key);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= layout.length) return;
    const next = [...layout];
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(target, 0, moved);
    await persistLayout(next);
  }

  async function resetLayout() {
    setLayout([...DEFAULT_LAYOUT]);
    await apiRequest('/api/v1/dashboard/layout', { method: 'DELETE' }).catch(() => undefined);
  }

  useEffect(() => {
    if (!profile?.permissions.includes('stats.read')) return;
    let active = true;
    void apiRequest('/api/v1/stats')
      .then(async (response) => {
        if (!response.ok || !active) return;
        const body = (await response.json()) as { byDay: { day: string; orderCount: number }[] };
        // Last two weeks: enough to show a shape, short enough that the line stays readable.
        if (active) setDemand(body.byDay.slice(-14));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [profile?.permissions]);

  useEffect(() => {
    let active = true;
    void apiRequest('/api/v1/me')
      .then(async (response) => {
        if (response.status === 401) {
          await navigate('/login', { replace: true });
          return;
        }
        if (!response.ok) throw new Error('Could not load session');
        const body = (await response.json()) as DashboardProfile;
        if (active) setProfile(body);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function logout() {
    await apiRequest('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    await navigate('/login', { replace: true });
  }

  const availableModules = useMemo(
    () => modules.filter((module) => profile?.permissions.includes(module.permission)),
    [profile?.permissions],
  );

  if (failed) {
    return (
      <main className="grid min-h-screen place-items-center bg-cream px-5 text-center">
        <div>
          <p className="eyebrow">Verdeo SCA</p>
          <h1 className="mt-4 text-3xl font-semibold text-forest">
            No pudimos cargar el dashboard.
          </h1>
          <button className="button button-primary mt-7" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  if (!profile) {
    return <BrandLoading message="Cargando tu espacio…" />;
  }

  const sessionExpiry = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(profile.session.expiresAt));

  // Derived once and handed down, so a widget receives what it needs rather than reaching for it —
  // which is what keeps the catalogue declarable as data.
  const widgetData: WidgetData = {
    demand,
    moduleCount: availableModules.length,
    permissionCount: profile.permissions.length,
    pendingOrders,
    reminders,
    sessionExpiry,
    unreadChat,
  };
  const visibleWidgets = resolveWidgets(layout, profile.permissions);

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-hero">
        <div>
          <p className="dashboard-kicker">Centro operativo</p>
          <h1>
            Todo Verdeo,
            <br />
            en un lugar.
          </h1>
          <p>Una lectura clara de la semana y acceso directo a cada motor del negocio.</p>
        </div>
        <div className="dashboard-sprint-card">
          <span>Sprint actual</span>
          <strong>Motor de pedidos MVP</strong>
          <p>Clientes, menús, pedidos y salida de producción conectados.</p>
          <Link to="/app/pedidos/nuevo">
            Abrir centro de pedidos <ModuleArrow />
          </Link>
        </div>
      </section>

      <section aria-label="Tu tablero" className="widget-board">
        <header className="widget-board-head">
          <h2>Tu tablero</h2>
          <button onClick={() => setEditing((current) => !current)} type="button">
            {editing ? 'Listo' : 'Personalizar'}
          </button>
        </header>

        {editing ? (
          <div className="widget-picker">
            <p>Elegí qué ver. El orden es el de la lista.</p>
            <ul>
              {WIDGET_CATALOGUE.filter(
                (widget) => !widget.permission || profile.permissions.includes(widget.permission),
              ).map((widget) => {
                const position = layout.indexOf(widget.key);
                return (
                  <li key={widget.key}>
                    <label>
                      <input
                        checked={position !== -1}
                        onChange={() => void toggleWidget(widget.key)}
                        type="checkbox"
                      />
                      {widget.label}
                    </label>
                    {position !== -1 ? (
                      <span className="widget-picker-order">
                        <button
                          aria-label={`Subir ${widget.label}`}
                          disabled={position === 0}
                          onClick={() => void moveWidget(widget.key, -1)}
                          type="button"
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`Bajar ${widget.label}`}
                          disabled={position === layout.length - 1}
                          onClick={() => void moveWidget(widget.key, 1)}
                          type="button"
                        >
                          ↓
                        </button>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <button
              className="widget-picker-reset"
              onClick={() => void resetLayout()}
              type="button"
            >
              Volver al tablero por defecto
            </button>
          </div>
        ) : null}

        {visibleWidgets.length === 0 ? (
          <p className="empty-state">
            Tu tablero está vacío. Tocá &quot;Personalizar&quot; para elegir qué ver.
          </p>
        ) : (
          <div className="widget-grid">
            {visibleWidgets.map((widget) => (
              <article className={`widget ${widget.wide ? 'is-wide' : ''}`} key={widget.key}>
                {widget.render(widgetData)}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-section-heading">
        <div>
          <p className="dashboard-kicker">Navegación rápida</p>
          <h2>Tus módulos</h2>
        </div>
        <span>{availableModules.length} accesos disponibles</span>
      </section>

      {availableModules.length > 0 ? (
        <section className="dashboard-module-grid" aria-label="Módulos disponibles">
          {availableModules.map((module, index) => {
            const available = !module.href.startsWith('#');
            return (
              <article
                className={`dashboard-module-card accent-${module.accent}`}
                key={module.title}
              >
                <div className="dashboard-module-card-top">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <small>{module.cluster}</small>
                </div>
                <h3>{module.title}</h3>
                <p>{module.copy}</p>
                {available ? (
                  <Link to={module.href}>
                    Entrar <ModuleArrow />
                  </Link>
                ) : (
                  <span className="dashboard-coming-soon">Próximo sprint</span>
                )}
              </article>
            );
          })}
        </section>
      ) : (
        <section className="dashboard-empty-state">
          <h2>Acceso base habilitado</h2>
          <p>Tu cuenta todavía no tiene módulos operativos asignados.</p>
        </section>
      )}
    </DashboardShell>
  );
}
