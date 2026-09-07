import { describe, expect, it } from 'vitest';

import {
  assertOrderTransition,
  assertOrderTransitionPolicy,
  buildKitchenSummary,
  buildLabels,
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
        deliveryDate: '2026-08-28',
        deliveryZone: 'Centro',
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
        deliveryDate: '2026-08-28',
        deliveryZone: 'Centro',
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
        deliveryDate: '2026-08-28',
        deliveryZone: 'Centro',
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
        // Tres unidades repartidas en dos pedidos: las dos cifras dicen cosas distintas y cocina
        // necesita las dos — una para cocinar, otra para saber cuántos paquetes arma.
        orderCount: 2,
        quantityUnits: 3,
        variantName: '250',
      },
    ]);
    expect(summary.custom[0]).toMatchObject({ orderPublicNumber: 'N00455', sequence: 1 });
    expect(summary.totalOrders).toBe(3);
  });

  it('suma las porciones de cada plato de los Intuitivos', () => {
    const summary = buildKitchenSummary([
      {
        composable: true,
        customerDisplayName: 'Lola',
        deliveryDate: '2026-08-28',
        deliveryZone: 'Centro',
        dietaryInstructions: [],
        dishSelections: ['Pollo al verdeo', 'Tarta', 'Wok', 'Guiso', 'Milanesa'],
        familyName: 'Intuitivo',
        orderPublicNumber: 'N00455',
        // Dos unidades del mismo Intuitivo necesitan el doble de porciones de cada plato.
        quantityUnits: 2,
        variantName: '400',
      },
      {
        composable: true,
        customerDisplayName: 'Rosa',
        deliveryDate: '2026-08-28',
        deliveryZone: 'Centro',
        dietaryInstructions: [],
        dishSelections: ['Pollo al verdeo', 'Ensalada', 'Wok', 'Guiso', 'Tarta'],
        familyName: 'Intuitivo',
        orderPublicNumber: 'N00456',
        quantityUnits: 1,
        variantName: '250',
      },
    ]);

    // De mayor a menor: lo que más se repite es lo primero que hay que comprar.
    expect(summary.dishTally.slice(0, 4)).toEqual([
      { dishName: 'Guiso', portions: 3 },
      { dishName: 'Pollo al verdeo', portions: 3 },
      { dishName: 'Tarta', portions: 3 },
      { dishName: 'Wok', portions: 3 },
    ]);
    expect(summary.dishTally.find((entry) => entry.dishName === 'Ensalada')?.portions).toBe(1);
    expect(summary.dishTally.find((entry) => entry.dishName === 'Milanesa')?.portions).toBe(2);
  });

  it('expande cada línea en una etiqueta por unidad física, siempre con el nombre del cliente', () => {
    const labels = buildLabels([
      {
        composable: false,
        deliveryDate: '2026-08-28',
        deliveryZone: 'Centro',
        customerDisplayName: 'Rosa',
        dietaryInstructions: [],
        dishSelections: [],
        familyName: 'Keto',
        orderPublicNumber: 'N00453',
        quantityUnits: 2,
        variantName: '250',
      },
      {
        composable: true,
        deliveryDate: '2026-08-28',
        deliveryZone: 'Centro',
        customerDisplayName: 'Lola',
        dietaryInstructions: [],
        dishSelections: ['A', 'A', 'B', 'C', 'D'],
        familyName: 'Intuitivo',
        orderPublicNumber: 'N00455',
        quantityUnits: 1,
        variantName: '400',
      },
    ]);

    expect(labels).toHaveLength(3);
    // El nombre va en todas y no sólo en las del Intuitivo: es lo que se lee para saber a quién va
    // cada vianda, así que una etiqueta sin nombre no sirve para repartir.
    const rosa = {
      customerDisplayName: 'Rosa',
      deliveryDate: '2026-08-28',
      deliveryZone: 'Centro',
      dietaryInstructions: [],
      familyName: 'Keto',
      orderPublicNumber: 'N00453',
      unitTotal: 2,
      variantName: '250',
    };
    // Las dos unidades del mismo renglón salen numeradas: con dos viandas iguales sobre la mesa,
    // "1 de 2" es lo que dice si están las dos.
    expect(labels.filter((label) => label.orderPublicNumber === 'N00453')).toEqual([
      { ...rosa, unitIndex: 1 },
      { ...rosa, unitIndex: 2 },
    ]);
    // Una sola unidad igual se numera, y el renderizador decide no imprimirla.
    expect(labels.find((label) => label.orderPublicNumber === 'N00455')).toEqual({
      customerDisplayName: 'Lola',
      deliveryDate: '2026-08-28',
      deliveryZone: 'Centro',
      dietaryInstructions: [],
      familyName: 'Intuitivo',
      orderPublicNumber: 'N00455',
      unitIndex: 1,
      unitTotal: 1,
      variantName: '400',
    });
  });
});
