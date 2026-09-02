import { describe, expect, it } from 'vitest';

import {
  ConfigurableGeocodingProvider,
  GeocodingProviderError,
  GoogleMapsGeocodingProvider,
  LocationLinkGeocodingProvider,
  parseCoordinatesFromLocationUrl,
  validateGeocodingCandidates,
} from './index.js';

describe('geocoding domain', () => {
  it('extracts coordinates from supported map URLs', () => {
    expect(parseCoordinatesFromLocationUrl('https://maps.google.com/?q=-34.6037,-58.3816')).toEqual(
      { latitude: -34.6037, longitude: -58.3816 },
    );
    expect(
      parseCoordinatesFromLocationUrl(
        'https://www.google.com/maps/place/test/@-31.4167,-64.1833,15z',
      ),
    ).toEqual({ latitude: -31.4167, longitude: -64.1833 });
  });

  it('does not invent coordinates for unresolved links', async () => {
    const provider = new LocationLinkGeocodingProvider();
    await expect(
      provider.geocode({
        idempotencyKey: 'test-1',
        locationUrl: 'https://maps.app.goo.gl/short-link',
        requestId: 'request-1',
        writtenAddress: 'Dirección escrita',
      }),
    ).resolves.toEqual([]);
  });

  it('rejects malformed provider candidates', () => {
    expect(() =>
      validateGeocodingCandidates([
        {
          confidence: 1.5,
          formattedAddress: 'Dirección',
          latitude: -34,
          longitude: -58,
          providerCandidateId: 'candidate-1',
        },
      ]),
    ).toThrow(/invalid candidate/);
  });
});

describe('GoogleMapsGeocodingProvider', () => {
  const googleResponse = {
    results: [
      {
        address_components: [
          { long_name: 'Neuquén', types: ['locality'] },
          { long_name: 'Centro', types: ['sublocality'] },
        ],
        formatted_address: 'Av. Argentina 100, Neuquén, Argentina',
        geometry: { location: { lat: -38.951, lng: -68.059 }, location_type: 'ROOFTOP' },
        place_id: 'place-1',
      },
    ],
    status: 'OK',
  };

  function stubFetch(body: unknown, ok = true): typeof fetch {
    return (() =>
      Promise.resolve({
        json: () => Promise.resolve(body),
        ok,
        status: ok ? 200 : 500,
      })) as unknown as typeof fetch;
  }

  it('maps a Google result onto a candidate, scoring ROOFTOP as full confidence', async () => {
    const provider = new GoogleMapsGeocodingProvider('key', stubFetch(googleResponse));

    const [candidate] = await provider.geocode({
      idempotencyKey: 'test-1',
      requestId: 'request-1',
      writtenAddress: 'Av. Argentina 100',
    });

    expect(candidate).toMatchObject({
      city: 'Neuquén',
      confidence: 1,
      latitude: -38.951,
      longitude: -68.059,
      providerCandidateId: 'place-1',
      sector: 'Centro',
    });
  });

  // A pasted Maps link is a coordinate the operator picked by hand; no text search improves on it,
  // so it short-circuits before the API is ever called.
  it('prefers a pasted location link over calling the API', async () => {
    const failingFetch = (() => {
      throw new Error('should not be called');
    }) as unknown as typeof fetch;
    const provider = new GoogleMapsGeocodingProvider('key', failingFetch);

    const [candidate] = await provider.geocode({
      idempotencyKey: 'test-2',
      locationUrl: 'https://maps.google.com/?q=-38.95,-68.05',
      requestId: 'request-2',
      writtenAddress: 'Av. Argentina 100',
    });

    expect(candidate).toMatchObject({ confidence: 1, latitude: -38.95, longitude: -68.05 });
  });

  it('treats ZERO_RESULTS as an empty answer, not a failure', async () => {
    const provider = new GoogleMapsGeocodingProvider(
      'key',
      stubFetch({ results: [], status: 'ZERO_RESULTS' }),
    );

    await expect(
      provider.geocode({
        idempotencyKey: 'test-3',
        requestId: 'request-3',
        writtenAddress: 'Calle inexistente 9999',
      }),
    ).resolves.toEqual([]);
  });
});

describe('ConfigurableGeocodingProvider', () => {
  it('falls back to link parsing when no key is configured', async () => {
    const provider = new ConfigurableGeocodingProvider(() => Promise.resolve(null));

    const [candidate] = await provider.geocode({
      idempotencyKey: 'test-4',
      locationUrl: 'https://maps.google.com/?q=-34.6,-58.4',
      requestId: 'request-4',
      writtenAddress: 'Av. Rivadavia 100',
    });

    expect(candidate).toMatchObject({ latitude: -34.6, longitude: -58.4 });
  });

  // An outage must not block address validation: the operator can still confirm by hand.
  it('falls back when the configured provider is unavailable', async () => {
    const provider = new ConfigurableGeocodingProvider(
      () => Promise.resolve('key'),
      () => ({
        geocode: () =>
          Promise.reject(
            new GeocodingProviderError('PROVIDER_UNAVAILABLE', 'Google Geocoding is unreachable'),
          ),
        key: 'google-maps',
      }),
    );

    const [candidate] = await provider.geocode({
      idempotencyKey: 'test-5',
      locationUrl: 'https://maps.google.com/?q=-34.6,-58.4',
      requestId: 'request-5',
      writtenAddress: 'Av. Rivadavia 100',
    });

    expect(candidate).toMatchObject({ latitude: -34.6, longitude: -58.4 });
  });
});
