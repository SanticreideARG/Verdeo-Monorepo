export interface DeliveryDetailItem {
  /** Un Intuitivo: su contenido lo eligió el cliente, así que no se identifica por la variedad. */
  composable: boolean;
  familyName: string;
  quantityUnits: number;
  variantName: string;
}

/**
 * Qué hay que entregar en esta parada, en una línea.
 *
 * La hoja de ruta decía a quién y dónde, pero no qué: el repartidor llegaba con la caja y tenía que
 * adivinar cuál de las viandas del auto era de esa parada. Con dos o tres paradas se resuelve
 * mirando; con veinte, no.
 *
 * Una vianda estándar se nombra por variedad y tamaño —"Menú Keto 400"—, que es lo que dice su
 * etiqueta. Un Intuitivo no: dos Intuitivo del mismo tamaño son combinaciones de platos distintas,
 * y lo único que los separa es el nombre de quien lo pidió, que es justamente lo que lleva impreso.
 * Por eso ahí la línea dice "Intuitivo 250 · Ana": es lo que hay que buscar en la caja.
 *
 * Las unidades se escriben sólo cuando son más de una. "Menú Keto 400" es una vianda; "Menú Keto
 * 400 ×3" son tres, y esa diferencia es la que hace que falte una al llegar.
 */
export function deliveryDetail(
  items: readonly DeliveryDetailItem[],
  customerFirstName: string,
): string {
  return items
    .map((item) => {
      const nombre = item.composable
        ? `${item.familyName} ${item.variantName} · ${customerFirstName}`.trim()
        : `${item.familyName} ${item.variantName}`.trim();
      return item.quantityUnits > 1 ? `${nombre} ×${String(item.quantityUnits)}` : nombre;
    })
    .join(' + ');
}
