export interface DeliveryDetailItem {
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
 * Cada vianda se nombra por variedad y tamaño —"Menú Keto 400", "Intuitivo 250"—, que es lo que dice
 * su etiqueta. Las unidades se escriben sólo cuando son más de una: "Menú Keto 400" es una vianda;
 * "Menú Keto 400 ×3" son tres, y esa diferencia es la que hace que falte una al llegar.
 *
 * Un Intuitivo no lleva sus platos ni el nombre del cliente. Los platos estuvieron entre
 * paréntesis y alargaban la parada a seis renglones con algo que al repartidor no le sirve: su
 * trabajo es entregar la caja, no revisar qué tiene adentro. El nombre ya encabeza la parada.
 */
export function deliveryDetail(items: readonly DeliveryDetailItem[]): string {
  return items
    .map((item) => {
      const nombre = `${item.familyName} ${item.variantName}`.trim();
      return item.quantityUnits > 1 ? `${nombre} ×${String(item.quantityUnits)}` : nombre;
    })
    .join(' + ');
}
