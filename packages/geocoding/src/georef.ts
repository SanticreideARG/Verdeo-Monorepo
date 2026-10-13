import { searchableAddress } from './address-query.js';
import {
  GeocodingProviderError,
  LocationLinkGeocodingProvider,
  type GeocodingCandidate,
  type GeocodingInput,
  type GeocodingProvider,
} from './index.js';
import { distanceKm } from './sanitizer.js';

interface GeorefAddress {
  altura?: { valor?: number | null } | null;
  calle?: { nombre?: string | null } | null;
  departamento?: { nombre?: string | null } | null;
  localidad_censal?: { nombre?: string | null } | null;
  nomenclatura?: string;
  provincia?: { id?: string; nombre?: string | null } | null;
  ubicacion?: { lat?: number | null; lon?: number | null } | null;
}

interface GeorefPlace {
  departmentId: string | null;
  provinceId: string;
}

const BASE_URL = 'https://apis.datos.gob.ar/georef/api';
/** La Ciudad de Buenos Aires: sus "departamentos" son comunas, que no hace falta acotar. */
const CABA = '02';
/** Más lejos del origen que esto no es una parada de la ciudad (igual que el radio por defecto). */
const MAX_DISTANCE_KM = 60;

// Lo que no distingue una calle de otra: "Av.", "Gral.", "del"…
const FILLER = new Set([
  'av',
  'avda',
  'avenida',
  'calle',
  'de',
  'del',
  'dr',
  'gral',
  'general',
  'la',
  'las',
  'los',
  'pasaje',
  'pje',
  'pres',
  'presidente',
  'san',
  'santa',
]);

function streetWords(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0 && !FILLER.has(word) && !/^\d+$/.test(word))
    .sort()
    .join(' ');
}

/**
 * Buscador de direcciones de Georef, la API de datos abiertos del gobierno nacional
 * (apis.datos.gob.ar): gratis, sin clave, y con las alturas de cada tramo de calle del país. Donde
 * OpenStreetMap no tiene números de puerta cargados —la mayor parte de la Ciudad de Buenos Aires—,
 * Georef ubica la altura sobre la cuadra.
 *
 * Sólo viaja la calle con su número y la provincia (o el departamento): nada del cliente. La
 * provincia sale del origen de la ciudad, preguntándole a Georef en qué provincia cae ese punto
 * (una vez por proceso). Si no encuentra la dirección, sigue con el buscador siguiente.
 */
export class GeorefGeocodingProvider implements GeocodingProvider {
  public readonly key: string;
  private readonly places = new Map<string, GeorefPlace | null>();

  public constructor(
    private readonly next: GeocodingProvider,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.key = `georef+${next.key}`;
  }

  public async geocode(input: GeocodingInput): Promise<readonly GeocodingCandidate[]> {
    if (input.locationUrl) {
      const fromLink = await new LocationLinkGeocodingProvider().geocode(input);
      if (fromLink.length > 0) return fromLink;
    }
    const { street } = searchableAddress(input.writtenAddress);
    // Sin número no hay altura que ubicar: Georef no aporta y queda para el siguiente.
    if (!/\d/.test(street)) return this.next.geocode(input);

    let candidates: GeocodingCandidate[];
    try {
      candidates = await this.search(street, input.origin);
    } catch {
      // Georef caído o lento: no frena la ubicación, sigue el buscador siguiente.
      candidates = [];
    }
    return candidates.length > 0 ? candidates : this.next.geocode(input);
  }

  private async search(
    street: string,
    origin: GeocodingInput['origin'],
  ): Promise<GeocodingCandidate[]> {
    const place = origin ? await this.placeFor(origin) : null;
    const url = new URL(`${BASE_URL}/direcciones`);
    url.searchParams.set('direccion', street);
    url.searchParams.set('max', '10');
    if (place) {
      url.searchParams.set('provincia', place.provinceId);
      if (place.departmentId) url.searchParams.set('departamento', place.departmentId);
    }
    const body = (await this.getJson(url)) as { direcciones?: GeorefAddress[] };

    const found = (body.direcciones ?? [])
      .map((address) => ({
        address,
        latitude: Number(address.ubicacion?.lat),
        longitude: Number(address.ubicacion?.lon),
      }))
      .filter(
        (row) =>
          Number.isFinite(row.latitude) &&
          Number.isFinite(row.longitude) &&
          row.address.ubicacion?.lat != null &&
          (!origin || distanceKm(origin, row) <= MAX_DISTANCE_KM),
      )
      .sort((a, b) => (origin ? distanceKm(origin, a) - distanceKm(origin, b) : 0));

    // Dos calles distintas con la misma altura ("Rivadavia" y "Comodoro Martín Rivadavia"): gana
    // la que se llama exactamente como se escribió. Si no hay una sola así, va a revisión.
    const wanted = streetWords(street);
    const exact = found.filter((row) => streetWords(row.address.calle?.nombre ?? '') === wanted);
    // La misma calle en dos ciudades vecinas (Cipolletti y Roca): si la más cercana queda en la
    // ciudad y la otra lejos, es esa.
    const [closest, second] = found;
    const clearlyClosest =
      origin && closest && second
        ? distanceKm(origin, closest) <= 10 && distanceKm(origin, second) >= 20
        : false;
    const sure =
      found.length === 1
        ? found[0]
        : exact.length === 1
          ? exact[0]
          : clearlyClosest
            ? closest
            : undefined;

    return found.map((row) => {
      const hasNumber = row.address.altura?.valor != null;
      const confidence = !hasNumber ? 0.6 : row === sure ? 0.95 : 0.75;
      const { latitude, longitude } = row;
      return {
        city: row.address.localidad_censal?.nombre ?? row.address.provincia?.nombre ?? undefined,
        confidence,
        formattedAddress: row.address.nomenclatura ?? street,
        latitude,
        locationUrl: `https://www.google.com/maps/search/?api=1&query=${String(latitude)},${String(longitude)}`,
        longitude,
        providerCandidateId: `georef:${latitude.toFixed(6)},${longitude.toFixed(6)}`,
        sector: row.address.departamento?.nombre ?? undefined,
      };
    });
  }

  /** En qué provincia (y departamento, fuera de la Ciudad) cae el origen. */
  private async placeFor(origin: {
    latitude: number;
    longitude: number;
  }): Promise<GeorefPlace | null> {
    const cacheKey = `${origin.latitude.toFixed(3)},${origin.longitude.toFixed(3)}`;
    if (this.places.has(cacheKey)) return this.places.get(cacheKey) ?? null;
    const url = new URL(`${BASE_URL}/ubicacion`);
    url.searchParams.set('lat', String(origin.latitude));
    url.searchParams.set('lon', String(origin.longitude));
    let place: GeorefPlace | null = null;
    try {
      const body = (await this.getJson(url)) as {
        ubicacion?: { departamento?: { id?: string | null }; provincia?: { id?: string | null } };
      };
      const provinceId = body.ubicacion?.provincia?.id;
      if (provinceId) {
        place = {
          departmentId: provinceId === CABA ? null : (body.ubicacion?.departamento?.id ?? null),
          provinceId,
        };
      }
    } catch {
      // Sin respuesta no se guarda: la próxima búsqueda vuelve a preguntar.
      return null;
    }
    this.places.set(cacheKey, place);
    return place;
  }

  private async getJson(url: URL): Promise<unknown> {
    const response = await this.fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new GeocodingProviderError(
        'PROVIDER_UNAVAILABLE',
        `Georef respondió ${String(response.status)}`,
      );
    }
    return response.json();
  }
}
