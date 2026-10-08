import { describe, expect, it } from 'vitest';

import {
  isParametrized,
  paymentMethodLabel,
  paymentOptions,
  paymentSelectValue,
} from './paymentMethods.js';

const medios = [
  { code: 'cash', displayName: 'Efectivo' },
  { code: 'transfer', displayName: 'Transferencia' },
];

describe('paymentMethodLabel', () => {
  // La web pública guarda el nombre y el alta del equipo guardaba el código.
  it('muestra el nombre parametrizado tanto si se guardó el código como el nombre', () => {
    expect(paymentMethodLabel('transfer', medios)).toBe('Transferencia');
    expect(paymentMethodLabel('transferencia', medios)).toBe('Transferencia');
    expect(paymentMethodLabel('Efectivo', medios)).toBe('Efectivo');
  });

  it('deja tal cual lo que no es un medio parametrizado, para poder corregirlo', () => {
    expect(paymentMethodLabel('A confirmar', medios)).toBe('A confirmar');
  });

  it('un valor vacío no inventa un medio', () => {
    expect(paymentMethodLabel('', medios)).toBe('—');
  });
});

describe('paymentOptions', () => {
  it('ofrece los parametrizados', () => {
    expect(paymentOptions('Efectivo', medios).map((o) => o.value)).toEqual([
      'Efectivo',
      'Transferencia',
    ]);
  });

  // Sin esto, guardar un pedido viejo por otro motivo le cambiaría el medio sin que nadie lo toque.
  it('conserva el valor actual si no está parametrizado, marcado como tal', () => {
    const opciones = paymentOptions('A confirmar', medios);
    expect(opciones[0]).toEqual({ label: 'A confirmar (sin parametrizar)', value: 'A confirmar' });
    expect(opciones).toHaveLength(3);
  });
});

describe('paymentSelectValue / isParametrized', () => {
  it('lleva el código guardado al nombre que usa el selector', () => {
    expect(paymentSelectValue('cash', medios)).toBe('Efectivo');
    expect(paymentSelectValue('A confirmar', medios)).toBe('A confirmar');
  });

  it('distingue lo parametrizado de lo que no', () => {
    expect(isParametrized('transfer', medios)).toBe(true);
    expect(isParametrized('A confirmar', medios)).toBe(false);
  });
});
