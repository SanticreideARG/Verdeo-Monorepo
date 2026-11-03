import { describe, expect, it } from 'vitest';

import { paymentStatus } from './paymentStatus.js';

const METHODS = [
  { code: 'cash', displayName: 'Efectivo', isCash: true },
  { code: 'transfer', displayName: 'Transferencia', isCash: false },
];
const pedido = {
  deliveryDate: '2026-11-09',
  paidAt: null,
  paymentExpectation: 'cash',
  status: 'CONFIRMED',
};

describe('si un pedido está cobrado', () => {
  it('el efectivo se cuenta recién al terminar el día de entrega', () => {
    expect(paymentStatus(pedido, METHODS, '2026-11-09').label).toBe('Pendiente');
    expect(paymentStatus(pedido, METHODS, '2026-11-10').label).toBe('Cobrado');
  });

  it('la transferencia, sólo con el tilde, aunque ya haya pasado la entrega', () => {
    const transferencia = { ...pedido, paymentExpectation: 'Transferencia' };
    expect(paymentStatus(transferencia, METHODS, '2026-12-01').label).toBe('Pendiente');
    expect(
      paymentStatus({ ...transferencia, paidAt: '2026-11-05T12:00:00Z' }, METHODS, '2026-11-06')
        .label,
    ).toBe('Cobrado');
  });

  it('un medio que no está en la lista se reconoce por su nombre', () => {
    expect(
      paymentStatus({ ...pedido, paymentExpectation: 'Efectivo contra entrega' }, [], '2026-11-10')
        .label,
    ).toBe('Cobrado');
  });

  it('sin pago y cancelado no están ni cobrados ni pendientes', () => {
    expect(
      paymentStatus({ ...pedido, paymentExpectation: 'sin_pago' }, METHODS, '2026-11-10'),
    ).toEqual({ hint: null, label: 'Sin cargo', tone: 'none' });
    expect(paymentStatus({ ...pedido, status: 'CANCELLED' }, METHODS, '2026-11-10').label).toBe(
      'Cancelado',
    );
  });
});
