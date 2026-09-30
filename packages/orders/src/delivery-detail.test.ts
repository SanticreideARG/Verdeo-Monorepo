import { describe, expect, it } from 'vitest';

import { deliveryDetail } from './delivery-detail.js';

describe('deliveryDetail', () => {
  it('nombra una vianda estándar por variedad y tamaño', () => {
    expect(
      deliveryDetail(
        [{ composable: false, familyName: 'Menú Keto', quantityUnits: 1, variantName: '400' }],
        'Ana',
      ),
    ).toBe('Menú Keto 400');
  });

  it('agrega el nombre en un Intuitivo, que es lo que dice su etiqueta', () => {
    // Dos Intuitivo del mismo tamaño son combinaciones distintas: sin el nombre no se sabe cuál es.
    expect(
      deliveryDetail(
        [{ composable: true, familyName: 'Intuitivo', quantityUnits: 1, variantName: '250' }],
        'Ana',
      ),
    ).toBe('Intuitivo 250 · Ana');
  });

  it('escribe las unidades sólo cuando son más de una', () => {
    expect(
      deliveryDetail(
        [{ composable: false, familyName: 'Menú Real', quantityUnits: 3, variantName: '250' }],
        'Ana',
      ),
    ).toBe('Menú Real 250 ×3');
  });

  it('junta los renglones de un pedido con varias viandas', () => {
    expect(
      deliveryDetail(
        [
          { composable: false, familyName: 'Menú Keto', quantityUnits: 2, variantName: '400' },
          { composable: true, familyName: 'Intuitivo', quantityUnits: 1, variantName: '250' },
        ],
        'Ana',
      ),
    ).toBe('Menú Keto 400 ×2 + Intuitivo 250 · Ana');
  });

  it('un pedido sin ítems no inventa nada', () => {
    expect(deliveryDetail([], 'Ana')).toBe('');
  });
});
