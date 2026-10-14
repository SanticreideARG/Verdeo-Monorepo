import { describe, expect, it } from 'vitest';

import { matchPaymentMethod, paymentKindOf } from './payment-match.js';

const configurados = [
  { code: 'efectivo', displayName: 'Efectivo' },
  { code: 'transferencia', displayName: 'Transferencia' },
  { code: 'mercado_pago', displayName: 'Mercado Pago' },
];

describe('matchPaymentMethod', () => {
  it('devuelve el medio configurado, no el texto como vino', () => {
    expect(matchPaymentMethod('TRANSFERENCIA', configurados)).toBe('Transferencia');
    expect(matchPaymentMethod('mercado_pago', configurados)).toBe('Mercado Pago');
  });

  // Así llegó a un cliente en el mensaje de confirmación.
  it('tolera errores de tipeo y abreviaturas', () => {
    expect(matchPaymentMethod('trasferencia', configurados)).toBe('Transferencia');
    expect(matchPaymentMethod('transf.', configurados)).toBe('Transferencia');
    expect(matchPaymentMethod('pago en efvo', configurados)).toBe('Efectivo');
    expect(matchPaymentMethod('mercadopago', configurados)).toBe('Mercado Pago');
  });

  it('toma el nombre del medio configurado aunque se llame distinto', () => {
    expect(
      matchPaymentMethod('transferencia', [
        { code: 'banco', displayName: 'Transferencia bancaria' },
      ]),
    ).toBe('Transferencia bancaria');
  });

  it('no decide si no hay ninguno o hay dos que podrían ser', () => {
    expect(matchPaymentMethod('cheque', configurados)).toBeNull();
    expect(matchPaymentMethod('', configurados)).toBeNull();
    expect(
      matchPaymentMethod('transferencia', [
        { code: 'galicia', displayName: 'Transferencia Galicia' },
        { code: 'nacion', displayName: 'Transferencia Nación' },
      ]),
    ).toBeNull();
  });
});

describe('paymentKindOf', () => {
  it('no confunde palabras de una dirección con una forma de pago', () => {
    expect(paymentKindOf('Pasaje Trasfondo 100')).toBeNull();
    expect(paymentKindOf('Mitre 400')).toBeNull();
  });
});
