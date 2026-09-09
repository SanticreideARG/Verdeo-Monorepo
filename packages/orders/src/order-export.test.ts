import { describe, expect, it } from 'vitest';

import { buildOrdersCsv, maskSurname, orderItemsSummary } from './order-export.js';

describe('order CSV export', () => {
  it('escapes quotes and delimiters and includes an Excel-compatible BOM', () => {
    const csv = buildOrdersCsv([
      {
        createdAt: new Date('2026-08-19T10:00:00.000Z'),
        currency: 'ARS',
        customerDisplayName: 'Pérez, "María"',
        deliveryAddress: 'Calle 1, piso 2',
        deliveryDate: '2026-08-20',
        deliveryZone: 'Centro',
        paymentExpectation: 'transferencia',
        publicNumber: 'N00001',
        source: 'whatsapp',
        status: 'CONFIRMED',
        totalMinor: 25_000,
      },
    ]);

    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Pérez, ""María"""');
    expect(csv).toContain('"25000"');
  });

  it('neutralizes spreadsheet formulas in textual cells', () => {
    const csv = buildOrdersCsv([
      {
        createdAt: '2026-08-19T10:00:00.000Z',
        currency: 'ARS',
        customerDisplayName: '=HYPERLINK("bad")',
        deliveryAddress: '@unsafe',
        deliveryDate: '2026-08-20',
        deliveryZone: null,
        paymentExpectation: 'cash',
        publicNumber: 'N00002',
        source: 'manual',
        status: 'DRAFT',
        totalMinor: 0,
      },
    ]);

    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"\'@unsafe"');
  });

  it('lleva el pedido y el contacto, que es lo que la planilla vino a resolver', () => {
    const csv = buildOrdersCsv([
      {
        createdAt: '2026-08-19T10:00:00.000Z',
        currency: 'ARS',
        customerDisplayName: 'Ana Vega',
        customerWhatsapp: '+542991234567',
        deliveryAddress: 'Calle 1',
        deliveryDate: '2026-08-20',
        deliveryZone: 'Centro',
        dietaryInstructions: ['sin sal'],
        items: [{ dishSelections: [], productName: 'Keto', quantityUnits: 2, variantName: '250' }],
        paidAt: null,
        paymentExpectation: 'Transferencia',
        publicNumber: 'N00003',
        source: 'whatsapp',
        status: 'CONFIRMED',
        totalMinor: 12_000,
      },
    ]);

    // Antes el CSV no decía qué se había pedido: había que abrir cada pedido para saberlo.
    expect(csv).toContain('"Keto 250 × 2"');
    // Con el apóstrofo delante: un número que empieza con "+" es una fórmula para una planilla, y
    // el guardado contra inyección lo neutraliza igual que a cualquier otra celda de texto.
    expect(csv).toContain('"\'+542991234567"');
    expect(csv).toContain('"sin sal"');
    expect(csv).toContain('"No"');
  });

  it('no rompe con una fila sin ítems ni contacto', () => {
    // Los campos nuevos son opcionales: una fila vieja sigue exportando.
    const csv = buildOrdersCsv([
      {
        createdAt: '2026-08-19T10:00:00.000Z',
        currency: 'ARS',
        customerDisplayName: 'Lola',
        deliveryAddress: 'Calle 1',
        deliveryDate: '2026-08-20',
        deliveryZone: null,
        paymentExpectation: 'Efectivo',
        publicNumber: 'N00004',
        source: 'phone',
        status: 'DRAFT',
        totalMinor: 0,
      },
    ]);

    expect(csv).toContain('"Lola"');
  });
});

describe('orderItemsSummary', () => {
  it('pone la composición de un Intuitivo entre paréntesis', () => {
    /*
     * Sin esto, dos filas que dicen "Intuitivo 400 × 1" son dos viandas completamente distintas y
     * no hay manera de saberlo desde la planilla.
     */
    expect(
      orderItemsSummary([
        {
          dishSelections: ['Guiso', 'Tarta'],
          productName: 'Intuitivo',
          quantityUnits: 1,
          variantName: '400',
        },
      ]),
    ).toBe('Intuitivo 400 × 1 (Guiso, Tarta)');
  });

  it('separa varios ítems con el separador pedido', () => {
    const items = [
      { dishSelections: [], productName: 'Keto', quantityUnits: 1, variantName: '250' },
      { dishSelections: [], productName: 'Veggie', quantityUnits: 2, variantName: '400' },
    ];

    // La planilla los apila dentro de la celda; el CSV no puede, así que van en una línea.
    expect(orderItemsSummary(items, '\n')).toBe('Keto 250 × 1\nVeggie 400 × 2');
    expect(orderItemsSummary(items)).toBe('Keto 250 × 1 | Veggie 400 × 2');
  });

  it('devuelve vacío sin ítems', () => {
    expect(orderItemsSummary(undefined)).toBe('');
  });
});

describe('maskSurname', () => {
  it('deja el nombre de pila y reduce el resto a iniciales', () => {
    expect(maskSurname('Ana Isabella Vega')).toBe('Ana I. V.');
  });

  it('no toca un nombre de una sola palabra', () => {
    // No hay apellido que tapar, y recortarlo dejaría la fila sin identificar a nadie.
    expect(maskSurname('Lola')).toBe('Lola');
  });

  it('distingue dos personas con el mismo nombre de pila', () => {
    expect(maskSurname('Ana Vega')).not.toBe(maskSurname('Ana Pérez'));
  });

  it('coincide con lo que muestra el navegador', () => {
    /*
     * `apps/web/src/lib/maskName.ts` tiene la misma función, porque el navegador no importa
     * paquetes del servidor. Estos casos son los mismos que verifica aquel test: si dejan de
     * coincidir, la pantalla y el archivo dirían cosas distintas del mismo pedido.
     */
    expect(maskSurname('  Juan   Carlos  Pérez ')).toBe('Juan C. P.');
    expect(maskSurname('Ana Ñandú')).toBe('Ana Ñ.');
  });
});
