import { describe, expect, it } from 'vitest';

import { deliveryDetail } from './delivery-detail.js';

describe('deliveryDetail', () => {
  it('nombra una vianda por variedad y tamaño', () => {
    expect(
      deliveryDetail([{ familyName: 'Menú Keto', quantityUnits: 1, variantName: '400' }]),
    ).toBe('Menú Keto 400');
  });

  // Al repartidor le alcanza con saber qué caja entregar: los platos del Intuitivo no le sirven.
  it('un Intuitivo dice sólo variedad y tamaño, sin platos ni nombre', () => {
    expect(
      deliveryDetail([{ familyName: 'Intuitivo', quantityUnits: 1, variantName: '250' }]),
    ).toBe('Intuitivo 250');
  });

  it('escribe las unidades sólo cuando son más de una', () => {
    expect(
      deliveryDetail([{ familyName: 'Menú Real', quantityUnits: 3, variantName: '250' }]),
    ).toBe('Menú Real 250 ×3');
  });

  it('junta los renglones de un pedido con varias viandas', () => {
    expect(
      deliveryDetail([
        { familyName: 'Menú Keto', quantityUnits: 2, variantName: '400' },
        { familyName: 'Intuitivo', quantityUnits: 1, variantName: '250' },
      ]),
    ).toBe('Menú Keto 400 ×2 + Intuitivo 250');
  });

  it('un pedido sin ítems no inventa nada', () => {
    expect(deliveryDetail([])).toBe('');
  });
});
