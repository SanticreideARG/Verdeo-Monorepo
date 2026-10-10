import { describe, expect, it } from 'vitest';

import type { MenuOffering } from './operations.js';
import { matchMenuOffering, menuNameKey, orderItemsSummary, planRepeat } from './orderRepeat.js';

const oferta = (
  id: string,
  familyName: string,
  size: string,
  extra: Partial<MenuOffering> = {},
): MenuOffering => ({
  composable: false,
  currency: 'ARS',
  description: null,
  dishes: [],
  familyName,
  id,
  mealsPerUnit: 5,
  priceOverridden: false,
  sizeName: `${size} g`,
  unitPriceMinor: 8_500_000,
  variantName: size,
  ...extra,
});

// El menú de esta semana: los ids son otros que los de la semana del pedido anterior.
const menu = [
  oferta('keto-400', 'Menú Nuevo Keto', '400'),
  oferta('keto-250', 'Menú Nuevo Keto', '250'),
  oferta('real-400', 'Menú Real', '400'),
  oferta('intuitivo-400', 'Menú Intuitivo', '400', { composable: true }),
];

describe('menuNameKey', () => {
  it('compara sin tildes, mayúsculas ni el "Menú" de adelante', () => {
    expect(menuNameKey('Menú  Nuevo Keto')).toBe(menuNameKey('nuevo keto'));
  });
});

describe('matchMenuOffering', () => {
  it('encuentra la oferta de esta semana por variedad y tamaño', () => {
    expect(matchMenuOffering('Menú Nuevo Keto', '400', menu)?.id).toBe('keto-400');
    expect(matchMenuOffering('menu nuevo keto', '400 g', menu)?.id).toBe('keto-400');
  });

  it('acepta un nombre parcial cuando hay una sola variedad que calza', () => {
    expect(matchMenuOffering('Keto', '250', menu)?.id).toBe('keto-250');
  });

  it('no adivina sin tamaño, ni cuando la variedad no existe', () => {
    expect(matchMenuOffering('Menú Nuevo Keto', null, menu)).toBeNull();
    expect(matchMenuOffering('Menú Vegano', '400', menu)).toBeNull();
  });

  // "Menú" calza con todas: elegir una sería inventar.
  it('con más de una variedad posible no elige ninguna', () => {
    expect(matchMenuOffering('Menú', '400', menu)).toBeNull();
  });
});

describe('planRepeat', () => {
  it('repite lo que sigue en el menú y avisa lo que ya no está', () => {
    const plan = planRepeat(
      [
        { productName: 'Menú Nuevo Keto', quantityUnits: 2, variantName: '400' },
        { productName: 'Menú Vegano', quantityUnits: 1, variantName: '400' },
      ],
      menu,
    );
    expect(plan.lines.map((line) => [line.offering.id, line.quantityUnits])).toEqual([
      ['keto-400', 2],
    ]);
    expect(plan.missing).toEqual(['Menú Vegano 400']);
    expect(plan.composable).toBeNull();
  });

  // Los platos del Intuitivo son los de aquella semana: se vuelven a elegir.
  it('deja el Intuitivo para elegir sus platos en lugar de copiarlos', () => {
    const plan = planRepeat(
      [{ productName: 'Menú Intuitivo', quantityUnits: 1, variantName: '400' }],
      menu,
    );
    expect(plan.composable?.offering.id).toBe('intuitivo-400');
    expect(plan.lines).toEqual([]);
  });

  it('un segundo Intuitivo se informa en lugar de perderse callado', () => {
    const plan = planRepeat(
      [
        { productName: 'Menú Intuitivo', quantityUnits: 1, variantName: '400' },
        { productName: 'Menú Intuitivo', quantityUnits: 1, variantName: '400' },
      ],
      menu,
    );
    expect(plan.missing).toHaveLength(1);
  });
});

describe('orderItemsSummary', () => {
  it('resume el pedido en una línea', () => {
    expect(
      orderItemsSummary([
        { productName: 'Menú Nuevo Keto', quantityUnits: 2, variantName: '400' },
        { productName: 'Menú Real', quantityUnits: 1, variantName: '250' },
      ]),
    ).toBe('Menú Nuevo Keto 400 × 2 · Menú Real 250 × 1');
  });
});
