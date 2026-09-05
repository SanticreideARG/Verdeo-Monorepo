import { useEffect, useRef } from 'react';

/**
 * Qué hacer después de guardar.
 *
 * Existe por un caso real: alguien tocó "Registrar borrador" treinta y seis veces en ochenta
 * segundos porque no le llegaba la confirmación. Cada toque creaba un pedido. Un aviso que se
 * desvanece no alcanza cuando la acción se repite; esto corta el paso y obliga a elegir el
 * siguiente, así que no queda ninguna duda de que lo anterior salió bien.
 *
 * Y elegir sirve además: cargando varios pedidos del mismo cliente, conservar los datos ahorra
 * volver a escribir todo.
 *
 * **Enter borra y arranca de cero**, que es el camino frecuente. Se puede porque lo que había ya
 * está guardado: acá no hay nada que perder. Escape conserva, que es la salida sin consecuencias
 * para quien cierra por reflejo.
 */
export function AfterSaveDialog({
  detail,
  keepLabel,
  newLabel,
  onKeep,
  onNew,
  title,
}: {
  detail?: string | undefined;
  /** Qué se conserva, dicho concretamente: "el mismo cliente y período". */
  keepLabel: string;
  newLabel: string;
  onKeep: () => void;
  onNew: () => void;
  title: string;
}) {
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primary.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onKeep();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKeep]);

  return (
    <div className="crm-import-backdrop">
      <section
        aria-labelledby="after-save-title"
        aria-modal="true"
        className="after-save-dialog"
        role="dialog"
      >
        <h2 id="after-save-title">{title}</h2>
        {detail ? <p>{detail}</p> : null}

        <div className="after-save-actions">
          <button className="button button-primary" onClick={onNew} ref={primary} type="button">
            {newLabel}
          </button>
          <button className="button button-secondary" onClick={onKeep} type="button">
            {keepLabel}
          </button>
        </div>
        <p className="after-save-hint">Enter para empezar de cero · Esc para conservar</p>
      </section>
    </div>
  );
}
