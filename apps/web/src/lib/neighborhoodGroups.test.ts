import { describe, expect, it } from 'vitest';

import { neighborhoodHeading } from './neighborhoodGroups.js';

describe('neighborhoodHeading', () => {
  const paradas = [
    { neighborhood: 'Núñez' },
    { neighborhood: 'Núñez' },
    { neighborhood: null },
    { neighborhood: 'Palermo' },
  ];

  it('anuncia el barrio sólo cuando cambia respecto de la parada anterior', () => {
    expect(paradas.map((_, index) => neighborhoodHeading(paradas, index))).toEqual([
      'Núñez',
      null,
      'Sin barrio',
      'Palermo',
    ]);
  });

  it('sin ningún barrio cargado no anuncia nada', () => {
    const sinBarrios = [{ neighborhood: null }, { neighborhood: null }];
    expect(sinBarrios.map((_, index) => neighborhoodHeading(sinBarrios, index))).toEqual([
      null,
      null,
    ]);
  });
});
