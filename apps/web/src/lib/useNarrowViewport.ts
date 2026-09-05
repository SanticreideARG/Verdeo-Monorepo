import { useEffect, useState } from 'react';

const NARROW = '(max-width: 680px)';

/**
 * Si la pantalla es angosta.
 *
 * Existe como hook y no como media query porque hay decisiones que el CSS no puede tomar: mover un
 * control de la barra al cajón es cambiarlo de padre, y decidir que el tablero muestre *otra cosa*
 * —no lo mismo más chico— es cambiar qué se renderiza. Esconder con `display: none` lo que igual se
 * arma cuesta el mismo trabajo y deja el nodo en el árbol.
 *
 * El umbral es el mismo que el de los puntos de quiebre del shell, a propósito: dos números
 * distintos para "angosto" terminan discrepando en el medio.
 */
export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);

  useEffect(() => {
    const query = window.matchMedia(NARROW);
    const update = (event: MediaQueryListEvent) => setNarrow(event.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return narrow;
}
