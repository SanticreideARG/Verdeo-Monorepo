/**
 * Builds the create/update request body for a weekly menu from the "Configurar la semana" form.
 *
 * Extracted from MenuBuilderPage so it can be tested directly: every bug this screen has shipped
 * lived in this transformation, not in its markup — an empty date crashing `toISOString()`, and a
 * composable offering generated once per size when the API allows exactly one per menu.
 *
 * Returns either the payload or the message to show; it never touches component state, so a caller
 * decides how to surface the error.
 */

export interface OfferingDraft {
  description: string;
  /** One dish per line, as typed. */
  dishes: string;
  familyName: string;
}

export interface SizePriceDraft {
  sizeName: string;
  /** As typed, in whole currency units — converted to minor units here. */
  unitPrice: string;
}

export interface MenuPayloadInput {
  alias: string;
  closeAt: string;
  includeIntuitivo: boolean;
  offerings: readonly OfferingDraft[];
  openAt: string;
  partialKitchenCutoffAt: string;
  sizePrices: readonly SizePriceDraft[];
}

export interface MenuOfferingPayload {
  composable: boolean;
  description: string | null;
  dishes: string[];
  familyName: string;
  sizeName: string;
}

export interface MenuPayload {
  alias: string;
  closeAt: string;
  offerings: MenuOfferingPayload[];
  openAt: string;
  partialKitchenCutoffAt: string;
  prices: { currency: string; mealsPerUnit: number; sizeName: string; unitPriceMinor: number }[];
}

// Both keys are declared on both branches so a caller can narrow on either one — checking
// `result.payload` and checking `result.error` are equally valid ways in.
export type MenuPayloadResult =
  { error: string; payload?: undefined } | { error?: undefined; payload: MenuPayload };

export const DISHES_PER_VARIETY = 5;

/**
 * `new Date('').toISOString()` throws. Validating up front is what keeps an empty date field from
 * killing the submit handler with no message and no redirect — the failure looked like the button
 * simply did nothing.
 */
export function toIsoOrNull(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function buildMenuPayload(input: MenuPayloadInput): MenuPayloadResult {
  const openAt = toIsoOrNull(input.openAt);
  const partialKitchenCutoffAt = toIsoOrNull(input.partialKitchenCutoffAt);
  const closeAt = toIsoOrNull(input.closeAt);
  if (!openAt || !partialKitchenCutoffAt || !closeAt) {
    return { error: 'Completá apertura, parcial de cocina y cierre con fechas válidas.' };
  }

  const prices = input.sizePrices
    .filter((price) => price.sizeName.trim() && price.unitPrice.trim())
    .map((price) => ({
      currency: 'ARS',
      mealsPerUnit: 5,
      sizeName: price.sizeName.trim(),
      unitPriceMinor: Math.round(Number(price.unitPrice) * 100),
    }));
  if (prices.length === 0) return { error: 'Definí al menos un tamaño con su precio.' };

  const varieties = input.offerings.map((offering) => ({
    composable: false,
    description: offering.description.trim() ? offering.description.trim() : null,
    dishes: offering.dishes
      .split('\n')
      .map((dish) => dish.trim())
      .filter(Boolean),
    familyName: offering.familyName,
  }));
  if (varieties.some((variety) => variety.dishes.length !== DISHES_PER_VARIETY)) {
    return { error: 'Cada variedad necesita exactamente cinco platos.' };
  }
  if (!input.alias.trim()) return { error: 'Ponele un alias a la semana.' };

  // Size and variety are unrelated axes for a *fixed* offering, so one row per (variety, size) pair
  // is generated here rather than asked for per option. Intuitivo is different: it is priced by
  // whatever size the customer picks at order time (via weeklyMenuPrices, not its own offering
  // row), so the API allows at most one composable offering per menu, period. It is pushed once
  // after the flatMap — generating it inside the flatMap yields one per size and the request 400s
  // with "Solo puede haber un menú personalizado (Intuitivo) por semana".
  const offerings: MenuOfferingPayload[] = varieties.flatMap((variety) =>
    prices.map((price) => ({ ...variety, sizeName: price.sizeName })),
  );
  if (input.includeIntuitivo) {
    offerings.push({
      composable: true,
      description: null,
      dishes: [],
      familyName: 'Intuitivo',
      sizeName: prices[0]?.sizeName ?? '',
    });
  }

  return {
    payload: {
      alias: input.alias,
      closeAt,
      offerings,
      openAt,
      partialKitchenCutoffAt,
      prices,
    },
  };
}
