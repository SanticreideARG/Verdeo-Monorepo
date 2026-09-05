import { useNarrowViewport } from '../lib/useNarrowViewport.js';

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
 */
export function DeskWorkNotice({ can }: { can: string }) {
  const narrow = useNarrowViewport();
  if (!narrow) return null;

  return (
    <p className="desk-work-notice" role="note">
      <strong>Esto se trabaja mejor en una pantalla grande.</strong> Desde el teléfono {can}
    </p>
  );
}
