import { useEffect, useRef, useState } from 'react';

/**
 * Preguntar antes de una acción difícil de deshacer. Un solo diálogo para toda la aplicación.
 *
 * Convivían tres patrones: un modal para cancelar un pedido y para eliminar un cliente, dos toques
 * del mismo botón para descartar una ruta, y nada para publicar una ruta o marcar listo un lote de
 * veintiséis pedidos. El más liviano había quedado en las acciones más difíciles de deshacer.
 *
 * El criterio, en una línea: **si afecta a más de una cosa, o sale del sistema, se pregunta.**
 * Publicar una ruta la manda al teléfono del repartidor; marcar listo un lote cambia el estado de
 * veinte pedidos de una. Ninguna de las dos tiene deshacer.
 *
 * Y el texto dice qué va a pasar y a cuántas cosas —"Vas a marcar listos 26 pedidos de Centro"—,
 * porque un "¿Estás seguro?" no le da a nadie con qué decidir; lo único que hace es agregar un clic.
 */
export function ConfirmDialog({
  confirmLabel,
  detail,
  onCancel,
  onConfirm,
  tone = 'normal',
  title,
}: {
  /** El verbo, no "Aceptar": el botón dice exactamente qué hace. */
  confirmLabel: string;
  /** Qué va a pasar, y sobre cuántas cosas. */
  detail: string;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
  /** `destructivo` pinta el botón de rojo. Reservado para lo que no vuelve. */
  tone?: 'destructivo' | 'normal';
  title: string;
}) {
  const [working, setWorking] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    /*
     * El foco arranca en "Cancelar" y no en el botón que confirma. Quien llegó acá sin querer
     * —dos Enter seguidos sobre un botón— no tiene que poder seguir de largo con un tercero.
     */
    cancelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div aria-label={title} aria-modal="true" className="modal-backdrop" role="dialog">
      <div className="modal-panel">
        <h2 className="text-xl font-semibold text-forest">{title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{detail}</p>
        <div className="form-actions mt-5">
          <button
            className={`button ${tone === 'destructivo' ? 'button-danger' : 'button-primary'}`}
            disabled={working}
            onClick={() => {
              setWorking(true);
              void Promise.resolve(onConfirm()).finally(() => setWorking(false));
            }}
            type="button"
          >
            {working ? 'Un momento…' : confirmLabel}
          </button>
          <button
            className="button button-secondary"
            disabled={working}
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
