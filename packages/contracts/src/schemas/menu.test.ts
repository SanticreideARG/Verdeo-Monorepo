import { describe, expect, it } from 'vitest';

import { MenuCreateRequestSchema } from './operations.js';

const cycle = {
  alias: 'Semana 34',
  closeAt: '2026-08-26T22:00:00.000Z',
  openAt: '2026-08-20T12:00:00.000Z',
  partialKitchenCutoffAt: '2026-08-25T23:00:00.000Z',
};

const dishes = ['A', 'B', 'C', 'D', 'E'];

describe('weekly menu contract', () => {
  it('prices the week by size and defaults a variety to fixed composition', () => {
    const result = MenuCreateRequestSchema.parse({
      ...cycle,
      offerings: [{ dishes, familyName: 'Keto', sizeName: '250' }],
      prices: [{ sizeName: '250', unitPriceMinor: 25_000 }],
    });

    expect(result.prices[0]?.currency).toBe('ARS');
    expect(result.offerings[0]?.composable).toBe(false);
    // The offering carries no price of its own unless an operator sets an override.
    expect(result.offerings[0]).not.toHaveProperty('unitPriceMinor');
  });

  it('rejects a variety whose size has no price for the week', () => {
    const result = MenuCreateRequestSchema.safeParse({
      ...cycle,
      offerings: [{ dishes, familyName: 'Keto', sizeName: '400' }],
      prices: [{ sizeName: '250', unitPriceMinor: 25_000 }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects two prices for the same size', () => {
    const result = MenuCreateRequestSchema.safeParse({
      ...cycle,
      offerings: [{ dishes, familyName: 'Keto', sizeName: '250' }],
      prices: [
        { sizeName: '250', unitPriceMinor: 25_000 },
        { sizeName: '250', unitPriceMinor: 27_000 },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('accepts several varieties of one size sharing a single price', () => {
    const result = MenuCreateRequestSchema.parse({
      ...cycle,
      offerings: [
        { dishes, familyName: 'Keto', sizeName: '250' },
        { dishes, familyName: 'Real', sizeName: '250' },
        { composable: true, dishes: [], familyName: 'Intuitivo', sizeName: '250' },
      ],
      prices: [{ sizeName: '250', unitPriceMinor: 25_000 }],
    });

    expect(result.offerings).toHaveLength(3);
    expect(result.prices).toHaveLength(1);
    expect(result.offerings[2]?.composable).toBe(true);
  });

  it('keeps a deliberate per-variety override', () => {
    const result = MenuCreateRequestSchema.parse({
      ...cycle,
      offerings: [{ dishes, familyName: 'Keto', overridePriceMinor: 28_000, sizeName: '250' }],
      prices: [{ sizeName: '250', unitPriceMinor: 25_000 }],
    });

    expect(result.offerings[0]?.overridePriceMinor).toBe(28_000);
  });

  it('rejects a composable offering that submits its own five dishes', () => {
    const result = MenuCreateRequestSchema.safeParse({
      ...cycle,
      offerings: [{ composable: true, dishes, familyName: 'Intuitivo', sizeName: '250' }],
      prices: [{ sizeName: '250', unitPriceMinor: 25_000 }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a fixed offering with fewer than five dishes', () => {
    const result = MenuCreateRequestSchema.safeParse({
      ...cycle,
      offerings: [{ dishes: dishes.slice(0, 3), familyName: 'Keto', sizeName: '250' }],
      prices: [{ sizeName: '250', unitPriceMinor: 25_000 }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects more than one composable family in the same week', () => {
    const result = MenuCreateRequestSchema.safeParse({
      ...cycle,
      offerings: [
        { composable: true, dishes: [], familyName: 'Intuitivo', sizeName: '250' },
        { composable: true, dishes: [], familyName: 'Otro', sizeName: '250' },
      ],
      prices: [{ sizeName: '250', unitPriceMinor: 25_000 }],
    });

    expect(result.success).toBe(false);
  });

  /**
   * La regla se contaba por oferta, y una oferta es (familia, tamaño): Intuitivo cargado en 250
   * hacía rechazar el de 400, así que quedaba con un solo tamaño mientras el resto tenía los dos —
   * y en el formulario de pedido aparecía sólo "Intuitivo 250". Por ADR-030 el precio depende del
   * tamaño y no de la variedad; no hay motivo para que ésta tenga menos tamaños.
   */
  it('accepts the composable variety in every size', () => {
    const result = MenuCreateRequestSchema.safeParse({
      ...cycle,
      offerings: [
        { composable: true, dishes: [], familyName: 'Intuitivo', sizeName: '250' },
        { composable: true, dishes: [], familyName: 'Intuitivo', sizeName: '400' },
      ],
      prices: [
        { sizeName: '250', unitPriceMinor: 25_000 },
        { sizeName: '400', unitPriceMinor: 40_000 },
      ],
    });

    expect(result.success).toBe(true);
  });

  // Antes lo impedía de rebote la regla anterior; ahora que cuenta familias, se dice aparte.
  it('rejects the same variety twice in the same size', () => {
    const result = MenuCreateRequestSchema.safeParse({
      ...cycle,
      offerings: [
        { composable: true, dishes: [], familyName: 'Intuitivo', sizeName: '250' },
        { composable: true, dishes: [], familyName: 'Intuitivo', sizeName: '250' },
      ],
      prices: [{ sizeName: '250', unitPriceMinor: 25_000 }],
    });

    expect(result.success).toBe(false);
  });
});
