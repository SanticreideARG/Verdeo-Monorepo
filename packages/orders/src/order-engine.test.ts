import { describe, expect, it } from 'vitest';

import {
  assertOrderTransition,
  buildKitchenSummary,
  calculateLineTotal,
  calculateOrderTotal,
  OrderRuleError,
  resolveOrderComposition,
} from './order-engine.js';

describe('order engine', () => {
  it('calculates totals with integers only', () => {
    expect(calculateLineTotal(2, 12_500, 500, 250)).toBe(24_750);
    expect(() => calculateLineTotal(1.5, 12_500)).toThrow(OrderRuleError);
    expect(calculateOrderTotal([24_750, 10_000])).toBe(34_750);
    expect(() => calculateOrderTotal([Number.MAX_SAFE_INTEGER, 1])).toThrow(OrderRuleError);
  });

  it('enforces the documented state machine', () => {
    expect(() => assertOrderTransition('DRAFT', 'CONFIRMED')).not.toThrow();
    expect(() => assertOrderTransition('DELIVERED', 'CANCELLED')).toThrowError(/cannot transition/);
  });

  it('turns a changed base composition into Intuitivo and permits repetitions', () => {
    const result = resolveOrderComposition({
      allowedDishes: new Set(['A', 'B', 'C', 'D', 'E']),
      baseDishes: ['A', 'B', 'C', 'D', 'E'],
      familyName: 'Real',
      selectedDishes: ['A', 'A', 'C', 'D', 'E'],
    });

    expect(result.productNameSnapshot).toBe('Intuitivo');
    expect(result.dishSelections).toEqual(['A', 'A', 'C', 'D', 'E']);
  });

  it('rejects dishes outside the same variant universe', () => {
    expect(() =>
      resolveOrderComposition({
        allowedDishes: new Set(['A', 'B', 'C', 'D', 'E']),
        baseDishes: ['A', 'B', 'C', 'D', 'E'],
        familyName: 'Keto',
        selectedDishes: ['A', 'B', 'C', 'D', 'F'],
      }),
    ).toThrowError(/published universe/);
  });

  it('consolidates base quantities and keeps custom units identifiable', () => {
    const summary = buildKitchenSummary([
      {
        customerDisplayName: 'Rosa',
        dietaryInstructions: ['Sin cebolla'],
        dishSelections: [],
        familyName: 'Keto',
        orderPublicNumber: 'N00453',
        quantityUnits: 2,
        variantName: '250',
      },
      {
        customerDisplayName: 'Juan',
        dietaryInstructions: [],
        dishSelections: [],
        familyName: 'Keto',
        orderPublicNumber: 'N00454',
        quantityUnits: 1,
        variantName: '250',
      },
      {
        customerDisplayName: 'Lola',
        dietaryInstructions: [],
        dishSelections: ['A', 'A', 'B', 'C', 'D'],
        familyName: 'Intuitivo',
        orderPublicNumber: 'N00455',
        quantityUnits: 1,
        variantName: '400',
      },
    ]);

    expect(summary.totalUnits).toBe(4);
    expect(summary.base).toEqual([
      {
        exceptions: [
          {
            customerDisplayName: 'Rosa',
            dietaryInstructions: ['Sin cebolla'],
            orderPublicNumber: 'N00453',
            quantityUnits: 2,
          },
        ],
        familyName: 'Keto',
        quantityUnits: 3,
        variantName: '250',
      },
    ]);
    expect(summary.custom[0]).toMatchObject({ orderPublicNumber: 'N00455', sequence: 1 });
  });
});
