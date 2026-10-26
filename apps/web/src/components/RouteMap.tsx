import { useEffect, useRef } from 'react';
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
  start = null,
  stops,
}: {
  end?: RouteMapEnd | null;
  start?: RouteMapEnd | null;
  stops: readonly RouteMapStop[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  const located = stops.filter(
    (stop): stop is RouteMapStop & { deliveryLatitude: number; deliveryLongitude: number } =>
      stop.deliveryLatitude !== null && stop.deliveryLongitude !== null,
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
    const points: [number, number][] = [
      ...(start ? [[start.latitude, start.longitude] as [number, number]] : []),
      ...located.map((stop): [number, number] => [stop.deliveryLatitude, stop.deliveryLongitude]),
      ...(end ? [[end.latitude, end.longitude] as [number, number]] : []),
    ];
    // La línea va primero para que quede por debajo de los números.
    L.polyline(points, { color: '#174c3c', dashArray: '6 6', weight: 2 }).addTo(group);
    for (const stop of located) {
      L.marker([stop.deliveryLatitude, stop.deliveryLongitude], {
        icon: L.divIcon({
          className: 'route-pin',
          html: `<span>${String(stop.sequence)}</span>`,
          iconAnchor: [13, 13],
          iconSize: [26, 26],
        }),
      })
        .bindPopup(`<strong>${stop.customerDisplayName}</strong><br>${stop.deliveryAddress}`)
        .addTo(group);
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
    instance.fitBounds(L.latLngBounds(points).pad(0.2));
  }, [located, start, end]);

  return (
    <div className="route-map">
      <div className="route-map-canvas" ref={container} />
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
