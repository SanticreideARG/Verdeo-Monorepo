/**
 * Los barrios en una hoja de ruta: dónde empieza cada tanda de paradas.
 *
 * Las paradas mantienen el orden de la ruta (el que se armó por cercanía o a mano); el barrio se
 * anuncia cada vez que cambia respecto de la parada anterior. Si ninguna parada tiene barrio no se
 * anuncia nada: un "Sin barrio" sobre todas no aporta.
 */
export function neighborhoodHeading(
  stops: readonly { neighborhood: string | null }[],
  index: number,
): string | null {
  if (!stops.some((stop) => stop.neighborhood)) return null;
  const current = stops[index]?.neighborhood ?? null;
  const previous = index === 0 ? undefined : (stops[index - 1]?.neighborhood ?? null);
  if (previous !== undefined && previous === current) return null;
  return current ?? 'Sin barrio';
}
