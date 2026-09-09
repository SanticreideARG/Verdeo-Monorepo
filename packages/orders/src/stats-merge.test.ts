import { describe, expect, it } from 'vitest';

import { mergeByLooseName } from './stats-merge.js';

describe('mergeByLooseName', () => {
  it('junta el mismo nombre escrito con otra caja', () => {
    /*
     * El caso real: la torta de "Demanda por variedad" mostraba "Menú Real" con 15 unidades y
     * "MENÚ REAL" con 6, como si fueran dos variedades que compiten.
     */
    const merged = mergeByLooseName(
      [
        { familyName: 'Menú Real', revenueMinor: 150_000, units: 15 },
        { familyName: 'MENÚ REAL', revenueMinor: 60_000, units: 6 },
      ],
      'familyName',
      ['units', 'revenueMinor'],
    );

    expect(merged).toEqual([{ familyName: 'Menú Real', revenueMinor: 210_000, units: 21 }]);
  });

  it('también junta los que difieren en acentos o espacios', () => {
    const merged = mergeByLooseName(
      [
        { familyName: 'Menú Anti-Age', units: 18 },
        { familyName: 'Menu  anti-age', units: 6 },
      ],
      'familyName',
      ['units'],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.units).toBe(24);
  });

  it('muestra la escritura que más se usó, no la primera que llegó', () => {
    // Quedarse con la primera dejaría el informe titulado por el error de tipeo de una semana.
    const merged = mergeByLooseName(
      [
        { familyName: 'MENÚ KETO', units: 3 },
        { familyName: 'Menú Keto', units: 21 },
      ],
      'familyName',
      ['units'],
    );

    expect(merged[0]?.familyName).toBe('Menú Keto');
  });

  it('con el mismo peso no depende del orden en que vinieron las filas', () => {
    const rows = [
      { familyName: 'Menú Keto', units: 5 },
      { familyName: 'MENÚ KETO', units: 5 },
    ];

    expect(mergeByLooseName(rows, 'familyName', ['units'])[0]?.familyName).toBe('Menú Keto');
    expect(mergeByLooseName([...rows].reverse(), 'familyName', ['units'])[0]?.familyName).toBe(
      'MENÚ KETO',
    );
  });

  it('deja en paz a los que de verdad son distintos', () => {
    const merged = mergeByLooseName(
      [
        { familyName: 'Intuitivo', units: 23 },
        { familyName: 'Menú Keto', units: 21 },
      ],
      'familyName',
      ['units'],
    );

    expect(merged).toHaveLength(2);
  });

  it('no rompe con una lista vacía', () => {
    expect(mergeByLooseName([], 'familyName', ['units'])).toEqual([]);
  });
});
