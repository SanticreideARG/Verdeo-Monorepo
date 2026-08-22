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
        { composable: true, dishes, familyName: 'Intuitivo', sizeName: '250' },
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
});
