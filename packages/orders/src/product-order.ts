/**
 * La jerarquía de orden de los productos (PRODUCT_ORDER.md): una sola, para todas las salidas de la
 * aplicación —planillas, etiquetas, informes, listas—.
 *
 *   Keto 400 · Keto 250 · Antiage · Real · Vegetariano · Intuitivos
 *
 * Dentro de cada variedad, el tamaño más grande primero. Una variedad que no está en la lista va
 * después de las nombradas y antes de los Intuitivos, por nombre.
 *
 * Se reconoce la variedad por su nombre ("Menú Nuevo Keto" es Keto, "Menú Anti-Age" es Antiage):
 * sin acentos, sin "Menú", sin guiones ni espacios.
 */

const HIERARCHY = ['keto', 'antiage', 'real', 'vegetarian'] as const;

function normalized(familyName: string): string {
  return familyName
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-AR')
    .replace(/^menu\s+/, '')
    .replace(/[^a-z0-9]/g, '');
}

/** El lugar de una variedad en la jerarquía: 0 es Keto; los Intuitivos, siempre últimos. */
export function familyRank(familyName: string, composable = false): number {
  const name = normalized(familyName);
  if (composable || name.includes('intuitivo')) return HIERARCHY.length + 1;
  const index = HIERARCHY.findIndex((key) => name.includes(key));
  return index < 0 ? HIERARCHY.length : index;
}

/** Las variedades en el orden de la jerarquía; las que no están, por nombre. */
export function compareFamilies(
  left: string,
  right: string,
  composable: { left?: boolean; right?: boolean } = {},
): number {
  return (
    familyRank(left, composable.left) - familyRank(right, composable.right) ||
    left.localeCompare(right, 'es-AR')
  );
}

/** Los tamaños de mayor a menor: 400 antes que 250. Sin número, por nombre. */
export function compareSizes(left: string | null, right: string | null): number {
  const a = Number.parseFloat(left ?? '');
  const b = Number.parseFloat(right ?? '');
  if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return b - a;
  return (left ?? '').localeCompare(right ?? '', 'es-AR', { numeric: true });
}

/** Un producto (variedad y tamaño) según la jerarquía. Para `Array.prototype.sort`. */
export function compareProducts(
  left: { composable?: boolean; familyName: string; variantName?: string | null },
  right: { composable?: boolean; familyName: string; variantName?: string | null },
): number {
  return (
    compareFamilies(left.familyName, right.familyName, {
      left: left.composable ?? false,
      right: right.composable ?? false,
    }) || compareSizes(left.variantName ?? null, right.variantName ?? null)
  );
}
