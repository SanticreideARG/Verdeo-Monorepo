import type { LabelData } from '@verdeo/labels';
import { describe, expect, it } from 'vitest';

import {
  adjustGroup,
  looseLabels,
  menuGroups,
  plateGroups,
  type KitchenLabelRow,
} from './productionLabels.js';

const plate = (
  dish: string,
  abbreviation = 'KETO',
  side: string | null = null,
): KitchenLabelRow => ({
  abbreviation,
  composable: false,
  customerName: null,
  dish,
  side,
  sizeName: null,
});

const unit = (overrides: Partial<LabelData>): LabelData => ({
  composable: false,
  customerDisplayName: 'Ana Pérez',
  deliveryDate: '2026-10-24',
  deliveryZone: null,
  dietaryInstructions: [],
  dishIndex: 0,
  dishName: null,
  dishTotal: 5,
  dishes: [],
  familyName: 'Menú Nuevo Keto',
  orderPublicNumber: 'NQN-00001',
  unitIndex: 0,
  unitTotal: 1,
  variantName: '400',
  ...overrides,
});

describe('plateGroups', () => {
  it('agrupa por variedad, separa el acompañamiento y arma el pie con la fecha', () => {
    const groups = plateGroups(
      [plate('Lomo | Frittata'), plate('Lomo | Frittata'), plate('Curry', 'VEGETARIANO')],
      '2026-10-15',
    );

    expect(groups.map((group) => [group.title, group.labels.length])).toEqual([
      ['Platos KETO', 2],
      ['Platos VEGETARIANO', 1],
    ]);
    expect(groups[0]?.labels[0]).toEqual({
      dish: 'Lomo',
      footer: 'KETO ELAB # 15-10',
      key: 'plato:KETO::Lomo|Frittata:0',
      kind: 'plato',
      side: 'Frittata',
    });
    // La segunda del mismo plato tiene su propia clave.
    expect(groups[0]?.labels[1]?.key).toBe('plato:KETO::Lomo|Frittata:1');
  });

  it('la clave no cambia con la fecha de elaboración', () => {
    const a = plateGroups([plate('Lomo')], '2026-10-15')[0]?.labels[0]?.key;
    const b = plateGroups([plate('Lomo')], '2026-10-16')[0]?.labels[0]?.key;
    expect(a).toBe(b);
  });
});

describe('menuGroups', () => {
  it('una por vianda: fijas por variedad y tamaño, Intuitivos por cliente', () => {
    const groups = menuGroups([
      unit({ unitIndex: 0, unitTotal: 2 }),
      unit({ unitIndex: 1, unitTotal: 2 }),
      unit({
        composable: true,
        customerDisplayName: 'Juan Manuel Brandan',
        familyName: 'Intuitivo',
        orderPublicNumber: 'NQN-00002',
      }),
    ]);

    expect(groups.map((group) => [group.title, group.labels.length])).toEqual([
      ['KETO 400', 2],
      ['Juan Manuel Brandan · Intuitivo 400', 1],
    ]);
    expect(groups[1]?.labels[0]).toMatchObject({ line: 'Juan Manuel Brandan', size: '400' });
  });

  it('no repite la vianda cuando llega una vez por plato', () => {
    const groups = menuGroups([unit({ dishIndex: 0 }), unit({ dishIndex: 1 })]);
    expect(groups[0]?.labels).toHaveLength(1);
  });
});

describe('looseLabels', () => {
  it('repite una etiqueta con claves propias que siguen la cuenta', () => {
    const template = {
      dish: 'Lomo',
      footer: 'KETO',
      key: 'plato:KETO::Lomo|:0',
      kind: 'plato' as const,
      side: null,
    };
    const first = looseLabels(template, 2, []);
    const more = looseLabels(template, 1, first);

    expect(first.map((label) => label.key)).toEqual([
      'suelta:plato:KETO::Lomo|:0',
      'suelta:plato:KETO::Lomo|:1',
    ]);
    expect(more[0]?.key).toBe('suelta:plato:KETO::Lomo|:2');
  });
});

describe('adjustGroup', () => {
  const group = plateGroups([plate('Lomo'), plate('Curry')], '2026-10-15')[0];

  it('saca del final y agrega repitiendo, como sueltas', () => {
    if (!group) throw new Error('sin grupo');
    expect(adjustGroup(group, -1).map((label) => label.key)).toEqual(['plato:KETO::Lomo|:0']);
    expect(adjustGroup(group, -5)).toEqual([]);
    const more = adjustGroup(group, 3);
    expect(more).toHaveLength(5);
    expect(more.slice(2).map((label) => label.kind === 'plato' && label.dish)).toEqual([
      'Lomo',
      'Curry',
      'Lomo',
    ]);
    expect(more[2]?.key).toBe('suelta:plato:KETO:0');
  });
});
