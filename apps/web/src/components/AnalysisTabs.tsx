import { Link, useLocation } from 'react-router-dom';

interface AnalysisTab {
  href: string;
  label: string;
  permission: string;
}

/**
 * Las pantallas con las que se mira el negocio, en una tira de pestañas.
 *
 * Encuestas vivía bajo "Clientes", al lado de la ficha de cada persona, y se usa para lo contrario:
 * no para atender a alguien puntual sino para leer qué dice el conjunto. Junto a Estadísticas se
 * encuentra cuando se la busca, que es cuando se está mirando cómo viene la semana.
 *
 * Cada pestaña sigue siendo su propia ruta, así la lógica de permisos y de carga no cambia.
 */
const ANALYSIS_TABS: readonly AnalysisTab[] = [
  { href: '/app/estadisticas', label: 'Estadísticas', permission: 'stats.read' },
  { href: '/app/encuestas', label: 'Encuestas', permission: 'surveys.read' },
];

/** La entrada única del menú necesita la unión de los permisos: quien sólo llega a una de las dos
 * igual tiene que ver la entrada. */
export const ANALYSIS_TAB_PERMISSIONS: readonly string[] = ANALYSIS_TABS.map(
  (tab) => tab.permission,
);

export function AnalysisTabs({ permissions }: { permissions: readonly string[] }) {
  const location = useLocation();
  const tabs = ANALYSIS_TABS.filter((tab) => permissions.includes(tab.permission));

  // Con una sola pestaña no hay nada que elegir: la tira sería un título repetido.
  if (tabs.length <= 1) return null;

  return (
    <nav aria-label="Secciones de Estadísticas" className="settings-tabs">
      <div className="settings-tabs-group">
        <div className="settings-tabs-row">
          {tabs.map((tab) => (
            <Link
              className={location.pathname.startsWith(tab.href) ? 'is-active' : ''}
              key={tab.href}
              to={tab.href}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
