import { describe, expect, it, vi } from 'vitest';

import {
  GeorefGeocodingProvider,
  GeorefPlaceFinder,
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

  // Se buscaba entero y no aparecía nada.
  it('corta la calle en la altura: lo que sigue no lo entiende un buscador', () => {
    expect(
      searchableAddress('Silvio Ruggieri 299 Edif San Marcos 29 B dejar al guardia, Recoleta'),
    ).toEqual({ places: ['Recoleta'], street: 'Silvio Ruggieri 299' });
    expect(searchableAddress('25 de Mayo 300').street).toBe('25 de Mayo 300');
    expect(searchableAddress('Calle 7 n° 1234, La Plata').street).toBe('Calle 7 n° 1234');
    expect(searchableAddress('Gallo 606 torre 1 6to 4').street).toBe('Gallo 606');
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

describe('GeorefGeocodingProvider en una región', () => {
  it('busca en cada departamento y descarta lo que no cae cerca de una localidad', async () => {
    const neuquen = { latitude: -38.952, longitude: -68.059 };
    const regina = { latitude: -39.095, longitude: -67.082 };
    const direccion = (nomenclatura: string, lat: number, lon: number) => ({
      altura: { valor: 855 },
      calle: { nombre: 'TUCUMAN' },
      nomenclatura,
      ubicacion: { lat, lon },
    });
    const fetchImpl = vi.fn((url: URL) => {
      if (url.pathname.endsWith('/ubicacion')) {
        const enNeuquen = url.searchParams.get('lon')?.startsWith('-68');
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ubicacion: {
                departamento: { id: enNeuquen ? '58035' : '62042' },
                provincia: { id: enNeuquen ? '58' : '62' },
              },
            }),
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            direcciones:
              url.searchParams.get('provincia') === '58'
                ? [direccion('TUCUMAN 855, Neuquén', -38.95, -68.06)]
                : [
                    direccion('TUCUMAN 855, Villa Regina', -39.1, -67.08),
                    direccion('TUCUMAN 855, Bariloche', -41.13, -71.3),
                  ],
          }),
        ),
      );
    });
    const next = { geocode: vi.fn(() => Promise.resolve([])), key: 'siguiente' };
    const provider = new GeorefGeocodingProvider(next, fetchImpl as unknown as typeof fetch);

    const found = await provider.geocode({
      area: { points: [neuquen, regina], radiusKm: 15 },
      idempotencyKey: 'k',
      origin: { latitude: -39.02, longitude: -67.57 },
      radiusKm: 60,
      requestId: 'r',
      writtenAddress: 'Tucumán 855',
    });

    expect(found.map((row) => row.formattedAddress).sort()).toEqual([
      'TUCUMAN 855, Neuquén',
      'TUCUMAN 855, Villa Regina',
    ]);
    // Con la misma calle en dos localidades no se puede estar seguro: elige una persona.
    expect(found.every((row) => row.confidence < 0.9)).toBe(true);
  });
});

describe('GeorefPlaceFinder', () => {
  const localidades = (rows: unknown[]) =>
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ localidades: rows }))));
  const fila = (nombre: string, provincia: string, lat: number, lon: number) => ({
    centroide: { lat, lon },
    nombre,
    provincia: { nombre: provincia },
  });

  it('saltea un nombre que existe en dos provincias', async () => {
    const fetchImpl = vi.fn((url: URL) =>
      localidades(
        url.searchParams.get('nombre') === 'General Roca'
          ? [
              fila('General Roca', 'Río Negro', -39, -67.5),
              fila('General Roca', 'Córdoba', -32, -61),
            ]
          : [fila('Cipolletti', 'Río Negro', -38.9, -68)],
      )(),
    );
    const finder = new GeorefPlaceFinder(fetchImpl as unknown as typeof fetch);

    expect(await finder.find(['General Roca', 'Cipolletti'])).toEqual({
      latitude: -38.9,
      longitude: -68,
    });
  });

  it('con la provincia escrita la pregunta acotada, y no toma nombres parecidos', async () => {
    const fetchImpl = localidades([fila('Colonia General Roca', 'Río Negro', -39, -67)]);
    const finder = new GeorefPlaceFinder(fetchImpl);

    expect(await finder.find(['General Roca, Río Negro, Argentina'])).toBeNull();
    const url = (fetchImpl.mock.calls[0] as unknown as [URL])[0];
    expect(url.searchParams.get('provincia')).toBe('Río Negro');
  });

  it('si Georef está caído no decide nada', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error('caído')));
    const finder = new GeorefPlaceFinder(fetchImpl);
    expect(await finder.find(['Cipolletti'])).toBeNull();
  });
});
