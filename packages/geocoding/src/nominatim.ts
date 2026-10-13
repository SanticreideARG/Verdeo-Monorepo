import { searchableAddress } from './address-query.js';
import {
  GeocodingProviderError,
  LocationLinkGeocodingProvider,
  validateGeocodingCandidates,
  type GeocodingCandidate,
  type GeocodingInput,
  type GeocodingProvider,
} from './index.js';

interface NominatimResult {
  address?: Record<string, string | undefined>;
  addresstype?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  osm_id?: number;
  osm_type?: string;
  type?: string;
}

/**
 * Qué tan seguro es un resultado de OpenStreetMap, en la escala de 0 a 1 del resto.
 *
 * Con número de puerta es un punto concreto (como el "ROOFTOP" de Google); una calle sin número es
 * un tramo entero, y un barrio o una ciudad no sirven para repartir. Así el umbral de aceptación
 * (0,9 por defecto) deja pasar solo lo que tiene número y manda el resto a revisar.
 */
export function nominatimConfidence(result: NominatimResult): number {
  if (result.address?.house_number) return 0.95;
  const kind = result.addresstype ?? result.type ?? '';
  if (kind === 'building' || kind === 'house') return 0.9;
  if (['road', 'street', 'residential'].includes(kind)) return 0.6;
  return 0.4;
}

/**
 * Buscador de direcciones con OpenStreetMap (Nominatim): gratis y sin clave.
 *
 * Es el respaldo mientras no hay clave de Google: menos preciso con los números de puerta en
 * Argentina, pero suficiente para ubicar la mayoría de las paradas. Respeta la regla de uso del
 * servicio —como mucho un pedido por segundo y un nombre que identifique quién pregunta— y busca
 * sólo en Argentina. Un enlace de ubicación manda: son coordenadas elegidas a mano.
 */
export class NominatimGeocodingProvider implements GeocodingProvider {
  public readonly key = 'openstreetmap';
  private lastRequestAt = 0;

  public constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly userAgent = 'Verdeo-SCA/1.0 (https://verdeo-monorepo-web.vercel.app)',
    private readonly wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly now: () => number = () => Date.now(),
  ) {}

  public async geocode(input: GeocodingInput): Promise<readonly GeocodingCandidate[]> {
    if (input.locationUrl) {
      const fromLink = await new LocationLinkGeocodingProvider().geocode(input);
      if (fromLink.length > 0) return fromLink;
    }

    // Un pedido por segundo como mucho: es la regla del servicio público.
    const elapsed = this.now() - this.lastRequestAt;
    if (elapsed < 1_000) await this.wait(1_000 - elapsed);
    this.lastRequestAt = this.now();

    // Sin piso ni depto y sin el nombre de la zona de reparto, que no son lugares; con la ciudad,
    // que orienta la búsqueda.
    const { places, street } = searchableAddress(input.writtenAddress);
    const city = input.cityHint?.replace(/,?\s*argentina\s*$/i, '').trim();
    const query = [street, ...places, ...(city && places.length === 0 ? [city] : []), 'Argentina']
      .filter((part) => part.length > 0)
      .join(', ');
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('countrycodes', 'ar');
    url.searchParams.set('limit', '5');

    let body: NominatimResult[];
    try {
      const response = await this.fetchImpl(url, {
        headers: { accept: 'application/json', 'user-agent': this.userAgent },
      });
      if (!response.ok) {
        throw new GeocodingProviderError(
          'PROVIDER_UNAVAILABLE',
          `OpenStreetMap respondió ${String(response.status)}`,
        );
      }
      body = (await response.json()) as NominatimResult[];
    } catch (error) {
      if (error instanceof GeocodingProviderError) throw error;
      throw new GeocodingProviderError('PROVIDER_UNAVAILABLE', 'OpenStreetMap no responde');
    }

    const candidates: GeocodingCandidate[] = [];
    for (const result of Array.isArray(body) ? body : []) {
      const latitude = Number(result.lat);
      const longitude = Number(result.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !result.display_name) {
        continue;
      }
      const address = result.address ?? {};
      candidates.push({
        city: address.city ?? address.town ?? address.village ?? address.state_district,
        confidence: nominatimConfidence(result),
        formattedAddress: result.display_name,
        latitude,
        locationUrl: `https://www.openstreetmap.org/?mlat=${String(latitude)}&mlon=${String(longitude)}#map=18/${String(latitude)}/${String(longitude)}`,
        longitude,
        providerCandidateId: `osm:${result.osm_type ?? 'x'}${String(result.osm_id ?? `${String(latitude)},${String(longitude)}`)}`,
        sector: address.suburb ?? address.neighbourhood,
      });
    }
    return validateGeocodingCandidates(candidates);
  }
}
