/** Minúsculas, sin tildes ni signos, y sin letras dobles ("Cipolleti" y "Cipolletti" son lo mismo). */
function clean(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/([a-z])\1+/g, '$1');
}

const SEPARATORS = /[,;]|\s[-–]\s/;

/**
 * La zona que nombra una dirección escrita a mano, si nombra exactamente una.
 *
 * Mira lo que viene **después de la calle**, nunca la calle: en General Roca hay una calle Neuquén, y
 * "Neuquen 1466, General roca" es de la zona General Roca aunque el texto diga las dos. Por eso va
 * por partes, separadas por coma, desde la más cercana a la calle (la localidad) hasta la última (a
 * veces la provincia). Sin separadores, sólo cuenta si el nombre está al final del texto. Si una
 * parte nombra dos zonas, no adivina.
 */
export function zoneNamedInAddress(
  zones: readonly { displayName: string; id: string }[],
  address: string,
  line2?: string | null,
): string | undefined {
  const names = zones
    .map((zone) => ({ id: zone.id, name: clean(zone.displayName) }))
    .filter((zone) => zone.name.length >= 4);
  const parts = (text: string) => text.split(SEPARATORS).map(clean).filter(Boolean);

  const written = parts(address);
  for (const part of [...written.slice(1), ...parts(line2 ?? '')]) {
    const named = names.filter((zone) => ` ${part} `.includes(` ${zone.name} `));
    if (named.length === 1) return named[0]?.id;
    if (named.length > 1) return undefined;
  }
  if (written.length === 1) {
    const atEnd = names.filter((zone) => written[0]?.endsWith(` ${zone.name}`));
    if (atEnd.length === 1) return atEnd[0]?.id;
  }
  return undefined;
}
