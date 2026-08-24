import type { KitchenSourceLine, KitchenSummary, Label, OrderStatus } from './types.js';

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
      | 'CYCLE_LOCKED'
      | 'INVALID_COMPOSITION'
      | 'INVALID_MONEY'
      | 'INVALID_QUANTITY'
      | 'INVALID_TRANSITION'
      | 'MISSING_REASON'
      | 'REVERSAL_CONFIRMATION_REQUIRED',
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

export function isOrderStatusReversal(from: OrderStatus, to: OrderStatus): boolean {
  return (
    (from === 'READY' && to === 'CONFIRMED') ||
    (from === 'DELIVERED' && to === 'READY') ||
    (from === 'CANCELLED' && to === 'CONFIRMED')
  );
}

export function assertOrderTransitionPolicy(input: {
  allowCycleOverride: boolean;
  confirmedReversal: boolean;
  cycleLocked: boolean;
  from: OrderStatus;
  reason?: string | undefined;
  to: OrderStatus;
}): void {
  assertOrderTransition(input.from, input.to);
  const reversal = isOrderStatusReversal(input.from, input.to);
  if (reversal && !input.confirmedReversal) {
    throw new OrderRuleError(
      'REVERSAL_CONFIRMATION_REQUIRED',
      'Status reversals require explicit confirmation',
    );
  }
  if ((reversal || input.to === 'CANCELLED') && !input.reason?.trim()) {
    throw new OrderRuleError(
      'MISSING_REASON',
      'Cancellations and reversals require an operational reason',
    );
  }
  const changesCommercialCommitment = input.to === 'CONFIRMED' || input.to === 'CANCELLED';
  if (input.cycleLocked && changesCommercialCommitment && !input.allowCycleOverride) {
    throw new OrderRuleError(
      'CYCLE_LOCKED',
      'The sales cycle is closed; this transition requires an authorized override',
    );
  }
}

interface ResolveCompositionInput {
  allowedDishes: ReadonlySet<string>;
  baseDishes: readonly string[];
  // Display name of the family whose kind is COMPOSABLE. Passed in as data so renaming the variety
  // never changes engine behaviour (ADR-030).
  composableFamilyName: string;
  familyName: string;
  mealsPerUnit: number;
  selectedDishes?: readonly string[];
}

export function resolveOrderComposition(input: ResolveCompositionInput): {
  dishSelections: readonly string[];
  productNameSnapshot: string;
} {
  if (!input.selectedDishes) {
    return { dishSelections: [], productNameSnapshot: input.familyName };
  }
  if (input.selectedDishes.length !== input.mealsPerUnit) {
    throw new OrderRuleError(
      'INVALID_COMPOSITION',
      `A composed unit requires exactly ${input.mealsPerUnit} dishes`,
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
    productNameSnapshot: isBase ? input.familyName : input.composableFamilyName,
  };
}

export function buildKitchenSummary(lines: readonly KitchenSourceLine[]): KitchenSummary {
  const base = new Map<string, KitchenSummary['base'][number]>();
  const custom: KitchenSummary['custom'] = [];
  let totalUnits = 0;

  for (const line of lines) {
    totalUnits += line.quantityUnits;
    // A line is custom because it carries its own composition or belongs to a composable family,
    // never because of what the family is called.
    if (line.dishSelections.length > 0 || line.composable) {
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

// Kitchen groups by variety; a label is printed per physical unit instead, so this expands each
// line's quantityUnits into that many identical labels rather than reusing buildKitchenSummary's
// aggregation. Ordered by order number so a batch of labels comes off the page order-by-order.
export function buildLabels(lines: readonly KitchenSourceLine[]): Label[] {
  const labels: Label[] = [];
  for (const line of [...lines].sort((left, right) =>
    left.orderPublicNumber.localeCompare(right.orderPublicNumber),
  )) {
    for (let unit = 0; unit < line.quantityUnits; unit += 1) {
      labels.push({
        customerDisplayName: line.composable ? line.customerDisplayName : null,
        familyName: line.familyName,
        orderPublicNumber: line.orderPublicNumber,
        variantName: line.variantName,
      });
    }
  }
  return labels;
}
