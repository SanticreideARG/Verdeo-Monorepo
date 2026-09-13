import { useSyncExternalStore } from 'react';

import { storedOperatingSiteId, subscribeToOperatingSite } from './api.js';

/**
 * La ciudad elegida, como estado de React.
 *
 * Existe para una sola cosa: que cambiar de ciudad no recargue la aplicación entera. La razón por
 * la que antes recargaba sigue siendo válida —cada pantalla abierta tiene datos de la ciudad
 * anterior, y mostrarlos bajo el rótulo de otra es peor que perderlos—, así que la pantalla en
 * curso se vuelve a montar (ver el `key` en `App.tsx`). Lo que se ahorra es todo lo demás: volver a
 * bajar la aplicación, revalidar la sesión y la pantalla en blanco del medio.
 *
 * `useSyncExternalStore` y no un contexto porque la fuente ya existe y está fuera de React: es
 * `localStorage`, que también leen los módulos que arman las peticiones.
 */
export function useOperatingSiteId(): string | null {
  return useSyncExternalStore(
    subscribeToOperatingSite,
    storedOperatingSiteId,
    // En el servidor no hay dónde guardar una preferencia; la vista global es el valor honesto.
    () => null,
  );
}
