/**
 * Cuánto sale un Intuitivo con una cantidad de platos distinta de la estándar.
 *
 * El tamaño define cuántos platos lleva una unidad (`product_sizes.meals_per_unit`, cinco por
 * defecto) y el menú define cuánto sale ese tamaño. Cuando alguien pide más platos que eso, ese
 * precio deja de alcanzar y hay que proponer otro.
 *
 * "Proponer" es la palabra exacta: esto calcula un número para mostrar, no fija un precio. Las tres
 * formas existen porque son tres decisiones comerciales distintas —cobrar la parte proporcional,
 * premiar el volumen, o cobrar un plato extra a precio fijo— y cuál se usa es de quien vende, no
 * del código.
 */

export type IntuitivoPricingMode = 'coeficiente' | 'monto_fijo' | 'proporcional';

export interface IntuitivoPricingRule {
  /** Cuánto suma cada plato por encima del estándar, en `monto_fijo`. */
  extraDishMinor: number;
  /**
   * El coeficiente de `coeficiente`, en diezmilésimos: 10000 es ×1, 9500 es ×0,95.
   *
   * Entero y no decimal a propósito. Un factor en coma flotante arrastra el error de representación
   * hasta el precio —0.95 no es exactamente 0,95— y acá el resultado es plata que alguien cobra.
   */
  factorBasisPoints: number;
  mode: IntuitivoPricingMode;
  /** El escalón de redondeo, en centavos. 50000 redondea al quinientos más cercano. 0 no redondea. */
  roundingMinor: number;
}

/**
 * El precio propuesto para una unidad con `dishes` platos.
 *
 * **La cantidad estándar no se toca.** Con `dishes === baseDishes` devuelve el precio del menú tal
 * cual, sin aplicar la regla ni redondear: ese precio lo publicó alguien y redondearlo acá lo
 * cambiaría por un efecto secundario del cálculo de otra cosa.
 *
 * El redondeo es al escalón más cercano, no para arriba: la regla ya decide cuánto se cobra de más,
 * y redondear siempre hacia arriba le sumaría un sesgo que nadie pidió.
 */
export function intuitivoUnitPriceMinor(input: {
  baseDishes: number;
  basePriceMinor: number;
  dishes: number;
  rule: IntuitivoPricingRule;
}): number {
  const { baseDishes, basePriceMinor, dishes, rule } = input;
  if (baseDishes <= 0) return basePriceMinor;
  if (dishes === baseDishes) return basePriceMinor;

  const crudo =
    rule.mode === 'monto_fijo'
      ? basePriceMinor + (dishes - baseDishes) * rule.extraDishMinor
      : rule.mode === 'coeficiente'
        ? (basePriceMinor / baseDishes) * dishes * (rule.factorBasisPoints / 10_000)
        : (basePriceMinor / baseDishes) * dishes;

  const redondeado =
    rule.roundingMinor > 0
      ? Math.round(crudo / rule.roundingMinor) * rule.roundingMinor
      : Math.round(crudo);
  /*
   * Nunca por debajo de un escalón.
   *
   * Un escalón grande con un precio chico puede redondear a cero —"$0" no es una propuesta, es un
   * error de cálculo a la vista del cliente—, así que el piso es un escalón.
   */
  return Math.max(redondeado, rule.roundingMinor > 0 ? rule.roundingMinor : 1);
}
