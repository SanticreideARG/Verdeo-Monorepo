export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'READY' | 'DELIVERED' | 'CANCELLED';

export interface KitchenSourceLine {
  // True when the family's kind is COMPOSABLE. Kitchen groups by behaviour, not by variety name.
  composable: boolean;
  customerDisplayName: string;
  deliveryDate: string;
  deliveryZone: string | null;
  dietaryInstructions: readonly string[];
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
  customerDisplayName: string;
  deliveryDate: string;
  deliveryZone: string | null;
  dietaryInstructions: readonly string[];
  familyName: string;
  orderPublicNumber: string;
  /** Qué unidad de las del renglón es ésta: se imprime como "1 de 3" cuando hay más de una. */
  unitIndex: number;
  unitTotal: number;
  variantName: string;
}
