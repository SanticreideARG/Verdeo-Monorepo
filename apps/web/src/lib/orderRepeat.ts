import type { MenuOffering, OrderSummary } from './operations.js';

/** Para comparar nombres de menú: sin mayúsculas, sin tildes, sin "Menú" adelante, sin espacios de más. */
export function menuNameKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^menu\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Los dígitos del tamaño ("400 g", "400") alcanzan para compararlo. */
function sizeKey(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits || menuNameKey(value);
}

/**
 * La oferta de esta semana que corresponde a una variedad y un tamaño escritos.
 *
 * Primero por nombre igual; si no, por nombre que contiene al otro, pero sólo si hay una sola así
 * (con dos candidatas no se adivina). Null es una respuesta válida: que una persona elija.
 */
export function matchMenuOffering(
  familyName: string | null,
  size: string | null,
  offerings: readonly MenuOffering[],
): MenuOffering | null {
  if (!familyName || !size) return null;
  const wanted = menuNameKey(familyName);
  const wantedSize = sizeKey(size);
  const sameSize = offerings.filter(
    (offering) =>
      sizeKey(offering.variantName) === wantedSize || sizeKey(offering.sizeName) === wantedSize,
  );
  const exact = sameSize.find((offering) => menuNameKey(offering.familyName) === wanted);
  if (exact) return exact;
  const partial = sameSize.filter((offering) => {
    const key = menuNameKey(offering.familyName);
    return key.includes(wanted) || wanted.includes(key);
  });
  return partial.length === 1 ? (partial[0] ?? null) : null;
}

export interface RepeatPlan {
  /** Un Intuitivo: va al selector, porque sus platos son de esa semana y hay que elegirlos. */
  composable: { offering: MenuOffering; quantityUnits: number } | null;
  /** Lo que se repite tal cual. */
  lines: { offering: MenuOffering; quantityUnits: number }[];
  /** Lo que el cliente pidió y no está en el menú de esta semana. */
  missing: string[];
}

/**
 * Cómo repetir un pedido anterior con el menú de esta semana.
 *
 * Las ofertas cambian de id cada semana, así que se empareja por variedad y tamaño. Los platos de un
 * Intuitivo no se copian —son los de aquella semana—: el Intuitivo queda elegido para que se
 * marquen los de ahora. Si hubiera más de uno, el segundo se informa en lugar de perderse callado.
 */
export function planRepeat(
  items: readonly Pick<
    OrderSummary['items'][number],
    'productName' | 'quantityUnits' | 'variantName'
  >[],
  offerings: readonly MenuOffering[],
): RepeatPlan {
  const plan: RepeatPlan = { composable: null, lines: [], missing: [] };
  for (const item of items) {
    const offering = matchMenuOffering(item.productName, item.variantName, offerings);
    if (!offering) {
      plan.missing.push(`${item.productName} ${item.variantName}`);
    } else if (offering.composable) {
      if (plan.composable)
        plan.missing.push(`${item.productName} ${item.variantName} (otro Intuitivo)`);
      else plan.composable = { offering, quantityUnits: item.quantityUnits };
    } else {
      plan.lines.push({ offering, quantityUnits: item.quantityUnits });
    }
  }
  return plan;
}

/** "Menú Keto 400 × 2 · Menú Real 250 × 1": lo que se va a repetir, en una línea. */
export function orderItemsSummary(
  items: readonly Pick<
    OrderSummary['items'][number],
    'productName' | 'quantityUnits' | 'variantName'
  >[],
): string {
  return items
    .map((item) => `${item.productName} ${item.variantName} × ${String(item.quantityUnits)}`)
    .join(' · ');
}
