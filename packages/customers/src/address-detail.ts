/**
 * Separar el detalle de una dirección escrita en una sola línea (2026-10-24).
 *
 * Antes de que el domicilio tuviera dos líneas, todo iba junto: "Santa Rosa 31 Piso 12 Dpto C
 * Torre 1", "Hipolito Yrigoyen 584 piso 6, recibe Mariano". La línea 1 (calle, número y ciudad) es
 * lo que se busca en el mapa; la línea 2 (piso, depto, barrio, a quién dejarle) es para quien
 * reparte. Esto propone la separación; una persona la revisa antes de guardarla.
 *
 * La regla:
 * - En el primer tramo (hasta la primera coma), todo lo que viene después del número de la calle es
 *   detalle. El número es el primero que no es parte del nombre ("9 de Julio", "27 de Abril").
 * - Un tramo después de una coma es detalle si tiene números o palabras de detalle ("casa",
 *   "recibe"…); si no ("Neuquén", "Sin clasificar") es parte de la ciudad y queda en la línea 1.
 */

const DETAIL_WORDS = new Set([
  'barrio',
  'b°',
  'bº',
  'block',
  'casa',
  'casilla',
  'cochera',
  'complejo',
  'condominio',
  'country',
  'departamento',
  'depto',
  'dejar',
  'dpto',
  'dto',
  'edificio',
  'entre',
  'esquina',
  'fondo',
  'frente',
  'galpon',
  'galpón',
  'local',
  'lote',
  'manzana',
  'mz',
  'mza',
  'of',
  'oficina',
  'pb',
  'piso',
  'planta',
  'playa',
  'porton',
  'portón',
  'puerta',
  'recibe',
  'sector',
  'timbre',
  'tocar',
  'torre',
  'uf',
  'unidad',
]);

const clean = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;-]+|[\s,;-]+$/g, '')
    .trim();

const isDetailSegment = (segment: string) => {
  if (/\d/.test(segment)) return true;
  return segment
    .toLocaleLowerCase('es-AR')
    .split(/[\s.]+/)
    .some((word) => DETAIL_WORDS.has(word));
};

/** Dónde termina "calle y número" en el primer tramo; -1 si no hay número de calle. */
function houseNumberEnd(segment: string): number {
  const tokens = [...segment.matchAll(/\S+/g)];
  for (const [index, token] of tokens.entries()) {
    if (!/^\d{1,5}[a-z]?$/i.test(token[0])) continue;
    // Un número al principio no es el de la casa ("27 de Abril…" sigue siendo el nombre).
    if (index === 0) continue;
    // "9 de Julio", "25 de Mayo": el número es parte del nombre de la calle.
    const next = tokens[index + 1]?.[0].toLocaleLowerCase('es-AR');
    if (next === 'de' || next === 'del') continue;
    return (token.index ?? 0) + token[0].length;
  }
  return -1;
}

export function splitAddressDetail(text: string): { line1: string; line2: string | null } {
  const value = clean(text);
  const [first = '', ...rest] = value.split(',');
  const end = houseNumberEnd(first);
  const line1Parts = [clean(end < 0 ? first : first.slice(0, end))];
  const detailParts: string[] = [];
  const afterNumber = end < 0 ? '' : clean(first.slice(end));
  if (afterNumber) detailParts.push(afterNumber);
  for (const segment of rest.map(clean).filter(Boolean)) {
    // Una vez que empezó el detalle, lo que sigue también es detalle ("piso 6, recibe Mariano").
    if (detailParts.length > 0 || isDetailSegment(segment)) detailParts.push(segment);
    else line1Parts.push(segment);
  }
  const line1 = line1Parts.filter(Boolean).join(', ');
  const line2 = detailParts.join(', ');
  return line2 && line1 ? { line1, line2 } : { line1: value, line2: null };
}
