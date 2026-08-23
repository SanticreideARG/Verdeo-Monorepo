/**
 * Fase 8 route sequencing (DELIVERY_AND_ROUTES.md "Optimización"): "usar motor determinista
 * (Google Route Optimization, OR-Tools u otro adapter). IA puede explicar la propuesta, no
 * calcular la ruta principal." Behind an adapter, same reasoning as GeocodingProvider — app.ts
 * only knows `RouteOptimizer`, never a concrete class, so a real VRPTW solver can slot in later
 * without touching callers.
 *
 * `NearestNeighborRouteOptimizer` is the default: a plain greedy nearest-neighbor walk from the
 * operation's origin (or the first stop, if no origin is configured). It ignores time windows and
 * per-repartidor capacity — those need the real optimizer this is standing in for — but it always
 * produces *a* usable sequence with zero external dependencies, the same "always works, never
 * blocks the product" posture as `LocationLinkGeocodingProvider`.
 */
export interface RoutingPoint {
  latitude: number;
  longitude: number;
}

export interface RouteStopInput extends RoutingPoint {
  id: string;
}

export interface RouteOptimizer {
  readonly key: string;
  sequence(
    origin: RoutingPoint | null,
    stops: readonly RouteStopInput[],
  ): readonly RouteStopInput[];
}

/** Great-circle distance in kilometers (haversine). Accurate enough at delivery-route scale;
 * no need for anything more precise than a few tens of meters here. */
export function haversineDistanceKm(a: RoutingPoint, b: RoutingPoint): number {
  const EARTH_RADIUS_KM = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) *
      Math.cos(toRadians(b.latitude)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export class NearestNeighborRouteOptimizer implements RouteOptimizer {
  public readonly key = 'nearest-neighbor';

  public sequence(
    origin: RoutingPoint | null,
    stops: readonly RouteStopInput[],
  ): readonly RouteStopInput[] {
    const remaining = [...stops];
    const ordered: RouteStopInput[] = [];
    let current = origin;

    while (remaining.length > 0) {
      let nearestIndex = 0;
      if (current) {
        let nearestDistance = Infinity;
        for (const [index, stop] of remaining.entries()) {
          const distance = haversineDistanceKm(current, stop);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
          }
        }
      }
      const [next] = remaining.splice(nearestIndex, 1);
      if (!next) break;
      ordered.push(next);
      current = next;
    }

    return ordered;
  }
}
