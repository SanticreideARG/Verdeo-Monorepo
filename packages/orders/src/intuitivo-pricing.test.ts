import { describe, expect, it } from 'vitest';

import { intuitivoUnitPriceMinor, type IntuitivoPricingRule } from './intuitivo-pricing.js';

/** Al quinientos más cercano, que es el redondeo que pidió la operación. */
const base: IntuitivoPricingRule = {
  extraDishMinor: 0,
  factorBasisPoints: 10_000,
  mode: 'proporcional',
  roundingMinor: 50_000,
};

// $25.000 por cinco platos: $5.000 el plato.
const CINCO_PLATOS_MINOR = 2_500_000;

describe('intuitivoUnitPriceMinor', () => {
  /*
   * El caso que más importa: con la cantidad estándar el precio es el del menú, intacto.
   *
   * Ese precio lo publicó alguien. Pasarlo por la regla y el redondeo lo cambiaría como efecto
   * secundario del cálculo de otra cosa, y de golpe el menú cobra distinto de lo que muestra.
   */
  it('no toca el precio cuando la cantidad es la estándar', () => {
    expect(
      intuitivoUnitPriceMinor({
        baseDishes: 5,
        basePriceMinor: 2_512_345,
        dishes: 5,
        rule: base,
      }),
    ).toBe(2_512_345);
  });

  it('cobra la parte proporcional por plato', () => {
    // 6 × $5.000 = $30.000, que ya cae en el escalón.
    expect(
      intuitivoUnitPriceMinor({
        baseDishes: 5,
        basePriceMinor: CINCO_PLATOS_MINOR,
        dishes: 6,
        rule: base,
      }),
    ).toBe(3_000_000);
  });

  it('aplica el coeficiente sobre lo proporcional', () => {
    // 6 × $5.000 × 0,95 = $28.500.
    expect(
      intuitivoUnitPriceMinor({
        baseDishes: 5,
        basePriceMinor: CINCO_PLATOS_MINOR,
        dishes: 6,
        rule: { ...base, factorBasisPoints: 9_500, mode: 'coeficiente' },
      }),
    ).toBe(2_850_000);
  });

  it('suma un monto fijo por cada plato de más', () => {
    // $25.000 + 2 × $4.000 = $33.000.
    expect(
      intuitivoUnitPriceMinor({
        baseDishes: 5,
        basePriceMinor: CINCO_PLATOS_MINOR,
        dishes: 7,
        rule: { ...base, extraDishMinor: 400_000, mode: 'monto_fijo' },
      }),
    ).toBe(3_300_000);
  });

  /*
   * Al más cercano y no siempre para arriba: la regla ya decide cuánto se cobra de más, y redondear
   * siempre hacia arriba le sumaría un sesgo que nadie pidió.
   */
  it('redondea al escalón más cercano, para los dos lados', () => {
    // 7 × $4.400 = $30.800 → $31.000 (sube).
    expect(
      intuitivoUnitPriceMinor({
        baseDishes: 5,
        basePriceMinor: 2_200_000,
        dishes: 7,
        rule: base,
      }),
    ).toBe(3_100_000);

    // 6 × $4.400 = $26.400 → $26.500 (sube al más cercano, no al siguiente mil).
    expect(
      intuitivoUnitPriceMinor({
        baseDishes: 5,
        basePriceMinor: 2_200_000,
        dishes: 6,
        rule: base,
      }),
    ).toBe(2_650_000);
  });

  it('sin escalón devuelve el número exacto, redondeado al centavo', () => {
    // 7 × $5.000 = $35.000 justo; con 8, 8 × $5.000 = $40.000.
    expect(
      intuitivoUnitPriceMinor({
        baseDishes: 5,
        basePriceMinor: 2_500_001,
        dishes: 6,
        rule: { ...base, roundingMinor: 0 },
      }),
    ).toBe(3_000_001);
  });

  /*
   * Un escalón grande con un precio chico puede redondear a cero. "$0" no es una propuesta: es un
   * error de cálculo a la vista del cliente.
   */
  it('nunca propone cero', () => {
    expect(
      intuitivoUnitPriceMinor({
        baseDishes: 5,
        basePriceMinor: 1_000,
        dishes: 6,
        rule: base,
      }),
    ).toBe(50_000);
  });

  // La fórmula es simétrica: si alguna vez se permite pedir menos, ya está contemplado.
  it('también baja cuando se piden menos platos', () => {
    expect(
      intuitivoUnitPriceMinor({
        baseDishes: 5,
        basePriceMinor: CINCO_PLATOS_MINOR,
        dishes: 4,
        rule: base,
      }),
    ).toBe(2_000_000);
  });

  it('no se rompe con un tamaño sin platos declarados', () => {
    expect(
      intuitivoUnitPriceMinor({
        baseDishes: 0,
        basePriceMinor: CINCO_PLATOS_MINOR,
        dishes: 6,
        rule: base,
      }),
    ).toBe(CINCO_PLATOS_MINOR);
  });
});
