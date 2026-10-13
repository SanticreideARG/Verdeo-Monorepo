/**
 * El texto de una dirección listo para un buscador de mapas.
 *
 * Lo que se escribe para el repartidor no es lo que entiende un buscador:
 *
 * - El piso o el departamento pegado al número ("Libertador 8520-17A", "Mitre 400 piso 3 dto B")
 *   hace que no encuentre la altura.
 * - El nombre de la zona de reparto ("Zona General") no es un lugar: es cómo se ordenan las rutas.
 *
 * Devuelve la calle con su número (`street`) y el resto de los tramos que sí son lugares (`places`,
 * como el barrio o la ciudad).
 */
export interface SearchableAddress {
  places: string[];
  street: string;
}

const UNIT_WORDS =
  /\s+(?:piso|p\.|dpto\.?|depto\.?|dto\.?|departamento|pb|timbre|torre|casa|uf|lote|local|of\.?|oficina)\b.*$/i;
// "8520-17A", "8520/3", "8520 - 4B": lo que va después de la altura, separado por guion o barra.
const UNIT_AFTER_NUMBER = /^(.*?\d+)\s*[-/]\s*[0-9a-z°º]+.*$/i;

export function searchableAddress(written: string): SearchableAddress {
  const segments = written
    .split(',')
    .map((segment) => segment.trim().replace(/\s+/g, ' '))
    .filter((segment) => segment.length > 0);
  const streetIndex = segments.findIndex((segment) => /\d/.test(segment));
  const index = streetIndex === -1 ? 0 : streetIndex;
  const street = (segments[index] ?? '')
    .replace(UNIT_WORDS, '')
    .replace(UNIT_AFTER_NUMBER, '$1')
    .trim();
  const places = segments
    .filter((_, position) => position !== index)
    .filter((segment) => !/^zona\b/i.test(segment))
    .filter((segment) => !/^argentina$/i.test(segment))
    // Lo que quedó con número después de la calle es piso, depto o un código: no es un lugar.
    .filter((segment) => !/\d/.test(segment));
  return { places, street };
}
