import { describe, expect, it } from 'vitest';

import { compareProducts, familyRank } from './product-order.js';

describe('jerarquía de productos', () => {
  it('Keto 400, Keto 250, Antiage, Real, Vegetariano, otras, Intuitivos', () => {
    const products = [
      { familyName: 'Intuitivo', variantName: '400' },
      { familyName: 'Menú Vegetariano', variantName: '250' },
      { familyName: 'Menú Especial', variantName: '400' },
      { familyName: 'Menú Real', variantName: '250' },
      { familyName: 'Menú Real', variantName: '400' },
      { familyName: 'Menú Anti-Age', variantName: '250' },
      { familyName: 'Menú Nuevo Keto', variantName: '250' },
      { familyName: 'Menú Nuevo Keto', variantName: '400' },
    ];

    expect(
      [...products].sort(compareProducts).map((p) => `${p.familyName} ${p.variantName}`),
    ).toEqual([
      'Menú Nuevo Keto 400',
      'Menú Nuevo Keto 250',
      'Menú Anti-Age 250',
      'Menú Real 400',
      'Menú Real 250',
      'Menú Vegetariano 250',
      'Menú Especial 400',
      'Intuitivo 400',
    ]);
  });

  it('reconoce la variedad sin importar mayúsculas, acentos ni guiones', () => {
    expect(familyRank('MENÚ ANTIAGE')).toBe(familyRank('Menú Anti-Age'));
    expect(familyRank('Menú Paleo & Keto')).toBe(0);
    // Un Intuitivo es el componible, se llame como se llame.
    expect(familyRank('Arma tu menú', true)).toBe(familyRank('Intuitivo'));
  });
});
