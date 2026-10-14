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

/**
 * La calle hasta su altura: lo que viene después no lo entiende un buscador.
 *
 * "Silvio Ruggieri 299 Edif San Marcos 29 B dejar al guardia" se buscaba entero y no aparecía nada;
 * es "Silvio Ruggieri 299". La altura es el primer número que viene después de una palabra, así
 * que "25 de Mayo 300" sigue siendo "25 de Mayo 300". "N°" y "nro" antes de la altura se respetan.
 */
function cutAfterHouseNumber(street: string): string {
  // Con "Calle 7 n° 1234" (La Plata) la altura es la que sigue al "n°".
  const match =
    /^(.*?\p{L}[\p{L}.'’]*\.?\s+(?:n[°ºo.]?\s*|nro\.?\s*)?\d{1,5}(?:\s+(?:n[°º]|nro\.?)\s*\d{1,5})?)(?!\d)/iu.exec(
      street,
    );
  return match?.[1]?.trim() ?? street;
}

export function searchableAddress(written: string): SearchableAddress {
  const segments = written
    .split(',')
    .map((segment) => segment.trim().replace(/\s+/g, ' '))
    .filter((segment) => segment.length > 0);
  const streetIndex = segments.findIndex((segment) => /\d/.test(segment));
  const index = streetIndex === -1 ? 0 : streetIndex;
  const street = cutAfterHouseNumber(
    (segments[index] ?? '').replace(UNIT_WORDS, '').replace(UNIT_AFTER_NUMBER, '$1').trim(),
  );
  const places = segments
    .filter((_, position) => position !== index)
    .filter((segment) => !/^zona\b/i.test(segment))
    .filter((segment) => !/^argentina$/i.test(segment))
    // Lo que quedó con número después de la calle es piso, depto o un código: no es un lugar.
    .filter((segment) => !/\d/.test(segment));
  return { places, street };
}
