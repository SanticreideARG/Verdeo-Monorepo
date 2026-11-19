import { describe, expect, it } from 'vitest';

import type { KitchenSummary } from './operations.js';
import { specialsText } from './specialsText.js';

const item = (fields: Partial<KitchenSummary['custom'][number]>) =>
  ({
    customerDisplayName: 'Fabiana Carbajal',
    dietaryInstructions: [],
    dishSelections: [],
    quantityUnits: 1,
    variantName: '400',
    ...fields,
  }) as KitchenSummary['custom'][number];

describe('especiales para WhatsApp (2026-11-18)', () => {
  it('título, un plato por renglón sin espacios adelante, y un renglón en blanco entre clientes', () => {
    const text = specialsText([
      item({
        dishSelections: ['Goulash de palomita con arroz de coliflor', 'Risotto de quinoa'],
        dishSources: [
          { familyName: 'Menú Real', slot: 1 },
          { familyName: 'Vegetariano', slot: 2 },
        ],
      }),
      item({
        customerDisplayName: 'Jose Bonadero',
        dishSelections: ['Canelones keto de ternera y muzza | filetto'],
        dishSources: [{ familyName: 'Nuevo Keto', slot: 1 }],
        quantityUnits: 2,
        variantName: '250',
      }),
    ]);
    expect(text).toBe(
      [
        '400 Fabiana Carbajal',
        'Goulash de palomita con arroz de coliflor (Real)',
        'Risotto de quinoa (Vegetariano)',
        '',
        '250 Jose Bonadero × 2',
        'Canelones keto de ternera y muzza | filetto (Nuevo Keto)',
      ].join('\n'),
    );
    expect(text.split('\n').every((line) => line === line.trimStart())).toBe(true);
  });

  it('las indicaciones van al final de su especial', () => {
    expect(specialsText([item({ dietaryInstructions: ['Sin cebolla', 'Sin sal'] })])).toBe(
      '400 Fabiana Carbajal\nSin cebolla · Sin sal',
    );
  });
});
