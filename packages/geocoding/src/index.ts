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
