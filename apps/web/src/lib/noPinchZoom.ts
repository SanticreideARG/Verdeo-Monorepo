/**
 * Que pellizcar la pantalla no agrande la aplicación.
 *
 * En un teléfono, pellizcar por accidente (o con dos dedos al scrollear) dejaba la app agrandada y
 * corrida, y había que pellizcar al revés para volver. Se bloquea en tres capas, porque cada
 * navegador respeta una distinta:
 *
 * - el `viewport` de `index.html` (`maximum-scale=1, user-scalable=no`): Android, la app instalada,
 *   y además evita que iPhone haga zoom solo al tocar un campo de texto;
 * - `touch-action: pan-x pan-y` en `styles.css`: Chrome y Safari modernos, también el doble toque;
 * - esto: Safari de iPhone ignora el `viewport` por accesibilidad y hace zoom con sus eventos de
 *   gesto, que acá se cancelan.
 *
 * El mapa de rutas (Leaflet) sí necesita pellizcar para acercarse, así que adentro de él no se
 * cancela nada. Los otros mapas son `iframe` y manejan sus gestos solos.
 */
const MAP_SELECTOR = '.leaflet-container';

function cancelOutsideMaps(event: Event) {
  const target = event.target;
  if (target instanceof Element && target.closest(MAP_SELECTOR)) return;
  event.preventDefault();
}

export function installNoPinchZoom(doc: Document = document): () => void {
  const events = ['gesturestart', 'gesturechange', 'gestureend'] as const;
  for (const name of events) doc.addEventListener(name, cancelOutsideMaps, { passive: false });
  return () => {
    for (const name of events) doc.removeEventListener(name, cancelOutsideMaps);
  };
}
