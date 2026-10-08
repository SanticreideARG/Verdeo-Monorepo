import { describe, expect, it } from 'vitest';

import {
  cartItemsPayload,
  cartTotalMinor,
  estimatedItemsTotalMinor,
  linesToSubmit,
  pendingCartLine,
  type CartLine,
  type CartOffering,
} from './orderCart.js';

const keto: CartOffering = {
  composable: false,
  currency: 'ARS',
  familyName: 'Menú Keto',
  id: 'offering-keto',
  mealsPerUnit: 5,
  sizeName: '400',
  unitPriceMinor: 25_000,
};

const intuitivo: CartOffering = {
  composable: true,
  currency: 'ARS',
  familyName: 'Intuitivo',
  id: 'offering-intuitivo',
  mealsPerUnit: 5,
  sizeName: '250',
  unitPriceMinor: 30_000,
};

/** Lo que configuró la ciudad: hasta quince platos, proporcional y al quinientos. */
const LIMITES = {
  maxDishes: 15,
  pricing: {
    extraDishMinor: 0,
    factorBasisPoints: 10_000,
    mode: 'proporcional' as const,
    roundingMinor: 50_000,
  },
};

const CINCO = ['Guiso', 'Tarta', 'Wok', 'Milanesa', 'Ensalada'];

describe('pendingCartLine', () => {
  it('arma el renglón de una vianda estándar', () => {
    const pending = pendingCartLine(keto, 2, [], LIMITES);

    expect(pending).toEqual({
      line: {
        currency: 'ARS',
        label: 'Menú Keto 400',
        offeringId: 'offering-keto',
        quantityUnits: 2,
        selectedDishNames: [],
        unitPriceMinor: 25_000,
      },
    });
  });

  it('sin nada elegido no hay renglón ni error', () => {
    expect(pendingCartLine(null, 1, [], LIMITES)).toBeNull();
  });

  /*
   * El caso que justifica que esto no devuelva `null`. Descartar en silencio un Intuitivo a medio
   * elegir haría salir el pedido sin esa vianda, y quien la eligió cree que la cargó.
   */
  it('se planta cuando el Intuitivo no tiene todos sus platos', () => {
    const pending = pendingCartLine(intuitivo, 1, ['Guiso', 'Tarta'], LIMITES);

    expect(pending !== null && 'reason' in pending && pending.reason).toContain('5 platos');
  });

  /*
   * Más platos que el estándar es válido y su precio lo propone la regla; menos no, porque
   * cambiaría lo que se vende por el mismo precio del menú.
   */
  it('acepta más platos que el estándar y los cobra', () => {
    // Sin escalón: lo que se mira acá es la proporción, y el redondeo está cubierto aparte en el
    // paquete `orders`, que es la fuente de esta cuenta.
    const pending = pendingCartLine(intuitivo, 1, [...CINCO, 'Extra'], {
      ...LIMITES,
      pricing: { ...LIMITES.pricing, roundingMinor: 0 },
    });

    // 30.000 ÷ 5 × 6 = 36.000.
    expect(pending).toMatchObject({ line: { unitPriceMinor: 36_000 } });
  });

  it('se planta cuando se pasa del máximo de la ciudad', () => {
    const pending = pendingCartLine(intuitivo, 1, [...CINCO, 'Extra'], {
      ...LIMITES,
      maxDishes: 5,
    });

    expect(pending !== null && 'reason' in pending && pending.reason).toContain('hasta 5');
  });

  // Los platos que quedaron elegidos de un Intuitivo anterior no se cuelan en una vianda estándar.
  it('no le pone platos a una vianda que no se compone', () => {
    const pending = pendingCartLine(keto, 1, CINCO, LIMITES);

    expect(pending).toMatchObject({ line: { selectedDishNames: [] } });
  });
});

describe('linesToSubmit', () => {
  const linea: CartLine = {
    currency: 'ARS',
    label: 'Menú Keto 400',
    offeringId: 'offering-keto',
    quantityUnits: 1,
    selectedDishNames: [],
    unitPriceMinor: 25_000,
  };

  /*
   * Lo elegido y no agregado entra solo. Es lo que mantiene el pedido de una variedad —que son casi
   * todos— en elegir y guardar, sin un paso nuevo en el medio.
   */
  it('suma lo que quedó elegido arriba sin que haya que agregarlo', () => {
    const resultado = linesToSubmit([], pendingCartLine(keto, 3, [], LIMITES));

    expect(resultado).toMatchObject({ lines: [{ quantityUnits: 3 }] });
  });

  it('junta lo agregado con lo pendiente, en ese orden', () => {
    const resultado = linesToSubmit([linea], pendingCartLine(intuitivo, 1, CINCO, LIMITES));

    expect('lines' in resultado && resultado.lines.map((line) => line.label)).toEqual([
      'Menú Keto 400',
      'Intuitivo 250',
    ]);
  });

  it('un pedido sin nada no se manda', () => {
    const resultado = linesToSubmit([], null);

    expect('reason' in resultado && resultado.reason).toContain('al menos una');
  });

  it('el motivo de lo pendiente gana sobre lo que ya estaba agregado', () => {
    const resultado = linesToSubmit([linea], pendingCartLine(intuitivo, 1, ['Guiso'], LIMITES));

    expect('reason' in resultado && resultado.reason).toContain('platos');
  });

  // La misma variedad dos veces es un pedido válido, no un duplicado a fusionar.
  it('deja repetir la misma variedad en dos renglones', () => {
    const resultado = linesToSubmit([linea, linea], null);

    expect('lines' in resultado && resultado.lines).toHaveLength(2);
  });
});

describe('cartTotalMinor', () => {
  it('suma lo agregado y lo pendiente', () => {
    const linea: CartLine = {
      currency: 'ARS',
      label: 'Menú Keto 400',
      offeringId: 'offering-keto',
      quantityUnits: 2,
      selectedDishNames: [],
      unitPriceMinor: 25_000,
    };

    expect(cartTotalMinor([linea], pendingCartLine(intuitivo, 1, CINCO, LIMITES))).toBe(80_000);
  });

  // Un renglón incompleto no suma: mostrarlo en el total diría que ya está en el pedido.
  it('no cuenta lo que está a medio elegir', () => {
    expect(cartTotalMinor([], pendingCartLine(intuitivo, 1, ['Guiso'], LIMITES))).toBe(0);
  });
});

describe('cartItemsPayload', () => {
  it('manda los platos sólo cuando los hay', () => {
    const lines = [
      { ...pendingCartLine(keto, 1, [], LIMITES) } as { line: CartLine },
      { ...pendingCartLine(intuitivo, 1, CINCO, LIMITES) } as { line: CartLine },
    ].map((entry) => entry.line);

    expect(cartItemsPayload(lines)).toEqual([
      { offeringId: 'offering-keto', quantityUnits: 1 },
      { offeringId: 'offering-intuitivo', quantityUnits: 1, selectedDishNames: CINCO },
    ]);
  });
});

describe('estimatedItemsTotalMinor', () => {
  const regla = {
    extraDishMinor: 0,
    factorBasisPoints: 10_000,
    mode: 'proporcional' as const,
    roundingMinor: 50_000,
  };
  const ofertas = [
    { composable: true, id: 'i', mealsPerUnit: 5, unitPriceMinor: 8_500_000 },
    { composable: false, id: 'k', mealsPerUnit: 5, unitPriceMinor: 1_000_000 },
  ];
  const platos = (n: number) => Array.from({ length: n }, (_, i) => `Plato ${String(i)}`);

  it('cobra el precio del tamaño mientras se eligen los platos', () => {
    expect(
      estimatedItemsTotalMinor(
        [{ offeringId: 'i', quantityUnits: 2, selectedDishNames: platos(3) }],
        ofertas,
        regla,
      ),
    ).toBe(17_000_000);
  });

  it('cobra más con platos de más, según la regla, y no toca lo que no es componible', () => {
    expect(
      estimatedItemsTotalMinor(
        [
          { offeringId: 'i', quantityUnits: 1, selectedDishNames: platos(10) },
          { offeringId: 'k', quantityUnits: 1, selectedDishNames: [] },
        ],
        ofertas,
        regla,
      ),
    ).toBe(17_000_000 + 1_000_000);
  });
});
