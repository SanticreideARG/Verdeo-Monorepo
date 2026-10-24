import { describe, expect, it } from 'vitest';

import {
  buildKitchenLabels,
  defaultAbbreviation,
  elaborationLabel,
  splitDish,
} from './kitchen-labels.js';
import type { KitchenSourceLine } from './types.js';

const KETO = [
  'Wraps de pechuga con crema de cúrcuma / Tortilla de brócoli',
  'Meatloaf con jamón y nueces / Zapallitos revueltos',
  'Estofado keto capri de pollo y verduras',
];

const linea = (extra: Partial<KitchenSourceLine & { familyAbbreviation: string | null }>) => ({
  composable: false,
  customerDisplayName: 'Ana Prueba',
  deliveryDate: '2026-10-17',
  deliveryZone: null,
  dietaryInstructions: [],
  dishSelections: [],
  dishes: KETO,
  familyAbbreviation: 'KETO',
  familyName: 'Menú Paleo & Keto',
  orderPublicNumber: 'CABA-00001',
  quantityUnits: 1,
  variantName: '400',
  ...extra,
});

describe('splitDish', () => {
  it('separa el plato del acompañamiento por la barra', () => {
    expect(splitDish('Wraps de pechuga con crema de cúrcuma / Tortilla de brócoli')).toEqual({
      dish: 'Wraps de pechuga con crema de cúrcuma',
      side: 'Tortilla de brócoli',
    });
  });

  it('un plato sin barra no tiene acompañamiento', () => {
    expect(splitDish('Estofado keto capri de pollo y verduras')).toEqual({
      dish: 'Estofado keto capri de pollo y verduras',
      side: null,
    });
  });
});

describe('defaultAbbreviation', () => {
  it('sugiere la última palabra sin "Menú", en mayúsculas', () => {
    expect(defaultAbbreviation('Menú Paleo & Keto')).toBe('KETO');
    expect(defaultAbbreviation('Menú Vegan')).toBe('VEGAN');
  });
});

describe('elaborationLabel', () => {
  it('imprime día y mes como en la etiqueta', () => {
    expect(elaborationLabel('2026-09-24')).toBe('24-09');
  });
});

describe('buildKitchenLabels', () => {
  const opciones = { intuitivoCustomerName: true, showSize: false };

  // Cada vianda lleva un recipiente de cada plato: los platos van intercalados, como en la hoja.
  it('suma las unidades de la variedad e intercala los platos', () => {
    const etiquetas = buildKitchenLabels(
      [linea({ quantityUnits: 1 }), linea({ orderPublicNumber: 'CABA-00002', quantityUnits: 1 })],
      opciones,
    );
    expect(etiquetas.map((label) => label.dish)).toEqual([
      'Wraps de pechuga con crema de cúrcuma',
      'Meatloaf con jamón y nueces',
      'Estofado keto capri de pollo y verduras',
      'Wraps de pechuga con crema de cúrcuma',
      'Meatloaf con jamón y nueces',
      'Estofado keto capri de pollo y verduras',
    ]);
    expect(etiquetas.every((label) => label.customerName === null)).toBe(true);
    expect(etiquetas[0]).toMatchObject({ abbreviation: 'KETO', side: 'Tortilla de brócoli' });
  });

  it('sin mostrar tamaño, el 250 y el 400 llevan la misma etiqueta; con tamaño van aparte', () => {
    const lineas = [linea({ variantName: '250' }), linea({ variantName: '400' })];
    expect(buildKitchenLabels(lineas, opciones).every((label) => label.sizeName === null)).toBe(
      true,
    );
    const conTamano = buildKitchenLabels(lineas, { ...opciones, showSize: true });
    expect([...new Set(conTamano.map((label) => label.sizeName))]).toEqual(['400', '250']);
  });

  it('la abreviatura sugerida de Anti-Age es ANTIAGE', () => {
    expect(defaultAbbreviation('Menú Anti-Age')).toBe('ANTIAGE');
  });

  it('sin abreviatura cargada usa la sugerida', () => {
    const [etiqueta] = buildKitchenLabels([linea({ familyAbbreviation: null })], opciones);
    expect(etiqueta?.abbreviation).toBe('KETO');
  });

  // El Intuitivo cambia de cliente a cliente: va pedido por pedido, con su nombre por defecto.
  it('el Intuitivo va pedido por pedido con los platos elegidos y el nombre del cliente', () => {
    const intuitivo = linea({
      composable: true,
      dishSelections: ['Pastel de lomo braseado y calabaza asada', 'Carré de cerdo / Vegetales'],
      familyAbbreviation: 'INTUITIVO',
      familyName: 'Menú Intuitivo',
    });
    const etiquetas = buildKitchenLabels([intuitivo], opciones);
    expect(etiquetas).toHaveLength(2);
    expect(etiquetas[1]).toMatchObject({
      customerName: 'Ana Prueba',
      dish: 'Carré de cerdo',
      side: 'Vegetales',
    });
    expect(
      buildKitchenLabels([intuitivo], { ...opciones, intuitivoCustomerName: false })[0]
        ?.customerName,
    ).toBeNull();
  });

  it('cada plato del Intuitivo lleva en el pie el menú del que viene, no INTUITIVO', () => {
    const intuitivo = linea({
      composable: true,
      dishSelections: ['Lomo', 'Curry'],
      dishSources: [
        { familyName: 'Menú Nuevo Keto', slot: 1 },
        { familyName: 'Menú Real', slot: 3 },
      ],
      familyAbbreviation: 'INTUITIVO',
      familyName: 'Menú Intuitivo',
    });
    const etiquetas = buildKitchenLabels([intuitivo], opciones);
    expect(etiquetas.map((label) => label.abbreviation)).toEqual(['KETO', 'REAL']);
    // De qué pedido es, para agruparlo en Etiquetas 2.0 (no se imprime).
    expect(etiquetas[0]).toMatchObject({ orderCustomer: 'Ana Prueba' });
    expect(etiquetas[0]?.orderKey).toBeTruthy();
  });

  it('sin origen guardado, busca el plato entre los menús de la tanda', () => {
    const keto = linea({ dishes: ['Lomo', 'B', 'C', 'D', 'E'], familyAbbreviation: 'KETO' });
    const intuitivo = linea({
      composable: true,
      dishSelections: ['Lomo'],
      familyAbbreviation: 'INTUITIVO',
      familyName: 'Menú Intuitivo',
    });
    const etiquetas = buildKitchenLabels([keto, intuitivo], opciones);
    expect(etiquetas.at(-1)?.abbreviation).toBe('KETO');
  });
});
