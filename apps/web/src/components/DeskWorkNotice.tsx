import { useState } from 'react';

import { useNarrowViewport } from '../lib/useNarrowViewport.js';

const DISMISSED_KEY = 'verdeo.avisoPantallaGrande';

function wasDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY) === 'si';
  } catch {
    return false;
  }
}

/**
 * Aviso para las pantallas que son trabajo de escritorio.
 *
 * Armar un menú semanal, editar la landing o repartir permisos son tareas de sesión larga con mucho
 * estado en pantalla. Meterlas en un teléfono no las vuelve accesibles: las vuelve peligrosas,
 * porque se toca lo que no se quería tocar.
 *
 * El aviso avisa, no bloquea. Quien necesite hacerlo desde el teléfono va a poder — sabiendo que va
 * a costar. Bloquear sería decidir por alguien que quizás está en la calle y sin otra opción, y
 * dejar un formulario de doce campos apretado sin decir nada sería peor todavía.
 *
 * Es una línea y se descarta: era un bloque de tres renglones al principio de cada pantalla, casi tan
 * alto como la sección que acompañaba, y se leía una vez. Descartado, no vuelve a aparecer mientras
 * dure la sesión.
 */
export function DeskWorkNotice({ can }: { can: string }) {
  const narrow = useNarrowViewport();
  const [dismissed, setDismissed] = useState(wasDismissed);
  if (!narrow || dismissed) return null;

  return (
    <p className="desk-work-notice" role="note">
      <span>
        <strong>Mejor en una pantalla grande.</strong> Desde el teléfono {can}
      </span>
      <button
        aria-label="Entendido, no mostrar más"
        onClick={() => {
          setDismissed(true);
          try {
            window.sessionStorage.setItem(DISMISSED_KEY, 'si');
          } catch {
            // Sin almacenamiento: se oculta igual hasta recargar.
          }
        }}
        type="button"
      >
        ✕
      </button>
    </p>
  );
}
