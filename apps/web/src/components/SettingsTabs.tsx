import { Link, useLocation } from 'react-router-dom';

import { useNarrowViewport } from '../lib/useNarrowViewport.js';

interface SettingsTab {
  href: string;
  label: string;
  /** Sin permiso: la pestaña la ve cualquiera que pueda entrar (p. ej. su propia apariencia). */
  permission?: string;
}

interface SettingsGroup {
  label: string;
  tabs: readonly SettingsTab[];
}

/**
 * El Panel de control: todo lo que se configura o se audita, agrupado por a qué pregunta contesta.
 *
 * Antes esto era "Ajustes" y convivía en el menú lateral con Usuarios, Auditoría y Respaldos, cuatro
 * entradas distintas para cosas que se tocan en el mismo momento y casi nunca: cuando se da de alta
 * a alguien, cuando se conecta un servicio, cuando hay que mirar qué pasó. Cuatro entradas en el
 * menú de todos los días por algo que se usa una vez por mes es espacio mal gastado en lo que más
 * se mira.
 *
 * Los grupos separan por pregunta y no por tecnología: qué y dónde vendemos, quién trabaja acá, con
 * qué nos conectamos, qué queda registrado, y lo que es preferencia de uno mismo. Usuarios va
 * aparte de Integraciones y de Sistema a propósito — dar de alta a alguien es una decisión del
 * negocio, no una configuración técnica ni un registro.
 *
 * Cada sección sigue siendo su propia ruta —una carga real al hacer clic, no un cambio blando de
 * SPA—, que es lo que mantiene intacta la lógica de permisos y de carga de cada página.
 */
const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    label: 'Operación',
    tabs: [
      { href: '/app/ajustes/zonas', label: 'Zonas geográficas', permission: 'sites.read' },
      { href: '/app/ajustes/menu', label: 'Menú personalizado', permission: 'production.read' },
      { href: '/app/ajustes/pagos', label: 'Métodos de pago', permission: 'payments.read' },
    ],
  },
  {
    label: 'Equipo',
    tabs: [{ href: '/app/usuarios', label: 'Usuarios', permission: 'users.read' }],
  },
  {
    label: 'Integraciones',
    tabs: [
      { href: '/app/ajustes/correo', label: 'Correo', permission: 'ai.providers.manage' },
      {
        href: '/app/ajustes/mensajes',
        label: 'Cuentas de WhatsApp',
        permission: 'messaging.accounts.manage',
      },
      { href: '/app/ajustes/chat', label: 'Enlaces de chat', permission: 'chat.links.manage' },
      { href: '/app/ajustes/asistente', label: 'Asistente de la web', permission: 'cms.read' },
      { href: '/app/ia', label: 'IA y plantillas', permission: 'ai.providers.manage' },
    ],
  },
  {
    label: 'Sistema',
    tabs: [
      { href: '/app/auditoria', label: 'Auditoría', permission: 'audit.read' },
      // El permiso no viene con ningún rol: la descarga se lleva los datos de todos los clientes.
      { href: '/app/respaldos', label: 'Respaldos', permission: 'backups.manage' },
    ],
  },
  {
    label: 'Personal',
    // Sin permiso: es la preferencia de uno mismo, no configuración del sistema.
    tabs: [{ href: '/app/ajustes/apariencia', label: 'Apariencia' }],
  },
];

const SETTINGS_TABS: readonly SettingsTab[] = SETTINGS_GROUPS.flatMap((group) => group.tabs);

// The single navbar "Ajustes" entry needs the OR of every tab's permission — a viewer who can
// only reach one of the tabs should still see the entry and land on that tab's own
// "no tenés permiso" bounce-through for the others, rather than the entry disappearing entirely.
export const SETTINGS_TAB_PERMISSIONS: readonly string[] = SETTINGS_TABS.map(
  (tab) => tab.permission,
).filter((permission): permission is string => permission !== undefined);

export function SettingsTabs({ permissions }: { permissions: string[] }) {
  const location = useLocation();
  const narrow = useNarrowViewport();
  // Una pestaña sin permiso la ve cualquiera que haya llegado hasta acá.
  const groups = SETTINGS_GROUPS.map((group) => ({
    ...group,
    tabs: group.tabs.filter((tab) => !tab.permission || permissions.includes(tab.permission)),
    // Un grupo entero sin permiso no deja el título colgado.
  })).filter((group) => group.tabs.length > 0);

  if (groups.flatMap((group) => group.tabs).length <= 1) return null;

  const actual = groups
    .flatMap((group) => group.tabs)
    .find((tab) => location.pathname === tab.href);

  /*
   * A la izquierda en escritorio, plegada en el teléfono.
   *
   * Con trece secciones, la tira horizontal se iba a dos renglones y había que leerla entera para
   * encontrar una. En columna se barre con la vista y los títulos de grupo hacen de índice. En un
   * teléfono una columna de trece renglones es media pantalla antes de ver la configuración que se
   * vino a cambiar, así que ahí se pliega y el resumen dice en cuál estás.
   */
  return (
    <details className="settings-nav" open={!narrow}>
      <summary>
        <span>Panel de control</span>
        <small>{actual?.label ?? 'Elegí una sección'}</small>
      </summary>
      <nav aria-label="Secciones del panel de control">
        {groups.map((group) => (
          <div className="settings-nav-group" key={group.label}>
            <p className="settings-nav-label">{group.label}</p>
            {group.tabs.map((tab) => (
              <Link
                className={location.pathname === tab.href ? 'is-active' : ''}
                key={tab.href}
                to={tab.href}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </details>
  );
}
