import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

export interface PublicMenuLink {
  href: string;
  label: string;
}

/**
 * El menú del sitio público en pantallas donde la barra no alcanza.
 *
 * Hasta ahora los enlaces simplemente desaparecían: las secciones por debajo de 1024px y las de
 * cuenta por debajo de 640px, dejando un teléfono con "Hacer un pedido" y nada más. Un enlace que se
 * esconde sin dar otra puerta no está oculto, está ausente.
 *
 * "Hacer un pedido" queda afuera del menú a propósito: es la acción que la página existe para
 * provocar, y esconderla detrás de un toque extra para ganar lugar sería ahorrar en lo único que no
 * conviene.
 */
export function PublicMenu({
  account,
  sections,
}: {
  account: readonly PublicMenuLink[];
  sections: readonly PublicMenuLink[];
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const location = useLocation();

  // Navegar y quedarse con el menú abierto encima de lo que se acaba de abrir es desorientador.
  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="public-menu" ref={container}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={open ? 'Cerrar el menú' : 'Abrir el menú'}
        className="public-menu-trigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span aria-hidden="true" className={open ? 'is-open' : undefined}>
          <i />
          <i />
          <i />
        </span>
      </button>

      {open ? (
        <div className="public-menu-panel" id={panelId}>
          {sections.length > 0 ? (
            <nav aria-label="Secciones">
              <p className="public-menu-heading">El sitio</p>
              {sections.map((link) => (
                // Anclas dentro de la misma página: `a` y no `Link`, para que el navegador haga el
                // desplazamiento nativo en vez de remontar la ruta.
                <a href={link.href} key={link.href} onClick={() => setOpen(false)}>
                  {link.label}
                </a>
              ))}
            </nav>
          ) : null}

          <nav aria-label="Tu cuenta">
            <p className="public-menu-heading">Tu pedido</p>
            {account.map((link) => (
              <Link key={link.href} to={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
