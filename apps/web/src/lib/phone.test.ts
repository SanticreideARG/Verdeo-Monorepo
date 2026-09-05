import { describe, expect, it } from 'vitest';

import { formatArgentinePhone } from './phone.js';

describe('formatArgentinePhone', () => {
  /**
   * El caso que estaba roto: con `+` adelante, la limpieza de no-dígitos no corría —quedó `/D/g` en
   * vez de `/\D/g`— y el número salía sin tocar detrás de un "+54 9" pegado adelante. Funcionaba
   * sólo si el valor guardado venía sin símbolos.
   */
  it('lee el número aunque traiga símbolos y espacios', () => {
    expect(formatArgentinePhone('+54 9 299 549-3102')).toBe('(0299) 15 549 3102');
    expect(formatArgentinePhone('5492995493102')).toBe('(0299) 15 549 3102');
  });

  // Siete dígitos de abonado se escriben 3-4, no 4-3.
  it('corta el abonado como se escribe en el interior', () => {
    expect(formatArgentinePhone('+5492615117163')).toBe('(0261) 15 511 7163');
  });

  it('no confunde 2920 con 29', () => {
    expect(formatArgentinePhone('+5492920123456')).toBe('(02920) 15 123 456');
  });

  // Ocho dígitos: Buenos Aires corta igual de las dos formas.
  it('formatea Buenos Aires', () => {
    expect(formatArgentinePhone('+5491158393179')).toBe('(011) 15 5839 3179');
  });

  /** Un código que no operamos: agrupado legible en vez de un corte inventado. */
  it('agrupa lo desconocido en vez de adivinar', () => {
    expect(formatArgentinePhone('+5492944123456')).toBe('+54 9 2944 1234 56');
  });

  it('devuelve tal cual lo que es demasiado corto para ser un número', () => {
    expect(formatArgentinePhone('1234')).toBe('1234');
    expect(formatArgentinePhone('sin teléfono')).toBe('sin teléfono');
  });
});
