import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface RouteMapStop {
  customerDisplayName: string;
  deliveryAddress: string;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  id: string;
  sequence: number;
}

/**
 * La ruta entera en un mapa: cada parada con su número y la línea que las une en orden.
 *
 * El mapa embebido de OpenStreetMap que usan la ficha del pedido y el domicilio del cliente admite
 * un solo marcador, así que no sirve para una hoja de ruta: lo que hay que ver acá es si el orden
 * propuesto tiene sentido —si una parada se fue al otro lado de la ciudad y vuelve— y eso sólo se
 * ve con todas juntas. Leaflet dibuja sobre las mismas capas de OpenStreetMap, sin cuenta ni clave.
 *
 * Las paradas sin domicilio geocodificado no se dibujan (no hay dónde), y se cuentan abajo: una
 * parada que falta en el mapa sin explicación se lee como un error del mapa.
 */
/** La salida o la llegada de la ruta (2026-10-25): el primer y el último punto del mapa. */
export interface RouteMapEnd {
  address: string;
  latitude: number;
  longitude: number;
}

function sameSpot(left: RouteMapEnd, right: RouteMapEnd): boolean {
  return (
    Math.abs(left.latitude - right.latitude) < 1e-5 &&
    Math.abs(left.longitude - right.longitude) < 1e-5
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${String(char.charCodeAt(0))};`);
}

export function RouteMap({
  end = null,
  picking = null,
  start = null,
  stops,
}: {
  end?: RouteMapEnd | null;
  /** "Establecer orden manualmente": los puntos se tocan, y sólo se dibuja lo ya elegido. */
  picking?: { onPick: (stopId: string) => void; order: readonly string[] } | null;
  start?: RouteMapEnd | null;
  stops: readonly RouteMapStop[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  const fittedTo = useRef('');
  // El marcador se dibuja una vez por cambio: lo que llama siempre la última versión, por acá.
  const onPick = useRef(picking?.onPick);
  onPick.current = picking?.onPick;
  const order = picking?.order ?? null;

  const located = useMemo(
    () =>
      stops.filter(
        (stop): stop is RouteMapStop & { deliveryLatitude: number; deliveryLongitude: number } =>
          stop.deliveryLatitude !== null && stop.deliveryLongitude !== null,
      ),
    [stops],
  );
  const missing = stops.length - located.length;

  useEffect(() => {
    if (!container.current || map.current) return;
    map.current = L.map(container.current, { scrollWheelZoom: false }).setView(
      [-38.95, -68.06],
      12,
    );
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    const group = layer.current;
    if (!instance || !group) return;
    group.clearLayers();
    if (located.length === 0 && !start && !end) return;

    // La línea sale de la salida, pasa por las paradas en orden y termina en la llegada.
    const startPoint: [number, number][] = start ? [[start.latitude, start.longitude]] : [];
    const endPoint: [number, number][] = end ? [[end.latitude, end.longitude]] : [];
    const stopPoint = (stop: (typeof located)[number]): [number, number] => [
      stop.deliveryLatitude,
      stop.deliveryLongitude,
    ];
    const points = [...startPoint, ...located.map(stopPoint), ...endPoint];
    // Eligiendo a mano, la línea es el recorrido que se va armando: sale de la salida y crece.
    const line = order
      ? [
          ...startPoint,
          ...order.flatMap((id) => {
            const stop = located.find((candidate) => candidate.id === id);
            return stop ? [stopPoint(stop)] : [];
          }),
        ]
      : points;
    // La línea va primero para que quede por debajo de los números.
    L.polyline(line, { color: '#174c3c', dashArray: '6 6', weight: 2 }).addTo(group);
    for (const stop of located) {
      const position = order ? order.indexOf(stop.id) : stop.sequence - 1;
      const pending = position < 0;
      const text = `${escapeHtml(stop.customerDisplayName)}<br>${escapeHtml(stop.deliveryAddress)}`;
      const marker = L.marker(stopPoint(stop), {
        icon: L.divIcon({
          className: pending ? 'route-pin route-pin-pending' : 'route-pin',
          html: `<span>${pending ? '' : String(position + 1)}</span>`,
          iconAnchor: [13, 13],
          iconSize: [26, 26],
        }),
        // Las que faltan, encima: si dos paradas caen en el mismo edificio, la de abajo aparece
        // al elegir la de arriba.
        zIndexOffset: order && !pending ? -500 : 0,
      }).addTo(group);
      if (!order) marker.bindPopup(text);
      else {
        marker.bindTooltip(text, { direction: 'top', offset: [0, -12] });
        marker
          .getElement()
          ?.setAttribute(
            'aria-label',
            pending
              ? `Elegir a ${stop.customerDisplayName}, ${stop.deliveryAddress}`
              : `Parada ${String(position + 1)}: ${stop.customerDisplayName}`,
          );
        if (pending) marker.on('click', () => onPick.current?.(stop.id));
      }
    }
    // Salida y llegada, con su propio pin; si son el mismo lugar, uno solo.
    const endPin = (point: RouteMapEnd, label: string, title: string) =>
      L.marker([point.latitude, point.longitude], {
        icon: L.divIcon({
          className: 'route-pin route-pin-end',
          html: `<span>${label}</span>`,
          iconAnchor: [17, 13],
          iconSize: [34, 26],
        }),
        zIndexOffset: 1000,
      })
        .bindPopup(`<strong>${title}</strong><br>${escapeHtml(point.address)}`)
        .addTo(group);
    if (start && end && sameSpot(start, end)) endPin(start, 'S/L', 'Salida y llegada');
    else {
      if (start) endPin(start, 'S', 'Salida');
      if (end) endPin(end, 'L', 'Llegada');
    }
    // Encuadrar sólo si cambian los puntos, no el orden: quien acercó el mapa para distinguir dos
    // paradas no puede perder el zoom cada vez que elige una.
    const spots = points.map(String).sort().join('|');
    if (spots !== fittedTo.current) {
      fittedTo.current = spots;
      instance.fitBounds(L.latLngBounds(points).pad(0.2));
    }
  }, [located, order, start, end]);

  return (
    <div className="route-map">
      <div className="route-map-canvas" data-picking={order ? 'true' : undefined} ref={container} />
      {missing > 0 ? (
        <p className="route-map-note">
          {missing === 1
            ? '1 parada no aparece en el mapa: su domicilio no está geocodificado.'
            : `${String(missing)} paradas no aparecen en el mapa: sus domicilios no están geocodificados.`}
        </p>
      ) : null}
    </div>
  );
}
