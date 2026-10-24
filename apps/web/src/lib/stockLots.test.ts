import { describe, expect, it } from 'vitest';

import type { MenuOffering } from './operations.js';
import { lotsForMenu, stockItemsPayload, type StockLot } from './stockLots.js';

const lot = (overrides: Partial<StockLot> = {}): StockLot => ({
  available: 2,
  cycleAlias: 'Octubre 2',
  expired: false,
  expiresAt: '2026-11-18T00:00:00Z',
  familyName: 'Menú Nuevo Keto',
  id: 'l1',
  operatingSiteId: 's1',
  operatingSiteName: 'Córdoba',
  quantityUnits: 2,
  soldUnits: 0,
  variantName: '400',
  writtenOffUnits: 0,
  ...overrides,
});

const offering = (overrides: Partial<MenuOffering>): MenuOffering =>
  ({
    composable: false,
    familyName: 'MENÚ NUEVO KETO',
    id: 'o1',
    variantName: '400 g',
    ...overrides,
  }) as MenuOffering;

describe('lotsForMenu', () => {
  it('sólo los lotes de variedades que tiene el menú, con su opción', () => {
    const matched = lotsForMenu(
      [lot(), lot({ familyName: 'Menú Real', id: 'l2' }), lot({ expired: true, id: 'l3' })],
      [offering({})],
    );
    expect(matched.map((item) => [item.id, item.offeringId])).toEqual([['l1', 'o1']]);
  });

  it('nunca con un Intuitivo', () => {
    expect(lotsForMenu([lot()], [offering({ composable: true })])).toEqual([]);
  });
});

describe('stockItemsPayload', () => {
  it('lo elegido, con el lote', () => {
    const matched = lotsForMenu([lot()], [offering({})]);
    expect(stockItemsPayload(new Map([['l1', 2]]), matched)).toEqual([
      { offeringId: 'o1', quantityUnits: 2, stockLotId: 'l1' },
    ]);
    expect(stockItemsPayload(new Map(), matched)).toEqual([]);
  });
});
