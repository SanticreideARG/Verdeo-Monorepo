import { describe, expect, it } from 'vitest';

import {
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
