import { describe, expect, it } from 'vitest';

import { splitAddressDetail } from './address-detail.js';

describe('splitAddressDetail', () => {
  it.each([
    ['Rivadeo 1570 4 A', 'Rivadeo 1570', '4 A'],
    ['Santa Rosa 31 Piso 12 Dpto C Torre 1', 'Santa Rosa 31', 'Piso 12 Dpto C Torre 1'],
    ['Santa Rosa 470 playa de estacionamiento', 'Santa Rosa 470', 'playa de estacionamiento'],
    ['27 de abril 206 dpto 3 A', '27 de abril 206', 'dpto 3 A'],
    ['Mendoza 82 PB', 'Mendoza 82', 'PB'],
    ['BV Illia 440 9C', 'BV Illia 440', '9C'],
    [
      'Hipolito yrigoyen 584 piso 6, recibe Mariano Cabral',
      'Hipolito yrigoyen 584',
      'piso 6, recibe Mariano Cabral',
    ],
    ['Chacabuco 847, 7B', 'Chacabuco 847', '7B'],
    ['Housing de Miradores, casa 132', 'Housing de Miradores', 'casa 132'],
    [
      'O Higgins 5500 Barrio Santina Sur lote 17 manzana 9',
      'O Higgins 5500',
      'Barrio Santina Sur lote 17 manzana 9',
    ],
    ['Calle 9 de Julio 123 2B', 'Calle 9 de Julio 123', '2B'],
  ])('%s', (text, line1, line2) => {
    expect(splitAddressDetail(text)).toEqual({ line1, line2 });
  });

  it.each([
    'Paso de los Andes 365',
    'Punta del sauce 1254',
    'Av. Rivadavia 100, Sin clasificar, Neuquén',
  ])('sin detalle: %s', (text) => {
    expect(splitAddressDetail(text)).toEqual({ line1: text, line2: null });
  });

  it('la ciudad después de una coma queda en la línea 1', () => {
    expect(splitAddressDetail('Mitre 648 piso 2, Neuquén')).toEqual({
      line1: 'Mitre 648',
      line2: 'piso 2, Neuquén',
    });
    expect(splitAddressDetail('Mitre 648, Neuquén, casa 3')).toEqual({
      line1: 'Mitre 648, Neuquén',
      line2: 'casa 3',
    });
  });
});
