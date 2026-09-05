import { AppearanceControls, type ThemeOption } from '../components/AppearanceMenu.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { SettingsTabs } from '../components/SettingsTabs.js';
import { useAppearance } from '../lib/appearanceContext.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

/**
 * El catálogo de temas, repetido acá por una razón fea pero cierta: el del shell no está exportado,
 * y exportarlo obligaría a importar el shell desde su propio hijo. Si se agrega un tema hay que
 * tocar los dos lugares — el shell tiene la última palabra sobre cuál se aplica.
 */
const THEMES: readonly ThemeOption[] = [
  { color: '#b7d96d', label: 'Natural', tone: 'claro', value: 'natural' },
  { color: '#3b82f6', label: 'Cielo', tone: 'claro', value: 'cielo' },
  { color: '#b47834', label: 'Arena', tone: 'claro', value: 'arena' },
  { color: '#111111', label: 'Papel', tone: 'claro', value: 'papel' },
  { color: '#3a7d44', label: 'Bosque', tone: 'oscuro', value: 'bosque' },
  { color: '#a855f7', label: 'Aurora', tone: 'oscuro', value: 'aurora' },
  { color: '#6b7280', label: 'Carbón', tone: 'oscuro', value: 'carbon' },
  { color: '#d69e5c', label: 'Cacao', tone: 'oscuro', value: 'cacao' },
  { color: '#2db2ac', label: 'Marea', tone: 'oscuro', value: 'marea' },
];

function AppearanceBody() {
  const appearance = useAppearance();

  return (
    <div className="appearance-settings">
      <AppearanceControls
        font={appearance.font}
        onFont={appearance.setFont}
        onScale={appearance.setScale}
        onTheme={appearance.setTheme}
        scale={appearance.scale}
        theme={appearance.theme}
        themes={THEMES}
      />
    </div>
  );
}

/**
 * Apariencia en Ajustes: los mismos controles que el botón "Aa" de la barra, desplegados.
 *
 * Existe porque el desplegable hay que descubrirlo, y porque con lugar de sobra los temas pueden
 * mostrar su nombre al lado del color en vez de ser nueve círculos que hay que probar uno por uno.
 * No guarda nada por su cuenta: usa el mismo estado del shell, que ya persiste en la cuenta.
 */
export function AppearanceSettingsPage() {
  const { failed, logout, profile } = useDashboardProfile();

  if (failed) return <DashboardFailed label="los ajustes de apariencia" />;
  if (!profile) return <DashboardLoading />;

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <SettingsTabs permissions={profile.permissions} />
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Ajustes</p>
          <h1 className="text-2xl font-semibold text-forest">Apariencia</h1>
          <p className="mt-2 text-ink-muted">
            Se guarda en tu cuenta, así que te sigue a cualquier dispositivo donde entres. El tamaño
            del texto también alcanza a las pantallas públicas.
          </p>
        </header>
        <AppearanceBody />
      </section>
    </DashboardShell>
  );
}
