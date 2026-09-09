/**
 * Juntar filas de un informe que son lo mismo escrito distinto.
 *
 * Los nombres de los informes salen de los snapshots del ítem del pedido —el nombre tal como estaba
 * el día que se vendió—, así que una semana cargada con "MENÚ REAL" y otra con "Menú Real" son dos
 * filas en la torta, con la mitad de las unidades cada una. No es un empate: es el mismo menú
 * partido al medio, y en un informe eso se lee como si hubiera dos variedades que compiten.
 *
 * Se juntan por el nombre en minúsculas y sin acentos —"Menú Anti-Age" y "Menu Anti-age" también
 * son el mismo— y se muestra la escritura de la fila que más unidades trae, que es la que se usó de
 * verdad; quedarse con la primera dejaría el informe titulado por el error de tipeo de una semana.
 *
 * Esto arregla la lectura, no el dato: si dos ofertas del catálogo se llaman igual con distinta
 * caja, conviene unificarlas en el menú. Mientras tanto el informe no miente.
 */
export function mergeByLooseName<T extends Record<string, unknown>>(
  rows: readonly T[],
  nameKey: keyof T,
  numericKeys: readonly (keyof T)[],
): T[] {
  const merged = new Map<string, { row: T; weight: number }>();

  for (const row of rows) {
    const name = String(row[nameKey]);
    const key = looseKey(name);
    const weight = Number(row[numericKeys[0] ?? nameKey] ?? 0);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { row: { ...row }, weight });
      continue;
    }
    for (const numericKey of numericKeys) {
      (current.row[numericKey] as number) =
        Number(current.row[numericKey] ?? 0) + Number(row[numericKey] ?? 0);
    }
    // La escritura que más se usó gana; con el mismo peso, gana la que ya estaba, así que el
    // resultado no depende de en qué orden vinieron las filas.
    if (weight > current.weight) {
      current.row[nameKey] = row[nameKey];
      current.weight = weight;
    }
  }

  return [...merged.values()].map((entry) => entry.row);
}

/** Minúsculas, sin acentos y sin espacios de más: la forma canónica para comparar dos nombres. */
function looseKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
