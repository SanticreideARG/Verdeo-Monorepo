import type { KitchenSourceLine, KitchenSummary, OrderStatus } from './types.js';

const transitions: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  CANCELLED: ['CONFIRMED'],
  CONFIRMED: ['READY', 'CANCELLED'],
  DELIVERED: ['READY'],
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  READY: ['CONFIRMED', 'DELIVERED'],
};

export class OrderRuleError extends Error {
  public constructor(
    public readonly code:
      'INVALID_COMPOSITION' | 'INVALID_MONEY' | 'INVALID_QUANTITY' | 'INVALID_TRANSITION',
    message: string,
  ) {
    super(message);
    this.name = 'OrderRuleError';
  }
}

export function calculateLineTotal(
  quantityUnits: number,
  unitPriceMinor: number,
  discountMinor = 0,
  surchargeMinor = 0,
): number {
  if (!Number.isSafeInteger(quantityUnits) || quantityUnits < 1) {
    throw new OrderRuleError('INVALID_QUANTITY', 'Quantity must be a positive safe integer');
  }
  if (
    ![unitPriceMinor, discountMinor, surchargeMinor].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    )
  ) {
    throw new OrderRuleError('INVALID_MONEY', 'Money values must be non-negative integers');
  }

  const total = quantityUnits * unitPriceMinor - discountMinor + surchargeMinor;
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new OrderRuleError('INVALID_MONEY', 'The resulting line total is invalid');
  }
  return total;
}

export function calculateOrderTotal(lineTotals: readonly number[]): number {
  if (lineTotals.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new OrderRuleError('INVALID_MONEY', 'Every line total must be a non-negative integer');
  }
  const total = lineTotals.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) {
    throw new OrderRuleError(
      'INVALID_MONEY',
      'The resulting order total exceeds the supported range',
    );
  }
  return total;
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!transitions[from].includes(to)) {
    throw new OrderRuleError('INVALID_TRANSITION', `Order cannot transition from ${from} to ${to}`);
  }
}

interface ResolveCompositionInput {
  allowedDishes: ReadonlySet<string>;
  baseDishes: readonly string[];
  familyName: string;
  selectedDishes?: readonly string[];
}

export function resolveOrderComposition(input: ResolveCompositionInput): {
  dishSelections: readonly string[];
  productNameSnapshot: string;
} {
  if (!input.selectedDishes) {
    return { dishSelections: [], productNameSnapshot: input.familyName };
  }
  if (input.selectedDishes.length !== 5) {
    throw new OrderRuleError(
      'INVALID_COMPOSITION',
      'An Intuitivo composition requires five dishes',
    );
  }
  if (input.selectedDishes.some((dish) => !input.allowedDishes.has(dish))) {
    throw new OrderRuleError(
      'INVALID_COMPOSITION',
      'Every selected dish must belong to the published universe for the variant',
    );
  }

  const isBase =
    input.baseDishes.length === input.selectedDishes.length &&
    input.baseDishes.every((dish, index) => dish === input.selectedDishes?.[index]);

  return {
    dishSelections: isBase ? [] : [...input.selectedDishes],
    productNameSnapshot: isBase ? input.familyName : 'Intuitivo',
  };
}

export function buildKitchenSummary(lines: readonly KitchenSourceLine[]): KitchenSummary {
  const base = new Map<string, KitchenSummary['base'][number]>();
  const custom: KitchenSummary['custom'] = [];
  let totalUnits = 0;

  for (const line of lines) {
    totalUnits += line.quantityUnits;
    if (line.dishSelections.length > 0 || line.familyName === 'Intuitivo') {
      custom.push({ ...line, sequence: custom.length + 1 });
      continue;
    }

    const key = `${line.familyName}\u0000${line.variantName}`;
    const current = base.get(key);
    base.set(key, {
      exceptions: [
        ...(current?.exceptions ?? []),
        ...(line.dietaryInstructions.length > 0
          ? [
              {
                customerDisplayName: line.customerDisplayName,
                dietaryInstructions: line.dietaryInstructions,
                orderPublicNumber: line.orderPublicNumber,
                quantityUnits: line.quantityUnits,
              },
            ]
          : []),
      ],
      familyName: line.familyName,
      quantityUnits: (current?.quantityUnits ?? 0) + line.quantityUnits,
      variantName: line.variantName,
    });
  }

  return {
    base: [...base.values()].sort(
      (left, right) =>
        left.familyName.localeCompare(right.familyName) ||
        left.variantName.localeCompare(right.variantName),
    ),
    custom,
    totalUnits,
  };
}
