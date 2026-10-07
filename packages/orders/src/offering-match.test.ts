import { describe, expect, it } from 'vitest';

import { matchOffering, type MatchableOffering } from './offering-match.js';

const menu: MatchableOffering[] = [
  { familyName: 'Menú Paleo & Keto', id: 'keto-250', sizeName: '250' },
  { familyName: 'Menú Paleo & Keto', id: 'keto-400', sizeName: '400' },
  { familyName: 'Menú Vegan', id: 'vegan-250', sizeName: '250' },
  { familyName: 'Menú Vegan', id: 'vegan-400', sizeName: '400' },
  { familyName: 'Menú Vegetariano', id: 'vegetariano-400', sizeName: '400' },
  { familyName: 'Menú Antiage & Detox', id: 'detox-250', sizeName: '250' },
];

describe('matchOffering', () => {
  it('reconoce la oferta por variedad y tamaño', () => {
    expect(matchOffering('Menú Paleo & Keto', '400', menu)).toBe('keto-400');
    expect(matchOffering('Menú Vegan', '250', menu)).toBe('vegan-250');
  });

  // El formulario deja espacios dobles y el catálogo no los tiene.
  it('ignora los espacios de más, las mayúsculas y las tildes', () => {
    expect(matchOffering('  MENU   paleo  &  keto ', '400', menu)).toBe('keto-400');
  });

  // Lo escribe una persona: "y" y "&" son la misma palabra.
  it('toma el "&" como "y"', () => {
    expect(matchOffering('Paleo y Keto', '250', menu)).toBe('keto-250');
  });

  it('no depende de que diga "Menú"', () => {
    expect(matchOffering('Vegan', '400', menu)).toBe('vegan-400');
  });

  it('reconoce el tamaño aunque venga con unidad', () => {
    const catalogo: MatchableOffering[] = [{ familyName: 'Keto', id: 'k', sizeName: '400 g' }];

    expect(matchOffering('Keto', '400', catalogo)).toBe('k');
  });

  /*
   * El caso que justifica que esto no sea más permisivo. "Vegano" está contenido en las dos
   * variedades del catálogo, "Clásico" y "Premium": con dos candidatos no hay respuesta, y elegir
   * uno es cargar el pedido de otra variedad sin que nadie lo note.
   */
  it('no decide cuando hay dos candidatos', () => {
    const ambiguo: MatchableOffering[] = [
      { familyName: 'Menú Vegano Clásico', id: 'a', sizeName: '400' },
      { familyName: 'Menú Vegano Premium', id: 'b', sizeName: '400' },
    ];

    expect(matchOffering('Vegano', '400', ambiguo)).toBeNull();
  });

  it('resuelve por contención cuando hay un solo candidato', () => {
    const catalogo: MatchableOffering[] = [
      { familyName: 'Menú Vegetariano Clásico', id: 'v', sizeName: '400' },
    ];

    expect(matchOffering('Vegetariano', '400', catalogo)).toBe('v');
  });

  it('devuelve null cuando el tamaño no existe para esa variedad', () => {
    // Vegetariano sólo se publicó en 400.
    expect(matchOffering('Menú Vegetariano', '250', menu)).toBeNull();
  });

  it('devuelve null para una variedad que no está en el menú', () => {
    expect(matchOffering('Menú Carnívoro', '400', menu)).toBeNull();
  });

  it('devuelve null si falta la variedad o el tamaño', () => {
    expect(matchOffering(null, '400', menu)).toBeNull();
    expect(matchOffering('Menú Vegan', null, menu)).toBeNull();
    expect(matchOffering('', '400', menu)).toBeNull();
  });

  // Dos ofertas idénticas no se pueden distinguir: una persona tiene que elegir.
  it('devuelve null si el catálogo repite exactamente la misma oferta', () => {
    const repetido: MatchableOffering[] = [
      { familyName: 'Keto', id: 'a', sizeName: '400' },
      { familyName: 'Keto', id: 'b', sizeName: '400' },
    ];

    expect(matchOffering('Keto', '400', repetido)).toBeNull();
  });
});
