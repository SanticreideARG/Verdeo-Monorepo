import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

export interface ActionMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  tone?: 'danger' | undefined;
}

/** Alto aproximado de una opción, para decidir si el menú abre hacia arriba. */
const ITEM_HEIGHT = 40;

/**
 * El menú "⋯" de una fila: las acciones que no son el paso que sigue.
 *
 * Se dibuja fuera de la tabla, con posición fija y montado en `.dashboard-shell`. Dentro de la
 * celda lo recortaría el contenedor con scroll de la tabla, y los colores del tema viven en
 * `.dashboard-shell` (la misma razón por la que el chat y el estado de servidores se montan ahí).
 * Si no entra hacia abajo, abre hacia arriba: en la última fila de la pantalla quedaría cortado.
 *
 * Teclado: Enter/Espacio abre y enfoca la primera opción, las flechas recorren, Escape cierra y
 * devuelve el foco al botón, Tab cierra.
 */
export function ActionMenu({ items, label }: { items: readonly ActionMenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTarget(triggerRef.current?.closest<HTMLElement>('.dashboard-shell') ?? null);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const height = items.length * ITEM_HEIGHT + 12;
    const right = Math.max(8, window.innerWidth - rect.right);
    setStyle(
      rect.bottom + height + 8 > window.innerHeight && rect.top > height
        ? { bottom: window.innerHeight - rect.top + 4, right }
        : { right, top: rect.bottom + 4 },
    );
  }, [items.length, open]);

  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const close = () => setOpen(false);
    const onPointerDown = (event: MouseEvent) => {
      const node = event.target as Node;
      if (!menuRef.current?.contains(node) && !triggerRef.current?.contains(node)) close();
    };
    document.addEventListener('mousedown', onPointerDown);
    // Con posición fija, al desplazarse la página el menú quedaría flotando lejos de su fila.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const options = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
    ];
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      options[(index + step + options.length) % options.length]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  const menu = open ? (
    <div
      aria-label={label}
      className="action-menu"
      onKeyDown={onMenuKeyDown}
      ref={menuRef}
      role="menu"
      style={style}
    >
      {items.map((item) => (
        <button
          className={`action-menu-item${item.tone === 'danger' ? ' is-danger' : ''}`}
          key={item.key}
          onClick={() => {
            setOpen(false);
            item.onSelect();
          }}
          role="menuitem"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="button button-secondary action-menu-trigger"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        title={label}
        type="button"
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {menu ? (target ? createPortal(menu, target) : menu) : null}
    </>
  );
}
