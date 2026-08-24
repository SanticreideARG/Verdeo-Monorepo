import { Link } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface SettingsCard {
  description: string;
  href: string;
  permission: string;
  title: string;
}

interface SettingsGroup {
  cards: SettingsCard[];
  title: string;
}

const GROUPS: SettingsGroup[] = [
  {
    cards: [
      {
        description: 'Teléfono, cobertura, responsable y token de repartidor por zona.',
        href: '/app/ajustes/zonas',
        permission: 'sites.read',
        title: 'Zonas geográficas',
      },
      {
        description: 'Si Intuitivo puede ofrecerse, por ciudad.',
        href: '/app/ajustes/menu',
        permission: 'production.read',
        title: 'Menú personalizado',
      },
    ],
    title: 'Identidad del negocio',
  },
  {
    cards: [
      {
        description: 'Números de WhatsApp conectados y sus tokens.',
        href: '/app/ajustes/mensajes',
        permission: 'messaging.accounts.manage',
        title: 'Cuentas de WhatsApp',
      },
      {
        description: 'Proveedores de IA, claves y modelos habilitados.',
        href: '/app/ia',
        permission: 'ai.providers.manage',
        title: 'Proveedores de IA',
      },
      {
        description: 'Prompts por tarea, versionado y prueba en vivo.',
        href: '/app/ia/workbench',
        permission: 'ai.prompts.manage',
        title: 'Workbench de IA',
      },
    ],
    title: 'Integraciones',
  },
  {
    cards: [
      {
        description: 'Ver usuarios, roles, permisos y tokens de acceso.',
        href: '/app/usuarios',
        permission: 'users.read',
        title: 'Usuarios',
      },
      {
        description: 'Quién puede chatear con quién en el chat interno.',
        href: '/app/ajustes/chat',
        permission: 'chat.links.manage',
        title: 'Enlaces de chat',
      },
    ],
    title: 'Acceso',
  },
  {
    cards: [
      {
        description: 'Quién hizo qué, cuándo — con filtros.',
        href: '/app/auditoria',
        permission: 'audit.read',
        title: 'Auditoría',
      },
    ],
    title: 'Trazabilidad',
  },
];

/** Índice de todo lo que ya es "un ajuste" en la aplicación pero vivía repartido en pantallas
 * sueltas sin un punto de entrada común. No agrega ninguna configuración nueva — cada tarjeta
 * enlaza a una pantalla que ya existe, filtrada por lo que el usuario puede ver. */
export function SettingsHubPage() {
  const { failed, logout, profile } = useDashboardProfile();

  if (failed) return <DashboardFailed label="los ajustes" />;
  if (!profile) return <DashboardLoading />;

  const visibleGroups = GROUPS.map((group) => ({
    ...group,
    cards: group.cards.filter((card) => profile.permissions.includes(card.permission)),
  })).filter((group) => group.cards.length > 0);

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Administración</p>
          <h1 className="text-2xl font-semibold text-forest">Ajustes</h1>
        </header>

        {visibleGroups.length === 0 ? (
          <p className="mt-6 text-ink-muted">Tu usuario no tiene acceso a ningún ajuste.</p>
        ) : (
          <div className="mt-6 grid gap-8">
            {visibleGroups.map((group) => (
              <div key={group.title}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                  {group.title}
                </h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {group.cards.map((card) => (
                    <Link
                      className="rounded-2xl border border-forest/10 bg-[var(--db-surface)] p-5 transition hover:border-forest/30"
                      key={card.href}
                      to={card.href}
                    >
                      <p className="font-semibold text-forest">{card.title}</p>
                      <p className="mt-1 text-sm text-ink-muted">{card.description}</p>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
