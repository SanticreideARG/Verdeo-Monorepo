import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Un botón que hace algo que tarda, y que lo dice mientras tanto.
 *
 * Algunas pantallas ya lo hacían a mano —marcar un lote se deshabilita y dice "Marcando…", cerrar
 * períodos dice "Cerrando…"— y la mayoría no cambiaba nada: guardar un pedido, publicar, exportar.
 * Con la base en otro continente una exportación de mil pedidos tarda, y sin señal se vuelve a
 * tocar; en varias acciones eso son dos operaciones, no una.
 *
 * Deshabilitar mientras corre no es sólo cortesía: es la única defensa contra el doble clic, que
 * ninguna de estas rutas tiene idempotencia para absorber.
 *
 * El texto de espera se pasa aparte y en gerundio, porque el botón dice el verbo y la espera dice
 * el mismo verbo en curso: "Publicar" → "Publicando…". Sin él se usa uno genérico.
 */
export function ActionButton({
  children,
  className = 'button button-primary',
  disabled,
  onClick,
  pendingLabel = 'Un momento…',
  title,
  type = 'button',
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  /** Puede devolver una promesa o no: el botón espera la que haya. */
  onClick: () => unknown;
  pendingLabel?: string;
  title?: string;
  type?: 'button' | 'submit';
}) {
  const [working, setWorking] = useState(false);
  /*
   * El botón puede desmontarse mientras corre —la acción recarga la lista y la fila desaparece— y
   * escribir estado sobre un componente que ya no está tira un aviso en consola por cada uso.
   */
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  return (
    <button
      className={className}
      disabled={disabled ?? working}
      onClick={() => {
        if (working) return;
        setWorking(true);
        void Promise.resolve(onClick()).finally(() => {
          if (mounted.current) setWorking(false);
        });
      }}
      title={title}
      type={type}
    >
      {working ? pendingLabel : children}
    </button>
  );
}
