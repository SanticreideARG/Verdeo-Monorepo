/**
 * Reconocer a qué oferta del menú se refiere un texto como "Menú Paleo & Keto  400".
 *
 * Lo escribe un formulario, una planilla o una persona, y nunca coincide letra por letra con el
 * catálogo: sobra o falta la palabra "Menú", hay dos espacios, el "&" es una "y", el tamaño es "400"
 * o "400 g". Comparar por igualdad exacta rechaza casi todo, y comparar con demasiada soltura une
 * variedades distintas. Esto es lo que queda en el medio, y cuando no puede decidir **no decide**.
 */

export interface MatchableOffering {
  familyName: string;
  id: string;
  sizeName: string;
}

/** Sin tildes, en minúscula, sin signos, con "&" como "y" y sin la palabra "menú" al principio. */
function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('es-AR')
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^menu /, '');
}

/** El número del tamaño: "400", "400 g" y "Tamaño 400" son lo mismo. */
function sizeKey(value: string): string {
  const digits = /\d+/.exec(value)?.[0];
  return digits ?? normalizeName(value);
}

/**
 * El id de la oferta que corresponde, o `null`.
 *
 * Primero igualdad después de normalizar. Si no hay, una variedad que contiene a la otra, pero sólo
 * si de entre las ofertas de ese tamaño **una única** cumple: dos candidatos no son una respuesta,
 * son una ambigüedad, y elegir uno es la forma de cargar el pedido de otra variedad sin que nadie
 * lo note. `null` no es un error: es la señal para que una persona elija.
 */
export function matchOffering(
  variety: string | null,
  size: string | null,
  offerings: readonly MatchableOffering[],
): string | null {
  if (!variety || !size) return null;
  const wantedVariety = normalizeName(variety);
  const wantedSize = sizeKey(size);
  if (!wantedVariety) return null;

  const sameSize = offerings.filter((offering) => sizeKey(offering.sizeName) === wantedSize);

  const exact = sameSize.filter((offering) => normalizeName(offering.familyName) === wantedVariety);
  if (exact.length === 1) return exact[0]?.id ?? null;
  if (exact.length > 1) return null;

  const contained = sameSize.filter((offering) => {
    const family = normalizeName(offering.familyName);
    return family.length > 0 && (family.includes(wantedVariety) || wantedVariety.includes(family));
  });
  return contained.length === 1 ? (contained[0]?.id ?? null) : null;
}
