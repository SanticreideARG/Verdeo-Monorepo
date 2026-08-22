import { describe, expect, it } from 'vitest';

import {
  assertOrderTransition,
  assertOrderTransitionPolicy,
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

  it('requires explicit confirmation and a reason for reversals', () => {
    expect(() =>
      assertOrderTransitionPolicy({
        allowCycleOverride: true,
        confirmedReversal: true,
        cycleLocked: true,
        from: 'READY',
        reason: 'Corrección operativa',
        to: 'CONFIRMED',
      }),
    ).not.toThrow();
    expect(() =>
      assertOrderTransitionPolicy({
        allowCycleOverride: true,
        confirmedReversal: true,
        cycleLocked: false,
        from: 'READY',
        to: 'CONFIRMED',
      }),
    ).toThrowError(/reason/);
  });

  it('locks commercial transitions after close but allows forward fulfillment', () => {
    expect(() =>
      assertOrderTransitionPolicy({
        allowCycleOverride: false,
        confirmedReversal: false,
        cycleLocked: true,
        from: 'DRAFT',
        to: 'CONFIRMED',
      }),
    ).toThrowError(/closed/);
    expect(() =>
      assertOrderTransitionPolicy({
        allowCycleOverride: false,
        confirmedReversal: false,
        cycleLocked: true,
        from: 'CONFIRMED',
        to: 'READY',
      }),
    ).not.toThrow();
  });

  it('labels a changed base composition with the composable family and permits repetitions', () => {
    const result = resolveOrderComposition({
      allowedDishes: new Set(['A', 'B', 'C', 'D', 'E']),
      baseDishes: ['A', 'B', 'C', 'D', 'E'],
      composableFamilyName: 'Intuitivo',
      familyName: 'Real',
      mealsPerUnit: 5,
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
        composableFamilyName: 'Intuitivo',
        familyName: 'Keto',
        mealsPerUnit: 5,
        selectedDishes: ['A', 'B', 'C', 'D', 'F'],
      }),
    ).toThrowError(/published universe/);
  });

  it('consolidates base quantities and keeps custom units identifiable', () => {
    const summary = buildKitchenSummary([
      {
        composable: false,
        customerDisplayName: 'Rosa',
        dietaryInstructions: ['Sin cebolla'],
        dishSelections: [],
        familyName: 'Keto',
        orderPublicNumber: 'N00453',
        quantityUnits: 2,
        variantName: '250',
      },
      {
        composable: false,
        customerDisplayName: 'Juan',
        dietaryInstructions: [],
        dishSelections: [],
        familyName: 'Keto',
        orderPublicNumber: 'N00454',
        quantityUnits: 1,
        variantName: '250',
      },
      {
        composable: true,
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
