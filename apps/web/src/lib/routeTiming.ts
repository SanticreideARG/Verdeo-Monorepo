/**
 * Los tiempos de una ruta y su recorrido en Google Maps (2026-10-24).
 *
 * Los tiempos son una estimación (`estimateRouteMinutes` de @verdeo/routing): distancia en línea
 * recta estirada por un factor de calles, a velocidad de ciudad, más unos minutos por parada. Sin
 * tránsito real: sirve para armar las franjas, no para prometer la hora exacta. Para eso está el
 * recorrido en Google Maps, que calcula con tránsito.
 */
import { estimateRouteMinutes, ROUTE_ESTIMATE, type RoutingPoint } from '@verdeo/routing';

export interface TimedStop {
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  id: string;
}

export interface RouteTiming {
  /** Por parada: minutos desde la anterior (o desde la salida) y desde la salida. */
  byStop: Map<string, { fromStart: number; leg: number }>;
  /** Desde la salida hasta la última parada (y la vuelta, si hay llegada). */
  totalMinutes: number | null;
}

const pointOf = (stop: TimedStop): RoutingPoint | null =>
  stop.deliveryLatitude !== null && stop.deliveryLongitude !== null
    ? { latitude: stop.deliveryLatitude, longitude: stop.deliveryLongitude }
    : null;

export function routeTiming(
  start: RoutingPoint | null,
  end: RoutingPoint | null,
  stops: readonly TimedStop[],
): RouteTiming {
  const points = stops.map(pointOf);
  const cumulative = estimateRouteMinutes(start, points);
  const byStop = new Map<string, { fromStart: number; leg: number }>();
  let previous = 0;
  stops.forEach((stop, index) => {
    const fromStart = cumulative[index];
    if (fromStart === null || fromStart === undefined) return;
    byStop.set(stop.id, { fromStart, leg: fromStart - previous });
    previous = fromStart;
  });
  const lastIndex = points.findLastIndex((point) => point !== null);
  const last = lastIndex >= 0 ? points[lastIndex] : null;
  const lastMinutes = lastIndex >= 0 ? (cumulative[lastIndex] ?? null) : null;
  if (!last || lastMinutes === null) return { byStop, totalMinutes: null };
  // La vuelta: el tiempo en la última parada más el viaje hasta la llegada.
  const back = end ? ROUTE_ESTIMATE.stopMinutes + (estimateRouteMinutes(last, [end])[0] ?? 0) : 0;
  return { byStop, totalMinutes: lastMinutes + back };
}

/** "10:00" + 40 → "10:40". Null si la hora no se entiende. */
export function clockPlus(departure: string | null | undefined, minutes: number): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(departure ?? '');
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  const hours = Math.floor(total / 60) % 24;
  return `${String(hours).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** "≈ 1 h 10", "≈ 25 min". */
export function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${String(minutes)} min`;
  const rest = minutes % 60;
  return `${String(Math.floor(minutes / 60))} h${rest ? ` ${String(rest).padStart(2, '0')}` : ''}`;
}

/**
 * El recorrido en Google Maps, en tramos: el link admite unas nueve paradas intermedias, así que
 * una ruta larga se parte. Cada tramo empieza donde terminó el anterior. Las paradas sin ubicación
 * no entran.
 */
export const MAPS_WAYPOINTS = 9;

export function mapsLinks(
  start: RoutingPoint | null,
  end: RoutingPoint | null,
  stops: readonly (TimedStop & { sequence: number })[],
): { label: string; url: string }[] {
  const located = stops
    .map((stop) => ({ point: pointOf(stop), sequence: stop.sequence }))
    .filter((entry): entry is { point: RoutingPoint; sequence: number } => entry.point !== null);
  if (located.length === 0) return [];
  const coords = (point: RoutingPoint) => `${String(point.latitude)},${String(point.longitude)}`;
  const links: { label: string; url: string }[] = [];
  let origin: RoutingPoint | null = start;
  let index = 0;
  while (index < located.length) {
    // Sin salida conocida, el primer tramo arranca en la primera parada.
    const firstOfChunk = origin ? index : index + 1;
    const chunk = located.slice(firstOfChunk, firstOfChunk + MAPS_WAYPOINTS + 1);
    const tail = located.slice(firstOfChunk + chunk.length);
    const isLast = tail.length === 0;
    const from = origin ?? located[index]?.point;
    if (!from) break;
    const finalStop = chunk.at(-1);
    const destination = isLast && end ? end : finalStop?.point;
    if (!destination) break;
    const waypoints = isLast && end ? chunk : chunk.slice(0, -1);
    const params = new URLSearchParams({
      api: '1',
      destination: coords(destination),
      origin: coords(from),
      travelmode: 'driving',
    });
    if (waypoints.length > 0)
      params.set('waypoints', waypoints.map((entry) => coords(entry.point)).join('|'));
    const firstSequence = (origin ? chunk[0] : located[index])?.sequence ?? 0;
    const lastSequence = finalStop?.sequence ?? firstSequence;
    links.push({
      label:
        links.length === 0 && isLast
          ? 'Abrir el recorrido en Google Maps'
          : `Tramo ${String(links.length + 1)}: paradas ${String(firstSequence)} a ${String(lastSequence)}`,
      url: `https://www.google.com/maps/dir/?${params.toString()}`,
    });
    if (isLast) break;
    origin = finalStop?.point ?? null;
    index = firstOfChunk + chunk.length;
  }
  return links;
}
