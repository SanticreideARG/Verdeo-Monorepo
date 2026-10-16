import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import {
  SETTINGS_HOME,
  visibleSettingsGroups,
  type SettingsGroup,
} from '../lib/settingsCatalog.js';
import { useMediaQuery } from '../lib/useNarrowViewport.js';
import { SettingsSheet } from './SettingsSheet.js';
import { SETTINGS_ACCESS_PERMISSION } from './SettingsGate.js';

const LAST_SECTION_KEY = 'verdeo.panel.ultimaSeccion';

/** La última sección del panel que se abrió en escritorio: a donde vuelve "Panel de control". */
export function lastSettingsSection(): string | null {
  try {
    return window.localStorage.getItem(LAST_SECTION_KEY);
  } catch {
    return null;
  }
}

function Chevron({ direction }: { direction: 'down' | 'left' }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      viewBox="0 0 24 24"
      width="16"
    >
      <path
        d={direction === 'left' ? 'm15 6-6 6 6 6' : 'm6 9 6 6 6-6'}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

/**
 * La navegación entre las secciones del Panel de control (el catálogo está en `settingsCatalog`).
 *
 * Cada sección sigue siendo su propia ruta —una carga real al hacer clic, no un cambio blando de
 * SPA—, que es lo que mantiene intacta la lógica de permisos y de carga de cada página.
 *
 * - **Escritorio**: una columna a la izquierda, con los grupos como títulos. Es lo que ya había.
 * - **Pantalla angosta**: un encabezado que se entiende de un vistazo. Antes era un `<details>`
 *   plegado con aspecto de título —"PANEL DE CONTROL · Zonas geográficas", sin flecha ni nada que
 *   dijera que se tocaba—, y adentro una lista de dieciséis renglones que empujaba el contenido. Ahora:
 *   "‹ Panel de control" vuelve al inicio (el índice con tarjetas y buscador), "Cambiar de sección"
 *   abre una hoja desde abajo con todo agrupado, y las secciones del mismo grupo van como fichas para
 *   el salto más común sin abrir nada.
 */
export function SettingsTabs({ permissions }: { permissions: string[] }) {
  const location = useLocation();
  /*
   * Plegado con el MISMO corte que su CSS (74.99rem), y no con el de "angosto" del shell (680px).
   *
   * Eran dos números distintos: entre 681px y el corte del CSS el submenú estaba plegado en el
   * diseño y abierto en el componente. Un solo número, escrito en los dos lugares.
   */
  const stacked = useMediaQuery('(max-width: 74.99rem)');
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  const groups = visibleSettingsGroups(
    permissions,
    permissions.includes(SETTINGS_ACCESS_PERMISSION),
  );
  const sections = groups.flatMap((group) => group.sections);
  const current = sections.find((section) => section.href === location.pathname);

  // Escritorio: se recuerda la sección para que "Panel de control" vuelva a donde se estaba.
  useEffect(() => {
    if (stacked || !current) return;
    try {
      window.localStorage.setItem(LAST_SECTION_KEY, current.href);
    } catch {
      // Sin almacenamiento: simplemente no se recuerda.
    }
  }, [current, stacked]);

  // Al navegar desde la hoja, se cierra sola.
  useEffect(() => setOpen(false), [location.pathname]);

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  // Con una sola sección visible no hay nada que elegir: el menú sería ruido.
  if (sections.length <= 1) return null;

  if (!stacked) {
    return (
      <div className="settings-nav">
        <nav aria-label="Secciones del panel de control">
          {groups.map((group) => (
            <div className="settings-nav-group" key={group.label}>
              <p className="settings-nav-label">{group.label}</p>
              {group.sections.map((section) => (
                <Link
                  aria-current={location.pathname === section.href ? 'page' : undefined}
                  className={location.pathname === section.href ? 'is-active' : ''}
                  key={section.href}
                  to={section.href}
                >
                  {section.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>
    );
  }

  // Las hermanas de la sección actual (su mismo grupo), para saltar sin abrir la hoja.
  const siblings: SettingsGroup | undefined = groups.find((group) =>
    group.sections.some((section) => section.href === location.pathname),
  );

  return (
    <div className="settings-nav settings-nav-mobile">
      <div className="settings-nav-bar">
        <Link className="settings-back" to={SETTINGS_HOME}>
          <Chevron direction="left" />
          Panel de control
        </Link>
        <button
          aria-expanded={open}
          aria-haspopup="dialog"
          className="settings-switch"
          onClick={() => setOpen(true)}
          ref={trigger}
          type="button"
        >
          Cambiar de sección
          <Chevron direction="down" />
        </button>
      </div>
      {siblings && siblings.sections.length > 1 ? (
        <nav aria-label={`Más de ${siblings.label}`} className="settings-chips">
          {siblings.sections.map((section) => (
            <Link
              aria-current={location.pathname === section.href ? 'page' : undefined}
              className={location.pathname === section.href ? 'is-active' : ''}
              key={section.href}
              to={section.href}
            >
              {section.label}
            </Link>
          ))}
        </nav>
      ) : null}
      {open ? (
        <SettingsSheet currentHref={location.pathname} groups={groups} onClose={close} />
      ) : null}
    </div>
  );
}
