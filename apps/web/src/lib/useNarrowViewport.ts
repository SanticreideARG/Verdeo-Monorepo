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

/**
 * Si una media query se cumple ahora, y se vuelve a calcular cuando cambia.
 *
 * Existe para las decisiones que tienen su propio punto de corte. `useNarrowViewport` fija 680px,
 * el del shell, y el submenú del Panel de control se pliega a otro ancho porque lo que importa ahí
 * es cuánto le queda al contenido, no cuán angosta es la pantalla.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = (event: MediaQueryListEvent) => setMatches(event.matches);
    // Por si cambió entre el primer render y el efecto.
    setMatches(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}
