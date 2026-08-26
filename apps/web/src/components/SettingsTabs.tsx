import { Link, useLocation } from 'react-router-dom';

interface SettingsTab {
  href: string;
  label: string;
  permission: string;
}

// The six lightweight settings screens that used to each claim their own "Administración" navbar
// slot. They're small, related, and rarely all needed at once, so they're consolidated behind one
// tab strip instead — every tab is still its own route (a real page load on click, not a soft
// SPA switch), which keeps each page's existing loading/permission logic untouched.
const SETTINGS_TABS: readonly SettingsTab[] = [
  { href: '/app/ajustes/zonas', label: 'Zonas geográficas', permission: 'sites.read' },
  { href: '/app/ajustes/menu', label: 'Menú personalizado', permission: 'production.read' },
  { href: '/app/ajustes/etiquetas', label: 'Etiquetas', permission: 'production.read' },
  { href: '/app/ajustes/pagos', label: 'Métodos de pago', permission: 'payments.read' },
  { href: '/app/ajustes/chat', label: 'Enlaces de chat', permission: 'chat.links.manage' },
  {
    href: '/app/ajustes/mensajes',
    label: 'Cuentas de WhatsApp',
    permission: 'messaging.accounts.manage',
  },
];

// The single navbar "Ajustes" entry needs the OR of every tab's permission — a viewer who can
// only reach one of the six tabs should still see the entry and land on that tab's own
// "no tenés permiso" bounce-through for the others, rather than the entry disappearing entirely.
export const SETTINGS_TAB_PERMISSIONS: readonly string[] = SETTINGS_TABS.map(
  (tab) => tab.permission,
);

export function SettingsTabs({ permissions }: { permissions: string[] }) {
  const location = useLocation();
  const visible = SETTINGS_TABS.filter((tab) => permissions.includes(tab.permission));
  if (visible.length <= 1) return null;

  return (
    <nav aria-label="Secciones de Ajustes" className="settings-tabs">
      {visible.map((tab) => (
        <Link
          className={location.pathname === tab.href ? 'is-active' : ''}
          key={tab.href}
          to={tab.href}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
