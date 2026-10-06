/**
 * Los renglones de un pedido, antes de mandarlo.
 *
 * Vive acá y no dentro de la pantalla por la misma razón que `menuPayload`: son reglas que se
 * rompen en silencio —un Intuitivo que se guarda sin sus platos, un renglón elegido que no entra al
 * pedido— y adentro de un componente no hay forma de probarlas.
 */

/** Lo mínimo que el carrito necesita saber de una oferta del menú. */
export interface CartOffering {
  composable: boolean;
  currency: string;
  familyName: string;
  id: string;
  /** Cuántos platos trae una unidad de este tamaño. */
  mealsPerUnit: number;
  sizeName: string;
  unitPriceMinor: number;
}

/**
 * Un renglón del pedido.
 *
 * Lleva el nombre y el precio ya resueltos y no sólo el `offeringId`. El menú se puede reemplazar
 * mientras alguien está cargando un pedido, y entonces la oferta elegida deja de estar en la lista:
 * con el id solo, el renglón se quedaría sin poder mostrarse. Lo que se manda al servidor sigue
 * siendo el id, que es lo que vale para el precio.
 */
export interface CartLine {
  currency: string;
  label: string;
  offeringId: string;
  quantityUnits: number;
  selectedDishNames: string[];
  unitPriceMinor: number;
}

export type PendingLine = { line: CartLine } | { reason: string } | null;

/**
 * Lo que está elegido en el formulario y todavía no se agregó a la lista.
 *
 * `null` cuando no hay nada elegido. Un motivo —y no `null`— cuando hay algo elegido pero
 * incompleto: un Intuitivo sin sus platos no se puede descartar en silencio, porque quien lo eligió
 * cree que lo cargó, y el pedido saldría sin esa vianda.
 */
/** Lo que la ciudad permite y cómo cobra los platos de más. */
export interface IntuitivoLimits {
  maxDishes: number;
  pricing: {
    extraDishMinor: number;
    factorBasisPoints: number;
    mode: 'coeficiente' | 'monto_fijo' | 'proporcional';
    roundingMinor: number;
  };
}

export function pendingCartLine(
  offering: CartOffering | null,
  quantityUnits: number,
  dishes: readonly string[],
  limits: IntuitivoLimits,
): PendingLine {
  if (!offering) return null;
  if (offering.composable && dishes.length < offering.mealsPerUnit) {
    return {
      reason: `Elegí al menos ${String(offering.mealsPerUnit)} platos del Intuitivo antes de agregarlo.`,
    };
  }
  if (offering.composable && dishes.length > limits.maxDishes) {
    return { reason: `Un Intuitivo admite hasta ${String(limits.maxDishes)} platos.` };
  }
  return {
    line: {
      currency: offering.currency,
      label: `${offering.familyName} ${offering.sizeName}`.trim(),
      offeringId: offering.id,
      quantityUnits,
      // Una vianda estándar no lleva platos elegidos aunque queden seleccionados de antes.
      selectedDishNames: offering.composable ? [...dishes] : [],
      // El mismo número que va a cobrar el servidor, no el del menú: con platos de más, difieren.
      unitPriceMinor: offering.composable
        ? intuitivoUnitPriceMinor({
            baseDishes: offering.mealsPerUnit,
            basePriceMinor: offering.unitPriceMinor,
            dishes: dishes.length,
            rule: limits.pricing,
          })
        : offering.unitPriceMinor,
    },
  };
}

/**
 * Los renglones que se van a mandar: los agregados más lo que quedó elegido arriba.
 *
 * Que lo pendiente entre solo es lo que mantiene el pedido de una sola variedad —que son casi
 * todos— en elegir y guardar, sin un paso nuevo en el medio.
 */
export function linesToSubmit(
  cart: readonly CartLine[],
  pending: PendingLine,
): { lines: CartLine[] } | { reason: string } {
  if (pending !== null && 'reason' in pending) return { reason: pending.reason };
  const lines = [...cart, ...(pending === null ? [] : [pending.line])];
  if (lines.length === 0) return { reason: 'Agregá al menos una variedad al pedido.' };
  return { lines };
}

export function cartTotalMinor(cart: readonly CartLine[], pending: PendingLine): number {
  const pendingLine = pending !== null && 'line' in pending ? [pending.line] : [];
  return [...cart, ...pendingLine].reduce(
    (total, line) => total + line.unitPriceMinor * line.quantityUnits,
    0,
  );
}

/** Lo que entiende `POST /api/v1/orders`: el id, la cantidad y los platos cuando los hay. */
export function cartItemsPayload(
  lines: readonly CartLine[],
): { offeringId: string; quantityUnits: number; selectedDishNames?: string[] }[] {
  return lines.map((line) => ({
    offeringId: line.offeringId,
    quantityUnits: line.quantityUnits,
    ...(line.selectedDishNames.length > 0 ? { selectedDishNames: line.selectedDishNames } : {}),
  }));
}

/**
 * El precio de un Intuitivo con una cantidad de platos distinta de la estándar.
 *
 * Es un espejo de `intuitivoUnitPriceMinor` de `@verdeo/orders`, que es la fuente de verdad: esta
 * aplicación no depende de los paquetes internos, así que la cuenta se repite acá para que el total
 * del formulario sea el mismo número que va a cobrar el servidor. Si una cambia, la otra también.
 *
 * Con la cantidad estándar devuelve el precio del menú intacto, sin regla ni redondeo.
 */
export function intuitivoUnitPriceMinor(input: {
  baseDishes: number;
  basePriceMinor: number;
  dishes: number;
  rule: {
    extraDishMinor: number;
    factorBasisPoints: number;
    mode: 'coeficiente' | 'monto_fijo' | 'proporcional';
    roundingMinor: number;
  };
}): number {
  const { baseDishes, basePriceMinor, dishes, rule } = input;
  if (baseDishes <= 0 || dishes === baseDishes) return basePriceMinor;

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
  return Math.max(redondeado, rule.roundingMinor > 0 ? rule.roundingMinor : 1);
}
