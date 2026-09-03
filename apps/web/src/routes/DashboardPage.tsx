import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { DashboardShell, type DashboardProfile } from '../components/DashboardShell.js';
import { Sparkline } from '../components/Sparkline.js';
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

      {demand.length > 1 ? (
        <section className="dashboard-trend" aria-label="Demanda reciente">
          <article className="trend-card">
            <Sparkline
              label={`Pedidos por día en los últimos ${demand.length} días`}
              values={demand.map((day) => day.orderCount)}
            />
            <div className="trend-card-body">
              <small>Pedidos por día</small>
              <strong>{demand.reduce((total, day) => total + day.orderCount, 0)}</strong>
              <em>últimos {demand.length} días</em>
            </div>
          </article>
        </section>
      ) : null}

      <section className="dashboard-metrics" aria-label="Resumen de acceso">
        <article>
          <span className="metric-dot metric-dot-green" />
          <div>
            <small>Estado del sistema</small>
            <strong>En línea</strong>
          </div>
          <em>Operativo</em>
        </article>
        <article>
          <span className="metric-symbol">◇</span>
          <div>
            <small>Módulos habilitados</small>
            <strong>{availableModules.length}</strong>
          </div>
          <em>por permisos</em>
        </article>
        <article>
          <span className="metric-symbol">✓</span>
          <div>
            <small>Permisos activos</small>
            <strong>{profile.permissions.length}</strong>
          </div>
          <em>RBAC</em>
        </article>
        <article>
          <span className="metric-symbol">◷</span>
          <div>
            <small>Sesión segura</small>
            <strong>Hasta {sessionExpiry}</strong>
          </div>
          <em>HttpOnly</em>
        </article>
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
