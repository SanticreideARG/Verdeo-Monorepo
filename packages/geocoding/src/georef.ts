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
      candidates = await this.search(street, input.origin, input.area);
    } catch {
      // Georef caído o lento: no frena la ubicación, sigue el buscador siguiente.
      candidates = [];
    }
    return candidates.length > 0 ? candidates : this.next.geocode(input);
  }

  private async search(
    street: string,
    origin: GeocodingInput['origin'],
    area?: GeocodingInput['area'],
  ): Promise<GeocodingCandidate[]> {
    const points = area?.points ?? (origin ? [origin] : []);
    const reach = area?.radiusKm ?? MAX_DISTANCE_KM;
    const nearest = (row: { latitude: number; longitude: number }) =>
      Math.min(...points.map((point) => distanceKm(point, row)));
    // Una búsqueda por departamento: una región como el Alto Valle cae en más de uno.
    const resolved = await Promise.all(points.map((point) => this.placeFor(point)));
    const places = new Map(
      resolved.flatMap((place) =>
        place ? [[`${place.provinceId}|${place.departmentId ?? ''}`, place] as const] : [],
      ),
    );
    const bodies = await Promise.all(
      [...(places.size > 0 ? places.values() : [null])].map(async (place) => {
        const url = new URL(`${BASE_URL}/direcciones`);
        url.searchParams.set('direccion', street);
        url.searchParams.set('max', '10');
        if (place) {
          url.searchParams.set('provincia', place.provinceId);
          if (place.departmentId) url.searchParams.set('departamento', place.departmentId);
        }
        return (await this.getJson(url)) as { direcciones?: GeorefAddress[] };
      }),
    );

    const found = bodies
      .flatMap((body) => body.direcciones ?? [])
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
          (points.length === 0 || nearest(row) <= reach),
      )
      .sort((a, b) => (points.length > 0 ? nearest(a) - nearest(b) : 0));

    // Dos calles distintas con la misma altura ("Rivadavia" y "Comodoro Martín Rivadavia"): gana
    // la que se llama exactamente como se escribió. Si no hay una sola así, va a revisión.
    const wanted = streetWords(street);
    const exact = found.filter((row) => streetWords(row.address.calle?.nombre ?? '') === wanted);
    // La misma calle en dos ciudades vecinas (Cipolletti y Roca): si la más cercana queda en la
    // ciudad y la otra lejos, es esa.
    const [closest, second] = found;
    const clearlyClosest =
      origin && !area && closest && second
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

/** Dónde queda un lugar, sabiendo sólo cómo se llama. */
export interface PlaceFinder {
  /** El primero de los nombres que no deja dudas. */
  find(names: readonly string[]): Promise<{ latitude: number; longitude: number } | null>;
  /** Todos los que se pudieron ubicar, para una región de varias localidades. */
  findAll(names: readonly string[]): Promise<{ latitude: number; longitude: number }[]>;
}

function placeWords(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * El centro de una ciudad a partir de su nombre, con las localidades de Georef.
 *
 * Es para acotar la búsqueda de direcciones cuando la ciudad no tiene origen cargado. Prueba los
 * nombres en orden y se queda con el primero que no deja dudas: el nombre exacto y una sola
 * provincia. "General Roca" existe en Río Negro y en Córdoba, así que sin provincia se saltea, y
 * "Cipolletti, Río Negro" vale tal cual. Si no llega a una certeza devuelve null: un área
 * equivocada es peor que decir que no se sabe.
 */
export class GeorefPlaceFinder implements PlaceFinder {
  private readonly known = new Map<string, { latitude: number; longitude: number } | null>();

  public constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  public async find(
    names: readonly string[],
  ): Promise<{ latitude: number; longitude: number } | null> {
    for (const name of [...new Set(names)].slice(0, 8)) {
      const point = await this.lookup(name);
      if (point) return point;
    }
    return null;
  }

  public async findAll(names: readonly string[]) {
    const points = await Promise.all([...new Set(names)].map((name) => this.lookup(name)));
    return points.filter((point) => point !== null);
  }

  private async lookup(name: string) {
    const key = placeWords(name);
    if (this.known.has(key)) return this.known.get(key) ?? null;
    const [place, province] = name
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && placeWords(part) !== 'argentina');
    if (!place) return null;

    const url = new URL(`${BASE_URL}/localidades`);
    url.searchParams.set('nombre', place);
    url.searchParams.set('campos', 'nombre,provincia.nombre,centroide');
    url.searchParams.set('max', '20');
    if (province) url.searchParams.set('provincia', province);

    let body: {
      localidades?: {
        centroide?: { lat?: number | null; lon?: number | null } | null;
        nombre?: string | null;
        provincia?: { nombre?: string | null } | null;
      }[];
    };
    try {
      const response = await this.fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) return null;
      body = (await response.json()) as typeof body;
    } catch {
      // Sin respuesta no se recuerda: la próxima búsqueda vuelve a preguntar.
      return null;
    }

    const exact = (body.localidades ?? []).filter(
      (row) =>
        placeWords(row.nombre ?? '') === placeWords(place) &&
        row.centroide?.lat != null &&
        row.centroide.lon != null,
    );
    const provinces = new Set(exact.map((row) => row.provincia?.nombre));
    const center = provinces.size === 1 ? exact[0]?.centroide : undefined;
    const point =
      center?.lat != null && center.lon != null
        ? { latitude: center.lat, longitude: center.lon }
        : null;
    this.known.set(key, point);
    return point;
  }
}
