/**
 * Cómo se escribe el nombre de una variedad.
 *
 * Los menús vienen cargados en mayúscula sostenida —"MENÚ NUEVO KETO", "MENÚ ANTI-AGE"— y eso se
 * propaga a todos lados: la web pública, el formulario de pedidos, las etiquetas, la planilla y el
 * snapshot que queda en cada ítem vendido. Dos costos concretos:
 *
 * - **Se lee peor.** La mayúscula sostenida borra la silueta de la palabra, que es de lo que vive la
 *   lectura rápida; en una grilla de doce variedades eso se nota.
 * - **Ya rompió un informe.** La misma variedad cargada una semana con una caja y otra con otra
 *   apareció como dos porciones en "Demanda por variedad". Las estadísticas ahora las juntan al
 *   leer, pero el dato sigue mezclado y el arreglo correcto es no ensuciarlo.
 *
 * La regla es deliberadamente conservadora: **sólo se interviene si el texto está enteramente en
 * mayúsculas.** Quien escribe "Menú KETO" a propósito lo conserva; quien tenía la tecla de bloqueo
 * puesta, no. Normalizar siempre sería decidir por el operador cómo se llama su producto.
 */

/** Palabras que en un nombre propio van en minúscula, salvo que abran el nombre. */
const MINOR_WORDS = new Set(['a', 'con', 'de', 'del', 'e', 'en', 'la', 'las', 'los', 'sin', 'y']);

function titleCaseWord(word: string, isFirst: boolean): string {
  const lower = word.toLocaleLowerCase('es-AR');
  if (!isFirst && MINOR_WORDS.has(lower)) return lower;
  /*
   * Se capitaliza cada tramo separado por guión: "ANTI-AGE" tiene que quedar "Anti-Age" y no
   * "Anti-age", porque las dos mitades son la marca y no una palabra compuesta cualquiera.
   */
  return lower
    .split('-')
    .map((part) => {
      const [first, ...rest] = [...part];
      return first ? first.toLocaleUpperCase('es-AR') + rest.join('') : part;
    })
    .join('-');
}

export function normalizeMenuName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  // Sin ninguna minúscula, el texto está gritado: es el caso que esto viene a arreglar.
  if (trimmed !== trimmed.toLocaleUpperCase('es-AR')) return trimmed;
  // Un nombre sin letras —"250", "400"— no tiene caja que corregir.
  if (!/\p{Letter}/u.test(trimmed)) return trimmed;

  return trimmed
    .split(' ')
    .map((word, index) => titleCaseWord(word, index === 0))
    .join(' ');
}
