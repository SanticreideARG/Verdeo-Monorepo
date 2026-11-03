import { describe, expect, it } from 'vitest';

import {
  confirmationDraft,
  fillConfirmationDraft,
  missingConfirmationFacts,
  type ConfirmationOrder,
} from './confirmationMessage.js';

const pedido = {
  customer: { displayName: 'Beatriz Prueba' },
  deliveryAddress: 'Calle Falsa 123',
  deliveryDate: '2026-11-09',
  items: [{ productName: 'Menú Real', quantityUnits: 1, variantName: '400' }],
  totalMinor: 9_000_000,
} as unknown as ConfirmationOrder;

describe('el mensaje de confirmación con Hera', () => {
  it('a Hera no le llegan el nombre ni la dirección del cliente', () => {
    const draft = confirmationDraft(pedido);
    expect(draft).not.toContain('Beatriz');
    expect(draft).not.toContain('Falsa');
    expect(draft).toContain('{nombre}');
    expect(draft).toContain('{direccion}');
    expect(draft).toContain('$90.000');
  });

  it('completa lo que Hera escribió con los datos del pedido y la franja', () => {
    expect(
      fillConfirmationDraft('¡Hola {nombre}! Va a {direccion} {franja}.', pedido, 'de 11 a 14h'),
    ).toBe('¡Hola Beatriz! Va a Calle Falsa 123 de 11 a 14h.');
    expect(fillConfirmationDraft('Va {franja} a {direccion}.', pedido, '')).toBe(
      'Va a Calle Falsa 123.',
    );
  });

  it('detecta una versión que perdió el importe, el día o los datos a completar', () => {
    expect(missingConfirmationFacts(confirmationDraft(pedido), pedido)).toEqual([]);
    expect(missingConfirmationFacts('Hola {nombre}, a {direccion}, $80.000', pedido)).toEqual([
      'el importe',
      'el día',
    ]);
    expect(missingConfirmationFacts('Hola, lunes 9, $90.000', pedido)).toEqual([
      'el nombre',
      'la dirección',
    ]);
  });
});
