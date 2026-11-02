import { describe, expect, it } from 'vitest';

import {
  courierPayment,
  routeMessage,
  withoutNewMark,
  type RouteMessageStop,
} from './routeMessage.js';

const stop = (overrides: Partial<RouteMessageStop> = {}): RouteMessageStop => ({
  customerDisplayName: 'Ana Prueba',
  deliveryAddress: 'Calle 1',
  deliveryAddressLine2: null,
  deliveryWindow: null,
  detail: 'Menú Keto 400',
  neighborhood: null,
  paymentExpectation: 'Efectivo',
  sequence: 1,
  totalMinor: 10_000_00,
  ...overrides,
});

describe('withoutNewMark', () => {
  it('saca la marca, escrita de cualquier forma', () => {
    expect(withoutNewMark('Ana Prueba (NUEVO)')).toBe('Ana Prueba');
    expect(withoutNewMark('Ana Prueba - nueva')).toBe('Ana Prueba');
    expect(withoutNewMark('Menú Nuevo Keto 400 ×2')).toBe('Menú Keto 400 ×2');
  });

  it('no toca lo que sólo se le parece', () => {
    expect(withoutNewMark('Ana Nuevomundo')).toBe('Ana Nuevomundo');
    expect(withoutNewMark('Menú Real 250 + Menú Keto 400')).toBe('Menú Real 250 + Menú Keto 400');
  });
});

describe('courierPayment', () => {
  it('toda parada dice qué hacer con el pago', () => {
    expect(courierPayment(stop())).toContain('Efectivo');
    expect(courierPayment(stop({ paymentExpectation: 'Transferencia' }))).toBe('No cobrar');
    expect(courierPayment(stop({ paymentExpectation: 'sin_pago' }))).toBe('No cobrar');
  });
});

describe('routeMessage', () => {
  const message = routeMessage(
    {
      deliveryDate: '2026-11-03',
      stops: [
        stop({ customerDisplayName: 'Ana Prueba (NUEVO)', neighborhood: 'Centro' }),
        stop({
          detail: 'Menú Nuevo Keto 250',
          paymentExpectation: 'Transferencia',
          sequence: 2,
        }),
      ],
    },
    () => 'https://mapa',
  );

  it('lleva el barrio en la dirección y sin barrio queda sólo la dirección', () => {
    expect(message).toContain('Calle 1 · Centro\nhttps://mapa');
    expect(message).toContain('Menú Keto 250\nCalle 1\nhttps://mapa');
  });

  it('no dice que el cliente es nuevo', () => {
    expect(message).not.toMatch(/nuevo/i);
    expect(message).toContain('1. Ana P.');
  });

  it('una transferencia no da ni el monto ni el medio', () => {
    expect(message).toContain('https://mapa\nNo cobrar');
    expect(message).not.toMatch(/transfer/i);
  });
});
