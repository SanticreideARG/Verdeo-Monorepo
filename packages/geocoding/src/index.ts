export interface GeocodingCandidate {
  city?: string | undefined;
  confidence: number;
  formattedAddress: string;
  latitude: number;
  locationUrl?: string | undefined;
  longitude: number;
  providerCandidateId: string;
  sector?: string | undefined;
}

export interface GeocodingInput {
  idempotencyKey: string;
  locationUrl?: string | undefined;
  requestId: string;
  writtenAddress: string;
}

export interface GeocodingProvider {
  readonly key: string;
  geocode(input: GeocodingInput): Promise<readonly GeocodingCandidate[]>;
}

export class GeocodingProviderError extends Error {
  public constructor(
    public readonly code: 'INVALID_RESPONSE' | 'PROVIDER_UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'GeocodingProviderError';
  }
}

function validCoordinates(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function coordinatePair(value: string | null): { latitude: number; longitude: number } | null {
  if (!value) return null;
  const match = value.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!match?.[1] || !match[2]) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return validCoordinates(latitude, longitude) ? { latitude, longitude } : null;
}

export function parseCoordinatesFromLocationUrl(
  locationUrl: string,
): { latitude: number; longitude: number } | null {
  let url: URL;
  try {
    url = new URL(locationUrl);
  } catch {
    return null;
  }
  for (const key of ['q', 'query', 'll', 'center']) {
    const parsed = coordinatePair(url.searchParams.get(key));
    if (parsed) return parsed;
  }
  const pathMatch = url.pathname.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
  if (!pathMatch?.[1] || !pathMatch[2]) return null;
  const latitude = Number(pathMatch[1]);
  const longitude = Number(pathMatch[2]);
  return validCoordinates(latitude, longitude) ? { latitude, longitude } : null;
}

export function validateGeocodingCandidates(
  candidates: readonly GeocodingCandidate[],
): GeocodingCandidate[] {
  if (candidates.length > 20) {
    throw new GeocodingProviderError(
      'INVALID_RESPONSE',
      'The provider returned too many candidates',
    );
  }
  const unique = new Map<string, GeocodingCandidate>();
  for (const candidate of candidates) {
    if (
      !validCoordinates(candidate.latitude, candidate.longitude) ||
      !Number.isFinite(candidate.confidence) ||
      candidate.confidence < 0 ||
      candidate.confidence > 1 ||
      !candidate.formattedAddress.trim() ||
      !candidate.providerCandidateId.trim()
    ) {
      throw new GeocodingProviderError(
        'INVALID_RESPONSE',
        'The provider returned an invalid candidate',
      );
    }
    unique.set(candidate.providerCandidateId, candidate);
  }
  return [...unique.values()];
}

interface GoogleAddressComponent {
  long_name?: unknown;
  types?: unknown;
}

interface GoogleGeocodingResponse {
  results?: {
    formatted_address?: unknown;
    geometry?: { location?: { lat?: unknown; lng?: unknown }; location_type?: unknown };
    place_id?: unknown;
    address_components?: GoogleAddressComponent[];
  }[];
  status?: unknown;
}

/** Google's `location_type` is a coarse quality signal, mapped onto our 0..1 confidence scale. */
const GOOGLE_CONFIDENCE_BY_LOCATION_TYPE: Record<string, number> = {
  APPROXIMATE: 0.4,
  GEOMETRIC_CENTER: 0.6,
  RANGE_INTERPOLATED: 0.8,
  ROOFTOP: 1,
};

function googleComponent(
  components: readonly GoogleAddressComponent[],
  type: string,
): string | undefined {
  for (const component of components) {
    const types = component.types;
    if (Array.isArray(types) && types.includes(type) && typeof component.long_name === 'string') {
      return component.long_name;
    }
  }
  return undefined;
}

/**
 * Real address lookup through Google's Geocoding API. Slots in behind the same `GeocodingProvider`
 * interface as `LocationLinkGeocodingProvider`, so enabling it is a wiring change in app.ts and
 * nothing else — callers never learn which provider answered.
 *
 * A pasted Maps link still wins when present: it is an exact coordinate the operator chose by hand,
 * which no text search can improve on.
 */
export class GoogleMapsGeocodingProvider implements GeocodingProvider {
  public readonly key = 'google-maps';

  public constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    /** Biases results toward the country the operation actually delivers in. */
    private readonly regionCode = 'ar',
  ) {}

  public async geocode(input: GeocodingInput): Promise<readonly GeocodingCandidate[]> {
    const fromLink = input.locationUrl ? parseCoordinatesFromLocationUrl(input.locationUrl) : null;
    if (fromLink) {
      return [
        {
          confidence: 1,
          formattedAddress: input.writtenAddress,
          latitude: fromLink.latitude,
          locationUrl: input.locationUrl,
          longitude: fromLink.longitude,
          providerCandidateId: `${fromLink.latitude.toFixed(6)},${fromLink.longitude.toFixed(6)}`,
        },
      ];
    }

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', input.writtenAddress);
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('region', this.regionCode);

    let body: GoogleGeocodingResponse;
    try {
      const response = await this.fetchImpl(url, { headers: { accept: 'application/json' } });
      if (!response.ok) {
        throw new GeocodingProviderError(
          'PROVIDER_UNAVAILABLE',
          `Google Geocoding responded ${response.status}`,
        );
      }
      body = (await response.json()) as GoogleGeocodingResponse;
    } catch (error) {
      if (error instanceof GeocodingProviderError) throw error;
      throw new GeocodingProviderError('PROVIDER_UNAVAILABLE', 'Google Geocoding is unreachable');
    }

    // ZERO_RESULTS is a valid empty answer, not a failure: the operator then corrects by hand.
    if (body.status === 'ZERO_RESULTS') return [];
    if (body.status !== 'OK') {
      throw new GeocodingProviderError(
        'PROVIDER_UNAVAILABLE',
        `Google Geocoding returned status ${String(body.status)}`,
      );
    }

    const candidates: GeocodingCandidate[] = [];
    for (const result of (body.results ?? []).slice(0, 20)) {
      const latitude = result.geometry?.location?.lat;
      const longitude = result.geometry?.location?.lng;
      const placeId = result.place_id;
      if (
        typeof latitude !== 'number' ||
        typeof longitude !== 'number' ||
        typeof placeId !== 'string' ||
        typeof result.formatted_address !== 'string'
      ) {
        continue;
      }
      const components = result.address_components ?? [];
      const locationType = result.geometry?.location_type;
      candidates.push({
        city:
          googleComponent(components, 'locality') ??
          googleComponent(components, 'administrative_area_level_2'),
        confidence:
          (typeof locationType === 'string'
            ? GOOGLE_CONFIDENCE_BY_LOCATION_TYPE[locationType]
            : undefined) ?? 0.5,
        formattedAddress: result.formatted_address,
        latitude,
        locationUrl: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
        longitude,
        providerCandidateId: placeId,
        sector: googleComponent(components, 'sublocality'),
      });
    }

    // Reuse the shared validator so a malformed Google payload fails the same way any other
    // provider's would, rather than reaching the database as a bad coordinate.
    return validateGeocodingCandidates(candidates);
  }
}

/**
 * Picks the real provider per call instead of at construction time, because the Google key lives in
 * the database (Ajustes) rather than in an environment variable — it can be added, changed, or
 * disabled while the server is running, and a provider chosen at boot would never see that.
 *
 * Falls back to `LocationLinkGeocodingProvider` whenever no key is configured, so validating an
 * address by pasting a Maps link keeps working exactly as before with nothing set up.
 */
export class ConfigurableGeocodingProvider implements GeocodingProvider {
  public readonly key = 'configurable';
  private readonly fallback = new LocationLinkGeocodingProvider();

  public constructor(
    private readonly resolveApiKey: () => Promise<string | null>,
    private readonly buildGoogleProvider: (apiKey: string) => GeocodingProvider = (apiKey) =>
      new GoogleMapsGeocodingProvider(apiKey),
  ) {}

  public async geocode(input: GeocodingInput): Promise<readonly GeocodingCandidate[]> {
    const apiKey = await this.resolveApiKey().catch(() => null);
    if (!apiKey) return this.fallback.geocode(input);
    try {
      return await this.buildGoogleProvider(apiKey).geocode(input);
    } catch (error) {
      // A provider outage must not block address validation: the operator can still confirm the
      // location by hand, which is exactly what the fallback supports.
      if (error instanceof GeocodingProviderError && error.code === 'PROVIDER_UNAVAILABLE') {
        return this.fallback.geocode(input);
      }
      throw error;
    }
  }
}

export class LocationLinkGeocodingProvider implements GeocodingProvider {
  public readonly key = 'location-link';

  public geocode(input: GeocodingInput): Promise<readonly GeocodingCandidate[]> {
    const coordinates = input.locationUrl
      ? parseCoordinatesFromLocationUrl(input.locationUrl)
      : null;
    if (!coordinates) return Promise.resolve([]);
    return Promise.resolve([
      {
        confidence: 1,
        formattedAddress: input.writtenAddress,
        latitude: coordinates.latitude,
        locationUrl: input.locationUrl,
        longitude: coordinates.longitude,
        providerCandidateId: `${coordinates.latitude.toFixed(6)},${coordinates.longitude.toFixed(6)}`,
      },
    ]);
  }
}
