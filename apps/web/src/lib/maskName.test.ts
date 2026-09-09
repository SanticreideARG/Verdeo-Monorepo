import { describe, expect, it } from 'vitest';

import { maskSurname } from './maskName.js';

describe('maskSurname', () => {
  it('deja el nombre de pila y reduce el resto a iniciales', () => {
    expect(maskSurname('Ana Isabella Vega')).toBe('Ana I. V.');
  });

  it('no toca un nombre de una sola palabra', () => {
    // No hay apellido que tapar, y recortarlo dejaría la fila sin identificar a nadie.
    expect(maskSurname('Lola')).toBe('Lola');
  });

  it('distingue dos personas con el mismo nombre de pila', () => {
    // Por eso quedan las iniciales en vez de borrarse: si no, la lista tendría dos "Ana" iguales.
    expect(maskSurname('Ana Vega')).not.toBe(maskSurname('Ana Pérez'));
  });

  it('tolera espacios de más', () => {
    expect(maskSurname('  Juan   Carlos  Pérez ')).toBe('Juan C. P.');
  });

  it('no parte los acentos ni los caracteres fuera del alfabeto latino', () => {
    // Recortar por índice de unidad de código partía un carácter compuesto al medio.
    expect(maskSurname('Ana Ñandú')).toBe('Ana Ñ.');
  });
});
