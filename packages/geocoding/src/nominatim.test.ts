import { describe, expect, it, vi } from 'vitest';

import {
  ConfigurableGeocodingProvider,
  NominatimGeocodingProvider,
  nominatimConfidence,
  type GeocodingInput,
} from './index.js';

const entrada = (extra: Partial<GeocodingInput> = {}): GeocodingInput => ({
  idempotencyKey: 'k',
  requestId: 'r',
  writtenAddress: 'Julián Álvarez 1010, Villa Crespo, CABA',
  ...extra,
});

const respuesta = [
  {
    address: { city: 'Buenos Aires', house_number: '1010', suburb: 'Villa Crespo' },
    addresstype: 'building',
    display_name: '1010, Julián Álvarez, Villa Crespo, Buenos Aires, Argentina',
    lat: '-34.5998',
    lon: '-58.4402',
    osm_id: 123,
    osm_type: 'way',
  },
];

function fetcher(body: unknown) {
  return vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(body))));
}

describe('nominatimConfidence', () => {
  // Con número de puerta es un punto; una calle sola es un tramo: no se acepta sola.
  it('sólo un resultado con número de puerta supera el umbral de aceptación', () => {
    expect(nominatimConfidence({ address: { house_number: '10' } })).toBeGreaterThanOrEqual(0.9);
    expect(nominatimConfidence({ addresstype: 'road' })).toBeLessThan(0.9);
    expect(nominatimConfidence({ addresstype: 'suburb' })).toBeLessThan(0.9);
  });
});

describe('NominatimGeocodingProvider', () => {
  it('busca en Argentina y devuelve el candidato con su barrio y ciudad', async () => {
    const fetch = fetcher(respuesta);
    const provider = new NominatimGeocodingProvider(fetch, 'test', () => Promise.resolve());

    const [candidato] = await provider.geocode(entrada());

    expect(candidato).toMatchObject({
      city: 'Buenos Aires',
      confidence: 0.95,
      latitude: -34.5998,
      longitude: -58.4402,
      providerCandidateId: 'osm:way123',
      sector: 'Villa Crespo',
    });
    const url = fetch.mock.calls[0]?.[0] as URL;
    expect(url.searchParams.get('countrycodes')).toBe('ar');
    expect(url.searchParams.get('q')).toBe('Julián Álvarez 1010, Villa Crespo, CABA, Argentina');
  });

  // La regla de uso del servicio público: como mucho un pedido por segundo.
  it('espera entre un pedido y el siguiente', async () => {
    const wait = vi.fn(() => Promise.resolve());
    let ahora = 10_000;
    const provider = new NominatimGeocodingProvider(fetcher(respuesta), 'test', wait, () => ahora);

    await provider.geocode(entrada());
    ahora += 200;
    await provider.geocode(entrada());

    expect(wait).toHaveBeenCalledWith(800);
  });

  it('un enlace de ubicación manda y no consulta el servicio', async () => {
    const fetch = fetcher(respuesta);
    const provider = new NominatimGeocodingProvider(fetch, 'test', () => Promise.resolve());

    const [candidato] = await provider.geocode(
      entrada({ locationUrl: 'https://maps.google.com/?q=-34.6,-58.44' }),
    );

    expect(candidato?.latitude).toBe(-34.6);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sin resultados devuelve una lista vacía', async () => {
    const provider = new NominatimGeocodingProvider(fetcher([]), 'test', () => Promise.resolve());
    expect(await provider.geocode(entrada())).toEqual([]);
  });
});

describe('ConfigurableGeocodingProvider con OpenStreetMap de respaldo', () => {
  // Mientras no hay clave de Google, ubica con OpenStreetMap.
  it('sin clave de Google usa el respaldo', async () => {
    const fallback = { geocode: vi.fn(() => Promise.resolve([])), key: 'osm' };
    const google = vi.fn();
    const provider = new ConfigurableGeocodingProvider(
      () => Promise.resolve(null),
      google,
      fallback,
    );

    await provider.geocode(entrada());

    expect(fallback.geocode).toHaveBeenCalledOnce();
    expect(google).not.toHaveBeenCalled();
  });
});
