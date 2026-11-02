import { familyRank } from './product-order.js';

/**
 * Reconocer a qué oferta del menú se refiere un texto como "Menú Paleo & Keto  400".
 *
 * Lo escribe un formulario, una planilla o una persona, y nunca coincide letra por letra con el
 * catálogo: sobra o falta la palabra "Menú", hay dos espacios, el "&" es una "y", el tamaño es "400"
 * o "400 g". Comparar por igualdad exacta rechaza casi todo, y comparar con demasiada soltura une
 * variedades distintas. Esto es lo que queda en el medio, y cuando no puede decidir **no decide**.
 */

export interface MatchableOffering {
  /** El Intuitivo: nunca es el destino de un nombre del formulario. */
  composable?: boolean;
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
  if (contained.length === 1) return contained[0]?.id ?? null;
  if (contained.length > 1) return null;

  // Un error de tipeo ("vegerariano"): a lo sumo dos letras de diferencia con una sola variedad, y
  // sólo en nombres largos, donde dos letras no alcanzan para confundir una variedad con otra.
  const close = sameSize.filter((offering) => {
    const family = normalizeName(offering.familyName);
    return (
      wantedVariety.length >= 6 && family.length >= 6 && editDistance(family, wantedVariety) <= 2
    );
  });
  return close.length === 1 ? (close[0]?.id ?? null) : null;
}

/**
 * Los menús del formulario del sitio que en el catálogo se llaman de otra forma.
 *
 * El formulario sigue diciendo "Paleo & Keto" o "Vegetariano", y comparar por el nombre no alcanza:
 * "Vegetariano" coincidiría con la variedad Vegetariano, y la regla es que es Real. Vale sólo para
 * los mails: en una planilla "vegetariano" quiere decir Vegetariano.
 */
const EMAIL_MENU_FAMILIES: Readonly<Record<string, string>> = {
  'anti age y detox': 'antiage',
  'antiage y detox': 'antiage',
  'paleo keto': 'keto',
  'paleo y keto': 'keto',
  vegetariano: 'real',
};

/** A qué variedad del catálogo corresponde un menú del mail, si se llama distinto. */
export function emailMenuFamily(variety: string | null): string | null {
  return variety ? (EMAIL_MENU_FAMILIES[normalizeName(variety)] ?? null) : null;
}

/**
 * Lo mismo que `matchOffering`, para una línea de un mail del formulario.
 *
 * Un menú con otro nombre va a su variedad del catálogo, se llame como se llame esa semana ("Menú
 * Nuevo Keto"). Si esa variedad no está publicada en ese tamaño, o hay más de una, es `null`: una
 * persona elige, no se cae en otra variedad parecida.
 */
export function matchEmailOffering(
  variety: string | null,
  size: string | null,
  offerings: readonly MatchableOffering[],
): string | null {
  const family = emailMenuFamily(variety);
  if (!family) return matchOffering(variety, size, offerings);
  if (!size) return null;
  const wantedSize = sizeKey(size);
  const candidates = offerings.filter(
    (offering) =>
      sizeKey(offering.sizeName) === wantedSize &&
      familyRank(offering.familyName, offering.composable ?? false) === familyRank(family),
  );
  return candidates.length === 1 ? (candidates[0]?.id ?? null) : null;
}

/** Cuántas letras hay que cambiar, agregar o sacar para pasar de un texto al otro. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}
