import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { apiRequest, storeOperatingSiteId, storedOperatingSiteId } from '../lib/api.js';
import { PresenceControl } from './PresenceControl.js';
import { SETTINGS_TAB_PERMISSIONS } from './SettingsTabs.js';
import { RequestProgressBar } from './RequestProgressBar.js';
import { ToastHost } from './ToastHost.js';
import { WeatherWidget } from './WeatherWidget.js';

export interface DashboardProfile {
  permissions: string[];
  session: { expiresAt: string; id: string };
  user: { avatarUrl: string | null; displayName: string; email: string | null; id: string };
}

interface ScopeSite {
  active: boolean;
  displayName: string;
  id: string;
  orderPrefix: string;
  slug: string;
  timezone: string;
}

interface ScopeResponse {
  canSelectGlobal: boolean;
  defaultSiteId: string | null;
  sites: ScopeSite[];
}

const GLOBAL_OPTION = 'global';

type IconName =
  | 'ai'
  | 'chat'
  | 'customers'
  | 'dashboard'
  | 'delivery'
  | 'kitchen'
  | 'menus'
  | 'orders'
  | 'settings'
  | 'users';

interface NavigationItem {
  href: string;
  icon: IconName;
  label: string;
  permission?: string;
  // Any-of: for an item that fans out to several permission-gated sub-pages (e.g. the "Ajustes"
  // tab strip) rather than a single one. Mutually exclusive with `permission` in practice, but
  // both are checked if both are set.
  permissions?: readonly string[];
}

const navigationClusters: Array<{ items: NavigationItem[]; label: string }> = [
  {
    label: 'General',
    items: [
      { href: '/app', icon: 'dashboard', label: 'Dashboard' },
      {
        href: '/app/estadisticas',
        icon: 'dashboard',
        label: 'Estadísticas',
        permission: 'stats.read',
      },
      { href: '/app/ayuda', icon: 'settings', label: 'Ayuda' },
    ],
  },
  {
    label: 'Pedidos',
    items: [
      {
        href: '/app/pedidos/nuevo',
        icon: 'orders',
        label: 'Tomar y confirmar pedidos',
        permission: 'orders.read',
      },
      { href: '/app/pedidos', icon: 'orders', label: 'Ver pedidos', permission: 'orders.read' },
    ],
  },
  {
    label: 'Menús',
    items: [
      {
        href: '/app/menus/nuevo',
        icon: 'menus',
        label: 'Configurar la semana',
        permission: 'production.generate',
      },
      { href: '/app/menus', icon: 'menus', label: 'Ver menús', permission: 'production.read' },
    ],
  },
  // "Operación" used to be one seven-item cluster — everything from Clientes to Mensajes.
  // Unlike the Ajustes settings pages (small, rarely visited, safe to hide behind a tab click),
  // these are the tools staff live in during a shift and need one click away at all times, so
  // splitting into three smaller, independently-collapsible clusters by workflow — instead of
  // consolidating into tabs — is what actually reduces clutter without hiding daily-use pages.
  {
    label: 'Clientes',
    items: [
      {
        href: '/app/clientes',
        icon: 'customers',
        label: 'Clientes',
        permission: 'customers.read',
      },
      {
        href: '/app/encuestas',
        icon: 'customers',
        label: 'Encuestas',
        permission: 'surveys.read',
      },
    ],
  },
  {
    label: 'Producción y reparto',
    items: [
      {
        href: '/app/cocina',
        icon: 'kitchen',
        label: 'Cocina',
        permission: 'production.read',
      },
      { href: '/app/reparto/rutas', icon: 'delivery', label: 'Rutas', permission: 'routes.read' },
      { href: '/app/pagos', icon: 'delivery', label: 'Pagos', permission: 'payments.read' },
    ],
  },
  {
    label: 'Mensajería',
    items: [
      { href: '/app/chat', icon: 'chat', label: 'Chat', permission: 'chat.use' },
      { href: '/app/mensajes', icon: 'chat', label: 'Mensajes', permission: 'messages.read' },
    ],
  },
  {
    label: 'Inteligencia',
    items: [
      {
        href: '/app/ia',
        icon: 'ai',
        label: 'IA y plantillas',
        permission: 'ai.providers.manage',
      },
      {
        href: '/app/ia/workbench',
        icon: 'ai',
        label: 'Workbench de IA',
        permission: 'ai.prompts.manage',
      },
      { href: '/app/contenidos', icon: 'menus', label: 'Contenidos', permission: 'cms.read' },
    ],
  },
  {
    label: 'Administración',
    items: [
      { href: '/app/usuarios', icon: 'users', label: 'Usuarios', permission: 'users.read' },
      // The six settings screens that used to each have their own entry here now live as tabs of
      // one another — see SettingsTabs.tsx. One entry, gated on being able to reach any of them.
      {
        href: '/app/ajustes/zonas',
        icon: 'settings',
        label: 'Ajustes',
        permissions: SETTINGS_TAB_PERMISSIONS,
      },
      { href: '/app/auditoria', icon: 'settings', label: 'Auditoría', permission: 'audit.read' },
    ],
  },
];

const themes = [
  { color: '#3a7d44', label: 'Bosque', value: 'bosque' },
  { color: '#b7d96d', label: 'Natural', value: 'natural' },
  { color: '#3b82f6', label: 'Cielo', value: 'cielo' },
  { color: '#a855f7', label: 'Aurora', value: 'aurora' },
  { color: '#6b7280', label: 'Carbón', value: 'carbon' },
] as const;

type ThemeName = (typeof themes)[number]['value'];

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    ai: (
      <>
        <path d="M9.8 16.1 9 19l-.8-2.9a4.6 4.6 0 0 0-3.2-3.2L2 12l3-.9a4.6 4.6 0 0 0 3.2-3.2L9 5l.8 2.9a4.6 4.6 0 0 0 3.2 3.2l3 .9-3 .9a4.6 4.6 0 0 0-3.2 3.2Z" />
        <path d="m18 3 .4 1.4A2.3 2.3 0 0 0 20 6l1.5.4-1.5.4a2.3 2.3 0 0 0-1.6 1.6L18 10l-.4-1.6A2.3 2.3 0 0 0 16 6.8l-1.5-.4L16 6a2.3 2.3 0 0 0 1.6-1.6L18 3Z" />
      </>
    ),
    chat: (
      <>
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-2.8-.4L3 21l1.6-4.6A8.2 8.2 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z" />
      </>
    ),
    customers: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    delivery: (
      <>
        <path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" />
        <circle cx="7" cy="19" r="2" />
        <circle cx="18" cy="19" r="2" />
      </>
    ),
    kitchen: (
      <>
        <path d="M8 3v7a4 4 0 0 1-4 4V3M6 3v18M15 3v18M15 3c3 0 5 2.2 5 5s-2 5-5 5" />
      </>
    ),
    menus: (
      <>
        <path d="M4 5h16M4 12h16M4 19h10" />
        <circle cx="2" cy="5" r=".5" />
        <circle cx="2" cy="12" r=".5" />
        <circle cx="2" cy="19" r=".5" />
      </>
    ),
    orders: (
      <>
        <path d="M7 3h10v4H7z" />
        <path d="M5 5H3v16h18V5h-2M8 12h8M8 16h5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <path d="M20 8v6M23 11h-6" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className="dashboard-nav-icon"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function isNavigationActive(pathname: string, hash: string, href: string): boolean {
  const [targetPath, targetHash = ''] = href.split('#');
  if (targetPath !== pathname) return false;
  // A plain route (no hash in href) is only active with no hash in the URL either — otherwise
  // e.g. '/app' would read as active while viewing '/app#usuarios'.
  return targetHash ? hash === `#${targetHash}` : hash === '';
}

export function DashboardShell({
  children,
  onLogout,
  profile,
}: {
  children: ReactNode;
  onLogout: () => void;
  profile: DashboardProfile;
}) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.localStorage.getItem('verdeo-sidebar-collapsed') === 'true',
  );
  const [now, setNow] = useState(() => new Date());
  const [scope, setScope] = useState<ScopeResponse | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(() =>
    storedOperatingSiteId(),
  );
  const [theme, setTheme] = useState<ThemeName>(() => {
    const saved = window.localStorage.getItem('verdeo-dashboard-theme');
    return themes.some((item) => item.value === saved) ? (saved as ThemeName) : 'natural';
  });
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(() => {
    try {
      const saved = window.localStorage.getItem('verdeo-nav-collapsed-clusters');
      return new Set(saved ? (JSON.parse(saved) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => setMenuOpen(false), [location.pathname, location.hash]);

  // Client-side navigation does not scroll to an anchor on its own, which the browser used to do
  // for us. Retried on the next frame so the target exists even when the screen just mounted.
  useEffect(() => {
    if (!location.hash) return;
    const target = location.hash.slice(1);
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, location.pathname]);

  useEffect(() => {
    window.localStorage.setItem('verdeo-dashboard-theme', theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('verdeo-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(
      'verdeo-nav-collapsed-clusters',
      JSON.stringify([...collapsedClusters]),
    );
  }, [collapsedClusters]);

  function toggleCluster(label: string) {
    setCollapsedClusters((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  // The stored selection is validated against the server on every mount: a user who lost access to
  // an operation falls back to their default instead of sending a header that would answer 403.
  useEffect(() => {
    let active = true;
    void apiRequest('/api/v1/scope')
      .then(async (response) => {
        if (!response.ok) throw new Error('scope');
        const body = (await response.json()) as ScopeResponse;
        if (!active) return;

        setScope(body);

        const stored = storedOperatingSiteId();
        if (stored && body.sites.some((site) => site.id === stored)) {
          setSelectedSiteId(stored);
          return;
        }
        const fallback = body.canSelectGlobal ? null : body.defaultSiteId;
        storeOperatingSiteId(fallback);
        setSelectedSiteId(fallback);
      })
      .catch(() => {
        if (active) setScope(null);
      });
    return () => {
      active = false;
    };
  }, []);

  function selectScope(value: string) {
    const next = value === GLOBAL_OPTION ? null : value;
    storeOperatingSiteId(next);
    setSelectedSiteId(next);
    // Every open view holds data for the previous operation, so reload rather than leave a screen
    // showing one operation's data under another operation's label.
    window.location.reload();
  }

  const visibleClusters = useMemo(
    () =>
      navigationClusters
        .map((cluster) => ({
          ...cluster,
          items: cluster.items.filter((item) => {
            if (item.permission && !profile.permissions.includes(item.permission)) return false;
            if (item.permissions && !item.permissions.some((p) => profile.permissions.includes(p)))
              return false;
            return true;
          }),
        }))
        .filter((cluster) => cluster.items.length > 0),
    [profile.permissions],
  );

  const dateLabel = new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(now);
  const timeLabel = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(now);
  const initial = profile.user.displayName.trim().slice(0, 1).toLocaleUpperCase('es-AR') || 'V';
  // The selected operation drives the weather city; with no selection (global view or nothing
  // loaded yet) it falls back to the first site the session can reach.
  const weatherCityName =
    scope?.sites.find((site) => site.id === selectedSiteId)?.displayName ??
    scope?.sites[0]?.displayName ??
    null;

  return (
    <div
      className={`dashboard-shell ${sidebarCollapsed ? 'has-collapsed-sidebar' : ''}`}
      data-theme={theme}
    >
      <button
        aria-label="Cerrar navegación"
        className={`dashboard-sidebar-backdrop ${menuOpen ? 'is-visible' : ''}`}
        onClick={() => setMenuOpen(false)}
        type="button"
      />
      <aside className={`dashboard-sidebar ${menuOpen ? 'is-open' : ''}`}>
        <Link className="dashboard-brand" to="/app" aria-label="Verdeo SCA, dashboard">
          <img src="/brand/verdeo-icon.png" alt="" width="38" height="38" />
          <span>
            verdeo<strong>.</strong>
          </span>
          <small>SCA</small>
        </Link>

        <nav className="dashboard-navigation" aria-label="Navegación del dashboard">
          {visibleClusters.map((cluster) => {
            const collapsed = collapsedClusters.has(cluster.label);
            return (
              <section
                className={`dashboard-nav-cluster ${collapsed ? 'is-collapsed' : ''}`}
                key={cluster.label}
              >
                <button
                  aria-expanded={!collapsed}
                  onClick={() => toggleCluster(cluster.label)}
                  type="button"
                >
                  <span>{cluster.label}</span>
                  <svg
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {!collapsed
                  ? cluster.items.map((item) => {
                      const active = isNavigationActive(
                        location.pathname,
                        location.hash,
                        item.href,
                      );
                      return (
                        <Link
                          className={active ? 'is-active' : ''}
                          key={item.label}
                          title={item.label}
                          to={item.href}
                        >
                          <NavIcon name={item.icon} />
                          <span>{item.label}</span>
                          {active ? <i aria-hidden="true" /> : null}
                        </Link>
                      );
                    })
                  : null}
              </section>
            );
          })}
        </nav>

        <button
          className="dashboard-sidebar-collapse"
          onClick={() => setSidebarCollapsed((current) => !current)}
          title={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5 3 12l6 7M3 12h18" />
          </svg>
          <span>Contraer menú</span>
        </button>

        <div className="dashboard-sidebar-footer">
          <Link className="dashboard-sidebar-user" to="/app/perfil">
            {profile.user.avatarUrl ? (
              <img alt="" src={profile.user.avatarUrl} />
            ) : (
              <span>{initial}</span>
            )}
            <div>
              <strong>{profile.user.displayName}</strong>
              <small>Equipo Verdeo</small>
            </div>
          </Link>
          <button aria-label="Cerrar sesión" onClick={onLogout} title="Cerrar sesión" type="button">
            <svg
              aria-hidden="true"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 8V5a2 2 0 0 1 2-2h8v18h-8a2 2 0 0 1-2-2v-3M15 12H3m0 0 3-3m-3 3 3 3"
              />
            </svg>
          </button>
        </div>
      </aside>

      <div className="dashboard-workspace">
        <header className="dashboard-topbar">
          <button
            className="dashboard-menu-button"
            onClick={() => setMenuOpen(true)}
            type="button"
            aria-label="Abrir navegación"
          >
            <svg
              aria-hidden="true"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="dashboard-topbar-welcome">
            <span>Buen día,</span>
            <strong>{profile.user.displayName}</strong>
          </div>
          <div className="dashboard-topbar-tools">
            <PresenceControl enabled={profile.permissions.includes('chat.use')} />
            {scope && (scope.sites.length > 0 || scope.canSelectGlobal) ? (
              <label className="dashboard-scope">
                <span>Ciudad</span>
                <select
                  onChange={(event) => selectScope(event.target.value)}
                  value={selectedSiteId ?? GLOBAL_OPTION}
                >
                  {scope.canSelectGlobal ? (
                    <option value={GLOBAL_OPTION}>Todas las ciudades</option>
                  ) : null}
                  {scope.sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.displayName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="dashboard-themes" aria-label="Tema visual">
              {themes.map((item) => (
                <button
                  aria-label={`Usar tema ${item.label}`}
                  aria-pressed={theme === item.value}
                  key={item.value}
                  onClick={() => setTheme(item.value)}
                  style={{ '--swatch': item.color } as CSSProperties}
                  title={item.label}
                  type="button"
                />
              ))}
            </div>
            <WeatherWidget cityName={weatherCityName} />
            <div className="dashboard-clock">
              <span>{timeLabel}</span>
              <small>{dateLabel}</small>
            </div>
            <Link
              aria-label="Mi perfil"
              className="dashboard-topbar-avatar"
              title="Mi perfil"
              to="/app/perfil"
            >
              {profile.user.avatarUrl ? <img alt="" src={profile.user.avatarUrl} /> : initial}
            </Link>
          </div>
        </header>
        <RequestProgressBar />
        <main className="dashboard-content">{children}</main>
      </div>
      <ToastHost />
    </div>
  );
}
