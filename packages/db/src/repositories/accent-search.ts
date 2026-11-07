import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

/*
 * Buscar sin importar las tildes (2026-11-06): "Nunez" encuentra a "Núñez" y "Jose" a "José", y al
 * revés. Sin la extensión `unaccent` (sería una migración): `translate` saca las tildes de la
 * columna y lo buscado se limpia igual en JavaScript. Con `ilike '%…%'` no se usaba ningún índice,
 * así que no se pierde velocidad.
 */
const ACCENTED = 'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç';
const PLAIN = 'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc';

/** Lo buscado sin tildes ni diéresis, y la ñ como n. */
export function foldAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** `columna ilike '%buscado%'`, sin importar las tildes de ninguno de los dos lados. */
export function ilikeIgnoringAccents(column: AnyColumn | SQL, search: string): SQL {
  return sql`translate(${column}, ${ACCENTED}, ${PLAIN}) ilike ${`%${foldAccents(search)}%`}`;
}
