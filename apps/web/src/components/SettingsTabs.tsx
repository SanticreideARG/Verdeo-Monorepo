import { Link, useLocation } from 'react-router-dom';

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
 * Las pantallas chicas de configuración, agrupadas por a qué pregunta contestan.
 *
 * Eran nueve pestañas en una tira plana, ordenadas por cuándo se fueron construyendo: "Zonas
 * geográficas" al lado de "Apariencia" al lado de "Correo". Con nueve, encontrar la que se busca
 * era leerlas todas. Los tres grupos separan lo que se cambia cuando cambia el negocio, lo que se
 * toca una vez al conectar un servicio de afuera, y lo que es preferencia de uno mismo.
 *
 * Cada pestaña sigue siendo su propia ruta —una carga real al hacer clic, no un cambio blando de
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
  // Una pestaña sin permiso la ve cualquiera que haya llegado hasta acá.
  const groups = SETTINGS_GROUPS.map((group) => ({
    ...group,
    tabs: group.tabs.filter((tab) => !tab.permission || permissions.includes(tab.permission)),
    // Un grupo entero sin permiso no deja el título colgado.
  })).filter((group) => group.tabs.length > 0);

  if (groups.flatMap((group) => group.tabs).length <= 1) return null;

  return (
    <nav aria-label="Secciones de Ajustes" className="settings-tabs">
      {groups.map((group) => (
        <div className="settings-tabs-group" key={group.label}>
          <p className="settings-tabs-label">{group.label}</p>
          <div className="settings-tabs-row">
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
        </div>
      ))}
    </nav>
  );
}
