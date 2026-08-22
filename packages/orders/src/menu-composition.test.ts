import { describe, expect, it } from 'vitest';

import { buildKitchenSummary, resolveOrderComposition } from './order-engine.js';

const universe = new Set(['A', 'B', 'C', 'D', 'E']);

describe('Composable variety identification', () => {
  it('labels a composed unit with whatever the composable family is called', () => {
    const result = resolveOrderComposition({
      allowedDishes: universe,
      baseDishes: ['A', 'B', 'C', 'D', 'E'],
      // Renaming the variety must change the label and nothing else (ADR-030).
      composableFamilyName: 'A tu gusto',
      familyName: 'Keto',
      mealsPerUnit: 5,
      selectedDishes: ['A', 'A', 'B', 'C', 'D'],
    });

    expect(result.productNameSnapshot).toBe('A tu gusto');
    expect(result.dishSelections).toEqual(['A', 'A', 'B', 'C', 'D']);
  });

  it('keeps the base variety when the selection matches its composition exactly', () => {
    const result = resolveOrderComposition({
      allowedDishes: universe,
      baseDishes: ['A', 'B', 'C', 'D', 'E'],
      composableFamilyName: 'Intuitivo',
      familyName: 'Keto',
      mealsPerUnit: 5,
      selectedDishes: ['A', 'B', 'C', 'D', 'E'],
    });

    expect(result.productNameSnapshot).toBe('Keto');
    expect(result.dishSelections).toEqual([]);
  });

  it('derives the required dish count from the size instead of assuming five', () => {
    expect(() =>
      resolveOrderComposition({
        allowedDishes: universe,
        baseDishes: ['A', 'B', 'C'],
        composableFamilyName: 'Intuitivo',
        familyName: 'Keto',
        mealsPerUnit: 3,
        selectedDishes: ['A', 'B', 'C', 'D', 'E'],
      }),
    ).toThrowError(/exactly 3 dishes/);
  });

  it('sends a composable line to the custom list even without its own selections', () => {
    const summary = buildKitchenSummary([
      {
        composable: true,
        customerDisplayName: 'Lola',
        dietaryInstructions: [],
        dishSelections: [],
        familyName: 'Cualquier nombre',
        orderPublicNumber: 'N00460',
        quantityUnits: 1,
        variantName: '400',
      },
    ]);

    // Kitchen must not consolidate a composed unit into a base requirement.
    expect(summary.base).toEqual([]);
    expect(summary.custom).toHaveLength(1);
  });

  it('consolidates a fixed variety even when it is named like the composable one', () => {
    const summary = buildKitchenSummary([
      {
        composable: false,
        customerDisplayName: 'Rosa',
        dietaryInstructions: [],
        dishSelections: [],
        familyName: 'Intuitivo',
        orderPublicNumber: 'N00461',
        quantityUnits: 2,
        variantName: '250',
      },
    ]);

    // The name no longer decides behaviour; the family's kind does.
    expect(summary.base).toHaveLength(1);
    expect(summary.custom).toEqual([]);
  });
});
