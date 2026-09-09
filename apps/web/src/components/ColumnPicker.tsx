import { useEffect, useRef, useState } from 'react';

export interface ColumnChoice {
  key: string;
  label: string;
  /** No se puede apagar: sin ella la fila no se sabe de quién es, o no se puede operar. */
  locked?: boolean;
}

/**
 * Elegir qué columnas se ven.
 *
 * La elección se guarda por persona en el navegador y no en el servidor: es una preferencia de
 * lectura de esta pantalla, no un dato del negocio, y guardarla en la cuenta significaría una tabla,
 * un endpoint y una migración para algo que se resuelve con una línea. Si mañana hace falta que
 * viaje entre dispositivos, se mueve — hoy no lo justifica.
 */
export function ColumnPicker({
  columns,
  extras,
  onChange,
  visible,
}: {
  columns: readonly ColumnChoice[];
  /*
   * Otras opciones de "qué ver en la tabla" que no son una columna, como tapar los apellidos.
   *
   * Van acá y no sueltas en la barra porque son la misma decisión —qué muestra esta tabla— y la
   * barra ya tenía cuatro controles antes de llegar a los botones.
   */
  extras?: readonly { checked: boolean; key: string; label: string; onToggle: () => void }[];
  onChange: (next: string[]) => void;
  visible: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

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

  function toggle(key: string) {
    const next = visible.includes(key)
      ? visible.filter((item) => item !== key)
      : // Se guarda en el orden del catálogo y no en el de los clics: si no, las columnas bailan de
        // lugar cada vez que se apaga y se vuelve a encender una.
        columns
          .filter((column) => column.key === key || visible.includes(column.key))
          .map((column) => column.key);
    onChange(next);
  }

  return (
    <div className="column-picker" ref={container}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="button button-secondary"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        Columnas ({visible.length})
      </button>

      {open ? (
        <div aria-label="Elegir columnas" className="column-picker-panel" role="dialog">
          <p>Qué ver en la tabla</p>
          {columns.map((column) => (
            <label key={column.key}>
              <input
                checked={visible.includes(column.key)}
                /* Las bloqueadas y la última encendida no se pueden apagar: una tabla sin columnas
                   no es una tabla vacía, es una pantalla rota de la que no se sale sin saber qué
                   pasó, y una fila sin nombre no dice de quién es el pedido. */
                disabled={column.locked || (visible.length === 1 && visible.includes(column.key))}
                onChange={() => toggle(column.key)}
                type="checkbox"
              />
              {column.label}
            </label>
          ))}
          {extras && extras.length > 0 ? (
            <>
              <hr />
              {extras.map((extra) => (
                <label key={extra.key}>
                  <input checked={extra.checked} onChange={extra.onToggle} type="checkbox" />
                  {extra.label}
                </label>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
