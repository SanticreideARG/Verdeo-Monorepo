/**
 * Etiquetas 2.0 (LABELS_2_PLAN.md): de los datos del período a las etiquetas de la tanda.
 *
 * Vive acá y no en la pantalla para poder probarlo: las claves tienen que ser estables (son las que
 * recuerdan qué se imprimió) y los grupos tienen que sumar exactamente lo pedido.
 */
import {
  cleanDishText,
  elaborationDay,
  familyShortName,
  sizeNumber,
  splitDishName,
  type LabelData,
  type ProductionLabel,
} from '@verdeo/labels';
import { compareProducts } from '@verdeo/orders';

/** Una etiqueta de cocina tal como la da el servidor: una por plato. */
export interface KitchenLabelRow {
  abbreviation: string;
  composable: boolean;
  customerName: string | null;
  dish: string;
  side: string | null;
  sizeName: string | null;
}

/** Un grupo de la tanda: se tilda entero. */
export interface LabelGroup {
  /** Para ordenar los menús en la jerarquía de productos (PRODUCT_ORDER.md). */
  product?: { composable: boolean; familyName: string; variantName: string };
  id: string;
  kind: 'menu' | 'plato';
  labels: ProductionLabel[];
  title: string;
}

/** Las etiquetas de plato del período, agrupadas por variedad (el pie de la etiqueta). */
export function plateGroups(
  rows: readonly KitchenLabelRow[],
  productionDate: string,
): LabelGroup[] {
  const day = elaborationDay(productionDate);
  const groups = new Map<string, LabelGroup>();
  const seen = new Map<string, number>();
  for (const row of rows) {
    // El servidor separa por " / "; el menú también usa "|" entre el plato y su acompañamiento.
    const split = row.side
      ? { dish: cleanDishText(row.dish), side: cleanDishText(row.side) || null }
      : splitDishName(row.dish);
    const footer = `${row.abbreviation} ELAB # ${day}`;
    const groupId = `plato:${row.abbreviation}`;
    const group = groups.get(groupId) ?? {
      id: groupId,
      kind: 'plato' as const,
      labels: [],
      title: `Platos ${row.abbreviation}`,
    };
    groups.set(groupId, group);
    // La clave: variedad, plato y número de repetición, que no cambia con la fecha de elaboración.
    const base = `plato:${row.abbreviation}:${row.sizeName ?? ''}:${split.dish}|${split.side ?? ''}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    group.labels.push({
      dish: split.dish,
      footer,
      key: `${base}:${String(n)}`,
      kind: 'plato',
      side: split.side,
    });
  }
  return [...groups.values()];
}

/**
 * Las etiquetas de menú: una por vianda. Las variedades fijas, agrupadas por variedad y tamaño; los
 * Intuitivos, uno por cliente (llevan su nombre).
 */
export function menuGroups(rows: readonly LabelData[]): LabelGroup[] {
  const groups = new Map<string, LabelGroup>();
  const seen = new Set<string>();
  for (const row of rows) {
    // Con "una etiqueta por plato" activado en la versión anterior, cada vianda llega repetida.
    const key = `menu:${row.orderPublicNumber}:${row.familyName}:${row.variantName}:${String(row.unitIndex)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const size = sizeNumber(row.variantName);
    const groupId = row.composable
      ? `menu:intuitivo:${row.orderPublicNumber}`
      : `menu:${row.familyName}:${row.variantName}`;
    const title = row.composable
      ? `${row.customerDisplayName} · Intuitivo ${size}`
      : `${familyShortName(row.familyName)} ${size}`;
    const group = groups.get(groupId) ?? {
      id: groupId,
      kind: 'menu' as const,
      labels: [],
      product: {
        composable: row.composable,
        familyName: row.familyName,
        variantName: row.variantName,
      },
      title,
    };
    groups.set(groupId, group);
    group.labels.push({
      key,
      kind: 'menu',
      line: row.composable ? row.customerDisplayName : familyShortName(row.familyName),
      size,
    });
  }
  // La jerarquía de productos: Keto 400, Keto 250, Antiage, Real, Vegetariano, Intuitivos (éstos,
  // entre sí, por cliente).
  return [...groups.values()].sort(
    (left, right) =>
      (left.product && right.product ? compareProducts(left.product, right.product) : 0) ||
      left.title.localeCompare(right.title, 'es-AR', { numeric: true }),
  );
}

/** Una etiqueta suelta, para reponer: se repite `quantity` veces, con claves propias. */
export function looseLabels(
  template: ProductionLabel,
  quantity: number,
  already: readonly ProductionLabel[],
): ProductionLabel[] {
  const base = `suelta:${template.key.replace(/:\d+$/, '')}`;
  const used = already.filter((label) => label.key.startsWith(`${base}:`)).length;
  return Array.from({ length: quantity }, (_, index) => ({
    ...template,
    key: `${base}:${String(used + index)}`,
  }));
}

/**
 * Un grupo con etiquetas de más o de menos (el − / + de cada grupo). Las de menos se sacan del
 * final; las de más repiten las del grupo en orden y son sueltas: no se anotan como impresas.
 */
export function adjustGroup(group: LabelGroup, delta: number): ProductionLabel[] {
  if (delta <= 0) return group.labels.slice(0, Math.max(0, group.labels.length + delta));
  const extra = Array.from({ length: delta }, (_, index) => {
    const template = group.labels[index % group.labels.length];
    return template ? { ...template, key: `suelta:${group.id}:${String(index)}` } : null;
  }).filter((label): label is ProductionLabel => label !== null);
  return [...group.labels, ...extra];
}
