import {
  parseCoordinatesFromLocationUrl,
  type GeocodingCandidate,
  type GeocodingInput,
  type GeocodingProvider,
} from './index.js';

/** Sólo se siguen enlaces de Google: el servidor no sale a direcciones que pegó cualquiera. */
const GOOGLE_HOST =
  /^(?:maps\.app\.goo\.gl|goo\.gl|g\.co|(?:www\.|maps\.|consent\.)?google\.com(?:\.[a-z]{2})?)$/i;
const MAX_HOPS = 5;

/**
 * Convierte un enlace corto de Google Maps ("maps.app.goo.gl/…", el que se comparte desde el
 * teléfono) en el largo, que trae las coordenadas del lugar.
 *
 * El enlace corto no tiene coordenadas a la vista: Maps las encuentra porque sigue la
 * redirección. Acá se hace lo mismo, sin descargar la página: se lee el encabezado `location` de
 * cada salto. Si algo falla, devuelve el enlace tal cual vino, y la búsqueda sigue por el texto.
 */
export async function expandLocationLink(
  locationUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  let current = locationUrl;
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    if (parseCoordinatesFromLocationUrl(current)) return current;
    let url: URL;
    try {
      url = new URL(current);
    } catch {
      return current;
    }
    if (url.protocol !== 'https:' || !GOOGLE_HOST.test(url.hostname)) return current;
    // La página de consentimiento (fuera de la Argentina) lleva el destino en `continue`.
    const next = url.searchParams.get('continue');
    if (url.hostname.startsWith('consent.') && next) {
      current = next;
      continue;
    }
    try {
      const response = await fetchImpl(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(8_000),
      });
      const location = response.headers.get('location');
      if (response.status < 300 || response.status >= 400 || !location) return current;
      current = new URL(location, url).toString();
    } catch {
      return current;
    }
  }
  return current;
}

/**
 * Expande el enlace de ubicación antes de buscar, para que cualquier buscador lea sus coordenadas.
 *
 * El candidato guarda el enlace original: es el que pegó la persona y el que abre en el teléfono.
 */
export class LinkExpandingGeocodingProvider implements GeocodingProvider {
  public readonly key: string;

  public constructor(
    private readonly base: GeocodingProvider,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.key = base.key;
  }

  public async geocode(input: GeocodingInput): Promise<readonly GeocodingCandidate[]> {
    if (!input.locationUrl || parseCoordinatesFromLocationUrl(input.locationUrl)) {
      return this.base.geocode(input);
    }
    const expanded = await expandLocationLink(input.locationUrl, this.fetchImpl);
    if (expanded === input.locationUrl || !parseCoordinatesFromLocationUrl(expanded)) {
      return this.base.geocode(input);
    }
    const candidates = await this.base.geocode({ ...input, locationUrl: expanded });
    return candidates.map((candidate) =>
      candidate.locationUrl === expanded
        ? { ...candidate, locationUrl: input.locationUrl }
        : candidate,
    );
  }
}
