import { describe, expect, it } from 'vitest';

import { buildMenuPayload, type MenuPayloadInput } from './menuPayload.js';

const fiveDishes = ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'].join('\n');

function input(overrides: Partial<MenuPayloadInput> = {}): MenuPayloadInput {
  return {
    alias: 'Semana del 24',
    closeAt: '2026-09-07T12:00',
    includeIntuitivo: false,
    offerings: [
      { description: 'Sin harinas', dishes: fiveDishes, familyName: 'Keto' },
      { description: '', dishes: fiveDishes, familyName: 'Vegetariano' },
    ],
    openAt: '2026-09-01T09:00',
    partialKitchenCutoffAt: '2026-09-05T20:00',
    sizePrices: [
      { sizeName: '250', unitPrice: '65000' },
      { sizeName: '400', unitPrice: '80000' },
    ],
    ...overrides,
  };
}

describe('buildMenuPayload', () => {
  it('generates one offering per variety and size', () => {
    const result = buildMenuPayload(input());

    expect(result.payload?.offerings).toHaveLength(4);
    expect(result.payload?.prices).toEqual([
      { currency: 'ARS', mealsPerUnit: 5, sizeName: '250', unitPriceMinor: 6_500_000 },
      { currency: 'ARS', mealsPerUnit: 5, sizeName: '400', unitPriceMinor: 8_000_000 },
    ]);
  });

  /**
   * Regression: Intuitivo used to be generated inside the same flatMap as the fixed varieties,
   * producing one composable offering per size. The API allows exactly one per menu, so the
   * request 400'd — and because the message never surfaced, the screen looked like it did nothing.
   */
  it('adds exactly one composable offering no matter how many sizes are priced', () => {
    const result = buildMenuPayload(input({ includeIntuitivo: true }));

    const composable = result.payload?.offerings.filter((offering) => offering.composable) ?? [];
    expect(composable).toHaveLength(1);
    expect(composable[0]).toMatchObject({ dishes: [], familyName: 'Intuitivo' });
    expect(result.payload?.offerings).toHaveLength(5);
  });

  it('leaves Intuitivo out entirely when the toggle is off', () => {
    const result = buildMenuPayload(input({ includeIntuitivo: false }));

    expect(result.payload?.offerings.some((offering) => offering.composable)).toBe(false);
  });

  /**
   * Regression: an empty date reached `new Date('').toISOString()`, which throws. It happened
   * while building the payload rather than inside the submit try/catch, so the handler died
   * silently — no message, no redirect, nothing.
   */
  it('reports missing dates instead of throwing on an invalid one', () => {
    expect(() => buildMenuPayload(input({ closeAt: '' }))).not.toThrow();
    expect(buildMenuPayload(input({ closeAt: '' })).error).toMatch(/fechas válidas/);
    expect(buildMenuPayload(input({ openAt: 'no es una fecha' })).error).toMatch(/fechas válidas/);
  });

  it('converts prices to minor units', () => {
    const result = buildMenuPayload(
      input({ sizePrices: [{ sizeName: '250', unitPrice: '65000.50' }] }),
    );

    expect(result.payload?.prices[0]?.unitPriceMinor).toBe(6_500_050);
  });

  it('requires exactly five dishes per variety', () => {
    const result = buildMenuPayload(
      input({
        offerings: [{ description: '', dishes: 'Uno\nDos', familyName: 'Keto' }],
      }),
    );

    expect(result.error).toMatch(/cinco platos/);
    expect(result.payload).toBeUndefined();
  });

  // Blank lines and stray whitespace are normal when pasting a menu out of WhatsApp.
  it('ignores blank lines and trims dishes when counting', () => {
    const result = buildMenuPayload(
      input({
        offerings: [
          {
            description: '  ',
            dishes: `\n  Uno  \nDos\n\nTres\nCuatro\nCinco\n`,
            familyName: 'Keto',
          },
        ],
      }),
    );

    expect(result.payload?.offerings[0]).toMatchObject({
      description: null,
      dishes: ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'],
    });
  });

  it('rejects a week with no priced size, and one with no alias', () => {
    expect(buildMenuPayload(input({ sizePrices: [] })).error).toMatch(/al menos un tamaño/);
    expect(
      buildMenuPayload(input({ sizePrices: [{ sizeName: '250', unitPrice: '  ' }] })).error,
    ).toMatch(/al menos un tamaño/);
    expect(buildMenuPayload(input({ alias: '   ' })).error).toMatch(/alias/);
  });
});
