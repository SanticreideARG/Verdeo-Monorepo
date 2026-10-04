export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'READY' | 'DELIVERED' | 'CANCELLED';

export interface KitchenSourceLine {
  // True when the family's kind is COMPOSABLE. Kitchen groups by behaviour, not by variety name.
  composable: boolean;
  customerDisplayName: string;
  deliveryDate: string;
  deliveryZone: string | null;
  dietaryInstructions: readonly string[];
  /**
   * Qué platos lleva esta vianda.
   *
   * En un Intuitivo son los que eligió el cliente; en una variedad estándar, los cinco que el menú
   * de la semana define para esa oferta. Es distinto de `dishSelections`, que son sólo los elegidos
   * y es lo que cocina consolida para saber cuántas porciones de cada plato preparar: mezclarlos
   * haría que los platos fijos de una variedad se cuenten como si alguien los hubiera pedido uno
   * por uno.
   */
  dishes: readonly string[];
  dishSelections: readonly string[];
  familyName: string;
  orderPublicNumber: string;
  quantityUnits: number;
  variantName: string;
}

export interface KitchenBaseRequirement {
  exceptions: {
    customerDisplayName: string;
    dietaryInstructions: readonly string[];
    orderPublicNumber: string;
    quantityUnits: number;
  }[];
  familyName: string;
  /**
   * Cuántos pedidos distintos aportan a este renglón.
   *
   * No es lo mismo que las unidades y las dos cosas importan: ocho unidades pueden ser ocho pedidos
   * de una o dos de cuatro, y eso cambia cuántos paquetes se arman y cuántas etiquetas se pegan.
   */
  orderCount: number;
  quantityUnits: number;
  variantName: string;
}

/** Cuántas porciones de cada plato hacen falta, sumando todos los Intuitivos. */
export interface KitchenDishTally {
  dishName: string;
  portions: number;
}

export interface KitchenCustomRequirement extends KitchenSourceLine {
  sequence: number;
}

export interface KitchenSummary {
  base: KitchenBaseRequirement[];
  custom: KitchenCustomRequirement[];
  /**
   * Los platos de todos los Intuitivos, sumados.
   *
   * Sin esto, saber cuánto pollo al verdeo hay que cocinar era recorrer una por una las tarjetas de
   * Intuitivo y llevar la cuenta a mano — que es precisamente la pregunta que cocina se hace antes
   * de comprar.
   */
  dishTally: KitchenDishTally[];
  /** Pedidos distintos del ciclo, no unidades. */
  totalOrders: number;
  totalUnits: number;
}

/**
 * Una etiqueta, con todo lo que se le podría querer imprimir.
 *
 * La etiqueta trae siempre los datos completos y es Ajustes quien decide cuáles se ven: qué campos
 * imprimir es una preferencia de la operación, no algo que el motor deba adivinar. Un dato que no
 * viaja hasta acá no se puede activar después sin tocar el backend.
 */
export interface Label {
  /** Si la vianda es un Intuitivo: sin el nombre no se sabe de quién es esa combinación de platos. */
  composable: boolean;
  customerDisplayName: string;
  deliveryDate: string;
  deliveryZone: string | null;
  dietaryInstructions: readonly string[];
  /** Cuál de los platos de la vianda es éste, cuando se imprime una etiqueta por plato. */
  dishIndex: number;
  /** El plato, o null cuando la etiqueta es de la vianda entera. */
  dishName: string | null;
  dishTotal: number;
  familyName: string;
  orderPublicNumber: string;
  /** Qué unidad de las del renglón es ésta: se imprime como "1 de 3" cuando hay más de una. */
  unitIndex: number;
  unitTotal: number;
  variantName: string;
}
