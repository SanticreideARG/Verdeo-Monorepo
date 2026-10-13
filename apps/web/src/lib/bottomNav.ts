/**
 * Cómo repartir los accesos de la barra del teléfono para que el logo quede en el centro exacto.
 *
 * El logo va en el medio y la barra reparte el resto en partes iguales, así que el logo queda
 * centrado sólo si hay la misma cantidad de botones a cada lado. "Más" abre el mismo menú que el
 * botón ☰ de arriba, así que se usa como comodín: aparece sólo cuando hace falta para que los dos
 * lados queden parejos. Con cuatro accesos (2 | logo | 2) no está; con tres, completa el lado
 * derecho (2 | logo | 1 + Más).
 */
export function bottomNavLayout(entries: number): { left: number; showMore: boolean } {
  const showMore = entries % 2 === 1;
  const sides = entries + (showMore ? 1 : 0);
  return { left: sides / 2, showMore };
}
