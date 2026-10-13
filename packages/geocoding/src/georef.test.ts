import { describe, expect, it, vi } from 'vitest';

import {
  GeorefGeocodingProvider,
  LinkExpandingGeocodingProvider,
  LocationLinkGeocodingProvider,
  parseCoordinatesFromLocationUrl,
  searchableAddress,
  type GeocodingCandidate,
  type GeocodingProvider,
} from './index.js';

const ORIGIN = { latitude: -34.6037, longitude: -58.3816 };

function entrada(extra: Record<string, unknown> = {}) {
  return {
    idempotencyKey: 'k-1',
    origin: ORIGIN,
    requestId: 'r-1',
    writtenAddress: 'Av. Rivadavia 1470, Zona General, Buenos Aires',
    ...extra,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function siguiente(candidates: GeocodingCandidate[] = []) {
  const geocode = vi.fn(() => Promise.resolve(candidates));
  return { geocode, provider: { geocode, key: 'openstreetmap' } as GeocodingProvider };
}

function georefFetch(direcciones: unknown[]) {
  return vi.fn((url: URL) =>
    Promise.resolve(
      url.pathname.endsWith('/ubicacion')
        ? json({ ubicacion: { departamento: { id: '02007' }, provincia: { id: '02' } } })
        : json({ cantidad: direcciones.length, direcciones }),
    ),
  );
}

describe('searchableAddress', () => {
  it('saca el piso o depto pegado al número', () => {
    expect(searchableAddress('Libertador 8520-17A, Núñez')).toEqual({
      places: ['Núñez'],
      street: 'Libertador 8520',
    });
    expect(searchableAddress('Mitre 400 piso 3 dto B').street).toBe('Mitre 400');
    expect(searchableAddress('Mitre 400 / 2').street).toBe('Mitre 400');
  });

  it('descarta la zona de reparto, que no es un lugar', () => {
    expect(searchableAddress('Av. Rivadavia 1470, Zona General, Buenos Aires')).toEqual({
      places: ['Buenos Aires'],
      street: 'Av. Rivadavia 1470',
    });
  });
});

describe('enlaces de Maps', () => {
  it('prefiere el pin del lugar al centro de la vista', () => {
    expect(
      parseCoordinatesFromLocationUrl(
        'https://www.google.com/maps/place/X/@-34.50,-58.40,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-34.5371!4d-58.4663',
      ),
    ).toEqual({ latitude: -34.5371, longitude: -58.4663 });
  });

  it('expande un enlace corto y conserva el original en el candidato', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(null, {
          headers: {
            location:
              'https://www.google.com/maps/place/X/data=!4m2!3m1!1s0x0!8m2!3d-34.5371!4d-58.4663',
          },
          status: 302,
        }),
      ),
    );
    const provider = new LinkExpandingGeocodingProvider(
      new LocationLinkGeocodingProvider(),
      fetchImpl,
    );

    const [candidate] = await provider.geocode(
      entrada({ locationUrl: 'https://maps.app.goo.gl/abc123' }),
    );

    expect(candidate).toMatchObject({
      latitude: -34.5371,
      locationUrl: 'https://maps.app.goo.gl/abc123',
      longitude: -58.4663,
    });
  });

  it('no sale a enlaces que no son de Google', async () => {
    const fetchImpl = vi.fn();
    const provider = new LinkExpandingGeocodingProvider(
      new LocationLinkGeocodingProvider(),
      fetchImpl,
    );
    await provider.geocode(entrada({ locationUrl: 'https://ejemplo.com/a' }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('GeorefGeocodingProvider', () => {
  const rivadavia = {
    altura: { valor: 1470 },
    calle: { nombre: 'AV RIVADAVIA' },
    nomenclatura: 'AV RIVADAVIA 1470, Comuna 1, Ciudad Autónoma de Buenos Aires',
    provincia: { id: '02', nombre: 'Ciudad Autónoma de Buenos Aires' },
    ubicacion: { lat: -34.6088, lon: -58.3872 },
  };
  const comodoro = {
    altura: { valor: 1470 },
    calle: { nombre: 'AV COMOD MARTIN RIVADAVIA' },
    nomenclatura: 'AV COMOD MARTIN RIVADAVIA 1470, Comuna 13, Ciudad Autónoma de Buenos Aires',
    provincia: { id: '02', nombre: 'Ciudad Autónoma de Buenos Aires' },
    ubicacion: { lat: -34.5406, lon: -58.4622 },
  };

  it('busca sólo la calle y el número, en la provincia del origen', async () => {
    const fetchImpl = georefFetch([rivadavia]);
    const provider = new GeorefGeocodingProvider(
      siguiente().provider,
      fetchImpl as unknown as typeof fetch,
    );
    await provider.geocode(entrada());

    const busqueda = fetchImpl.mock.calls
      .map(([url]) => url)
      .find((url) => url.pathname.endsWith('/direcciones'));
    expect(busqueda?.searchParams.get('direccion')).toBe('Av. Rivadavia 1470');
    expect(busqueda?.searchParams.get('provincia')).toBe('02');
    // En la Ciudad, las comunas no acotan.
    expect(busqueda?.searchParams.get('departamento')).toBeNull();
  });

  it('entre dos calles con la misma altura, acepta la que se llama como se escribió', async () => {
    const provider = new GeorefGeocodingProvider(
      siguiente().provider,
      georefFetch([comodoro, rivadavia]) as unknown as typeof fetch,
    );
    const candidates = await provider.geocode(entrada());
    const best = [...candidates].sort((a, b) => b.confidence - a.confidence)[0];
    expect(best).toMatchObject({ confidence: 0.95, latitude: -34.6088 });
    expect(candidates.find((c) => c.latitude === -34.5406)?.confidence).toBeLessThan(0.9);
  });

  it('si Georef no la encuentra, sigue con el buscador siguiente', async () => {
    const next = siguiente();
    const provider = new GeorefGeocodingProvider(
      next.provider,
      georefFetch([]) as unknown as typeof fetch,
    );
    await provider.geocode(entrada());
    expect(next.geocode).toHaveBeenCalledTimes(1);
  });

  it('si Georef está caído, sigue con el buscador siguiente', async () => {
    const next = siguiente();
    const provider = new GeorefGeocodingProvider(
      next.provider,
      vi.fn(() => Promise.resolve(json({}, 503))),
    );
    await provider.geocode(entrada());
    expect(next.geocode).toHaveBeenCalledTimes(1);
  });

  it('descarta lo que queda lejos de la ciudad', async () => {
    const lejos = { ...rivadavia, ubicacion: { lat: -34.57, lon: -60.96 } };
    const next = siguiente();
    const provider = new GeorefGeocodingProvider(
      next.provider,
      georefFetch([lejos]) as unknown as typeof fetch,
    );
    expect(await provider.geocode(entrada())).toEqual([]);
    expect(next.geocode).toHaveBeenCalledTimes(1);
  });
});
