/**
 * El stock de períodos anteriores en la carga de pedidos (STOCK_LOTS_PLAN.md): qué lotes se pueden
 * vender con el menú elegido y cómo viajan en el pedido.
 */
import type { MenuOffering } from './operations.js';

export interface StockLot {
  available: number;
  cycleAlias: string;
  expired: boolean;
  expiresAt: string;
  familyName: string;
  id: string;
  operatingSiteId: string;
  operatingSiteName: string;
  quantityUnits: number;
  soldUnits: number;
  variantName: string;
  writtenOffUnits: number;
}

/** Lo elegido del stock: de qué lote y cuántas. */
export type StockPicks = ReadonlyMap<string, number>;

const familyKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-AR')
    .replace(/^menu\s+/, '')
    .replace(/[^a-z0-9]/g, '');
const sizeKey = (value: string) => /\d+/.exec(value)?.[0] ?? value.trim();

/**
 * Los lotes que se pueden vender con este menú, con la opción del menú a la que corresponden (de
 * ahí sale el precio, el normal de esta semana). Un lote de una variedad que este menú no tiene no
 * se puede vender con él.
 */
export function lotsForMenu(
  lots: readonly StockLot[],
  offerings: readonly MenuOffering[],
): (StockLot & { offeringId: string })[] {
  return lots.flatMap((lot) => {
    const offering = offerings.find(
      (candidate) =>
        !candidate.composable &&
        familyKey(candidate.familyName) === familyKey(lot.familyName) &&
        sizeKey(candidate.variantName) === sizeKey(lot.variantName),
    );
    return offering && lot.available > 0 && !lot.expired
      ? [{ ...lot, offeringId: offering.id }]
      : [];
  });
}

/** Los ítems del pedido que salen del stock. */
export function stockItemsPayload(
  picks: StockPicks,
  lots: readonly (StockLot & { offeringId: string })[],
): { offeringId: string; quantityUnits: number; stockLotId: string }[] {
  return lots.flatMap((lot) => {
    const quantity = picks.get(lot.id) ?? 0;
    return quantity > 0
      ? [{ offeringId: lot.offeringId, quantityUnits: quantity, stockLotId: lot.id }]
      : [];
  });
}
