import { compareProducts } from './product-order.js';
import type { KitchenSourceLine } from './types.js';

/** Una etiqueta de cocina: un plato, para pegar en su recipiente. */
export interface KitchenLabel {
  /** "KETO": la abreviatura de la variedad que va en el pie. */
  abbreviation: string;
  composable: boolean;
  /** Sólo en un Intuitivo, y sólo si se pidió: sus platos cambian de cliente a cliente. */
  customerName: string | null;
  /** El plato principal, sin el acompañamiento. */
  dish: string;
  /** El acompañamiento ("Tortilla de brócoli"), o null si el plato no tiene. */
  side: string | null;
  /** El tamaño, sólo si se pidió mostrarlo. */
  sizeName: string | null;
  /**
   * Sólo en un Intuitivo: de qué pedido es (clave interna, no se imprime) y de quién, para armar
   * en Etiquetas 2.0 un grupo por pedido.
   */
  orderCustomer?: string | null;
  orderKey?: string | null;
}

/**
 * Plato y acompañamiento, escritos en una sola línea del menú con una barra:
 * "Wraps de pechuga con crema de cúrcuma / Tortilla de brócoli".
 *
 * El menú guarda cada plato como un texto, y la etiqueta los muestra distinto —el plato en
 * mayúsculas, el acompañamiento en cursiva debajo—, así que hace falta una marca para separarlos.
 * La barra es lo que se escribe naturalmente; un plato sin barra no tiene acompañamiento.
 */
export function splitDish(name: string): { dish: string; side: string | null } {
  const [dish = '', ...rest] = name.split(/\s+\/\s+/);
  const side = rest.join(' / ').trim();
  return { dish: dish.trim(), side: side || null };
}

/**
 * La abreviatura que se usa cuando la variedad todavía no tiene una cargada.
 *
 * La última palabra del nombre, sin "Menú" y en mayúsculas: "Menú Paleo & Keto" → "KETO",
 * "Menú Vegan" → "VEGAN". Es una sugerencia para que la etiqueta no salga sin pie; la abreviatura
 * cargada en el menú siempre gana.
 */
export function defaultAbbreviation(familyName: string): string {
  const words = familyName
    .replace(/^men[uú]\s+/i, '')
    .split(/[\s&,/]+/)
    .filter(Boolean);
  // "Anti-Age" es una sola palabra: la abreviatura es "ANTIAGE", como en las etiquetas de producción.
  return (words[words.length - 1] ?? familyName).replace(/-/g, '').toLocaleUpperCase('es-AR');
}

/**
 * Las etiquetas de cocina de una tanda: una por plato, sin el nombre del cliente.
 *
 * En una variedad fija, cada unidad pedida lleva un recipiente de cada uno de sus platos, así que
 * se suman las unidades de todos los pedidos y se imprimen los platos **intercalados** (1-2-3-4-5,
 * 1-2-3-4-5…), que es como se arman las viandas. Con `showSize` cada tamaño va aparte; sin él, el
 * 250 y el 400 de una variedad llevan la misma etiqueta.
 *
 * Un Intuitivo es distinto: sus platos los elige cada cliente, así que va pedido por pedido y, si
 * se pidió (por defecto sí), con el nombre de quién es.
 */
export function buildKitchenLabels(
  lines: readonly (KitchenSourceLine & { familyAbbreviation?: string | null | undefined })[],
  options: { intuitivoCustomerName: boolean; showSize: boolean },
): KitchenLabel[] {
  const abbreviationOf = (line: (typeof lines)[number]) =>
    line.familyAbbreviation?.trim() || defaultAbbreviation(line.familyName);

  // Variedades fijas: unidades sumadas por variedad (y tamaño, si se muestra).
  const groups = new Map<
    string,
    {
      abbreviation: string;
      dishes: readonly string[];
      familyName: string;
      sizeName: string | null;
      units: number;
    }
  >();
  for (const line of lines) {
    if (line.composable || line.dishes.length === 0) continue;
    const sizeName = options.showSize ? line.variantName : null;
    const key = `${line.familyName}::${sizeName ?? ''}`;
    const group = groups.get(key);
    if (group) group.units += line.quantityUnits;
    else
      groups.set(key, {
        abbreviation: abbreviationOf(line),
        dishes: line.dishes,
        familyName: line.familyName,
        sizeName,
        units: line.quantityUnits,
      });
  }

  const labels: KitchenLabel[] = [];
  // La jerarquía de productos (PRODUCT_ORDER.md): Keto 400, Keto 250, Antiage, Real…
  const ordered = [...groups.values()].sort((left, right) =>
    compareProducts(
      { familyName: left.familyName, variantName: left.sizeName },
      { familyName: right.familyName, variantName: right.sizeName },
    ),
  );
  for (const group of ordered) {
    for (let unit = 0; unit < group.units; unit += 1) {
      for (const name of group.dishes) {
        labels.push({
          abbreviation: group.abbreviation,
          composable: false,
          customerName: null,
          ...splitDish(name),
          sizeName: group.sizeName,
        });
      }
    }
  }

  /*
   * Intuitivo: pedido por pedido, con sus platos. Cada plato lleva en el pie el menú del que viene
   * ("KETO", "REAL"), no "INTUITIVO": la categoría Intuitivo no existe en la cocina, sólo en la
   * venta (2026-10-23). El menú sale del origen que guarda cada plato elegido; si no lo tiene (un
   * nombre que estaba en dos menús), se busca el plato entre los menús de la tanda.
   */
  const abbreviationByFamily = new Map(
    lines.filter((line) => !line.composable).map((line) => [line.familyName, abbreviationOf(line)]),
  );
  const familyOfDish = (name: string): string | null =>
    lines.find((line) => !line.composable && line.dishes.includes(name))?.familyName ?? null;
  const sourceAbbreviation = (familyName: string) =>
    abbreviationByFamily.get(familyName) ?? defaultAbbreviation(familyName);
  const composables = lines
    .filter((line) => line.composable)
    .sort((left, right) => left.orderPublicNumber.localeCompare(right.orderPublicNumber));
  for (const line of composables) {
    const chosen = line.dishSelections.length > 0;
    const dishes = chosen ? line.dishSelections : line.dishes;
    for (let unit = 0; unit < line.quantityUnits; unit += 1) {
      for (const [index, name] of dishes.entries()) {
        const source = chosen ? (line.dishSources?.[index] ?? null) : null;
        const family = source?.familyName ?? familyOfDish(name);
        labels.push({
          abbreviation: family ? sourceAbbreviation(family) : abbreviationOf(line),
          composable: true,
          customerName: options.intuitivoCustomerName ? line.customerDisplayName : null,
          ...splitDish(name),
          orderCustomer: line.customerDisplayName,
          orderKey: line.orderPublicNumber,
          sizeName: options.showSize ? line.variantName : null,
        });
      }
    }
  }
  return labels;
}

/** "24-09": la fecha de elaboración como se imprime en el pie. */
export function elaborationLabel(isoDate: string): string {
  const [, month = '', day = ''] = isoDate.split('-');
  return `${day}-${month}`;
}
