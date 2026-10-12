import { describe, expect, it } from 'vitest';

import {
  confirmationMessage,
  deliveryDayLabel,
  itemsLine,
  plainMoney,
} from './confirmationMessage.js';

const pedido = {
  customer: {
    displayName: 'Beatriz Prueba',
    email: null,
    id: 'c1',
    phone: null,
    whatsapp: null,
  },
  deliveryAddress: 'Pasteur 974',
  deliveryDate: '2026-10-19',
  items: [{ productName: 'Menú Real', quantityUnits: 1, variantName: '400' }],
  totalMinor: 8_500_000,
};

describe('confirmationMessage', () => {
  // El mensaje que el equipo escribía a mano en cada pedido.
  it('arma el mensaje de confirmación como se mandaba a mano', () => {
    expect(confirmationMessage(pedido as never, 'de 11 a 14h')).toBe(
      'Hola Beatriz! Te escribimos de Verdeo Alimentación Mejorada para confirmar tu pedido. ' +
        '1 menú real 400 = $85.000 a Pasteur 974. ' +
        'Entrega: lunes 19 de 11 a 14h (horario tentativo a confirmar el sábado), te viene bien? Gracias!',
    );
  });

  it('sin franja horaria no deja un espacio de más', () => {
    expect(confirmationMessage(pedido as never, '  ')).toContain(
      'Entrega: lunes 19 (horario tentativo',
    );
  });
});

describe('piezas del mensaje', () => {
  it('escribe la plata sin decimales ni espacio', () => {
    expect(plainMoney(8_500_000)).toBe('$85.000');
    expect(plainMoney(17_050_000)).toBe('$170.500');
  });

  // Leído como día: con la zona horaria de Argentina, "2026-10-19" no puede volverse domingo 18.
  it('dice el día de entrega sin correrse', () => {
    expect(deliveryDayLabel('2026-10-19')).toBe('lunes 19');
  });

  it('junta varias variedades con un +', () => {
    expect(
      itemsLine([
        { productName: 'Menú Real', quantityUnits: 1, variantName: '400' },
        { productName: 'Menú Keto', quantityUnits: 2, variantName: '250' },
      ]),
    ).toBe('1 menú real 400 + 2 menú keto 250');
  });
});
