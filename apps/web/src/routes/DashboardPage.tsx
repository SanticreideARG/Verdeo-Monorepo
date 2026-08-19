import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { apiRequest } from '../lib/api.js';

interface SessionProfile {
  permissions: string[];
  session: { expiresAt: string; id: string };
  user: { id: string };
}

const modules = [
  {
    copy: 'Identidades, direcciones y preferencias.',
    permission: 'customers.read',
    title: 'Clientes',
  },
  { copy: 'Seguimiento comercial del ciclo semanal.', permission: 'orders.read', title: 'Pedidos' },
  {
    copy: 'Planificación y cantidades operativas.',
    permission: 'production.read',
    title: 'Producción',
  },
  { copy: 'Rutas, entregas y ejecución en calle.', permission: 'routes.read', title: 'Reparto' },
  { copy: 'Usuarios, roles y permisos.', permission: 'users.read', title: 'Administración' },
] as const;

export function DashboardPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    void apiRequest('/api/v1/me')
      .then(async (response) => {
        if (response.status === 401) {
          await navigate('/login', { replace: true });
          return;
        }
        if (!response.ok) throw new Error('Could not load session');

        const body = (await response.json()) as SessionProfile;
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
    return (
      <main className="grid min-h-screen place-items-center bg-cream" aria-live="polite">
        <p className="font-semibold text-forest">Cargando tu espacio…</p>
      </main>
    );
  }

  const availableModules = modules.filter((module) =>
    profile.permissions.includes(module.permission),
  );

  return (
    <div className="min-h-screen bg-[#eef1e7] text-ink">
      <header className="border-b border-forest/10 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link className="brand" to="/app" aria-label="Verdeo SCA, dashboard">
            verdeo<span>.</span>
          </Link>
          <button className="button button-secondary" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="eyebrow">Dashboard operativo</p>
        <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-forest sm:text-5xl">
              Todo Verdeo, en un lugar.
            </h1>
            <p className="mt-3 text-ink-muted">
              Sesión activa hasta{' '}
              {new Intl.DateTimeFormat('es-AR', {
                dateStyle: 'short',
                timeStyle: 'short',
              }).format(new Date(profile.session.expiresAt))}
              .
            </p>
          </div>
          <span className="w-fit rounded-full bg-forest px-4 py-2 text-xs font-bold uppercase tracking-wider text-white">
            MVP activo
          </span>
        </div>

        {availableModules.length > 0 ? (
          <section
            className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            aria-label="Módulos disponibles"
          >
            {availableModules.map((module) => (
              <article
                className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm"
                key={module.title}
              >
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-lime font-bold text-forest">
                  {module.title.slice(0, 1)}
                </div>
                <h2 className="mt-8 text-2xl font-semibold tracking-tight text-forest">
                  {module.title}
                </h2>
                <p className="mt-2 leading-7 text-ink-muted">{module.copy}</p>
                <p className="mt-7 text-sm font-semibold text-[#718325]">Módulo en construcción</p>
              </article>
            ))}
          </section>
        ) : (
          <section className="mt-10 rounded-3xl border border-forest/10 bg-white p-8">
            <h2 className="text-2xl font-semibold text-forest">Acceso base habilitado</h2>
            <p className="mt-2 max-w-2xl leading-7 text-ink-muted">
              Tu cuenta todavía no tiene módulos operativos asignados. Un administrador puede
              configurar permisos sin recrear el usuario.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
