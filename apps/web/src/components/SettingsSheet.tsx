import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';

import type { SettingsGroup } from '../lib/settingsCatalog.js';

/**
 * "Cambiar de sección": las secciones del panel agrupadas, en una hoja que sube desde abajo.
 *
 * Es un diálogo de verdad: el foco entra al abrirse, queda adentro hasta cerrarla, Escape y tocar
 * afuera la cierran, y la página de atrás no se desplaza mientras está abierta. Al cerrarla, el que
 * la abrió recupera el foco (eso lo hace quien la usa, que es quien tiene el botón).
 */
export function SettingsSheet({
  currentHref,
  groups,
  onClose,
}: {
  currentHref: string;
  groups: readonly SettingsGroup[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    // El foco no sale de la hoja: Tab en el último vuelve al primero y Mayús+Tab al revés.
    const focusable = [
      ...(dialog.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="settings-sheet-backdrop"
      onClick={onClose}
      onKeyDown={onKeyDown}
      role="presentation"
    >
      <div
        aria-label="Cambiar de sección"
        aria-modal="true"
        className="settings-sheet"
        onClick={(event) => event.stopPropagation()}
        ref={dialog}
        role="dialog"
      >
        <header>
          <h2>Cambiar de sección</h2>
          <button aria-label="Cerrar" onClick={onClose} ref={closeButton} type="button">
            ✕
          </button>
        </header>
        <nav aria-label="Secciones del panel de control">
          {groups.map((group) => (
            <div className="settings-sheet-group" key={group.label}>
              <p className="settings-nav-label">{group.label}</p>
              {group.sections.map((section) => (
                <Link
                  aria-current={currentHref === section.href ? 'page' : undefined}
                  className={currentHref === section.href ? 'is-active' : ''}
                  key={section.href}
                  onClick={onClose}
                  to={section.href}
                >
                  <span>
                    <strong>{section.label}</strong>
                    <small>{section.description}</small>
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
