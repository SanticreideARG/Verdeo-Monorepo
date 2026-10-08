import { z } from 'zod';

import type { GeocodingCandidate, GeocodingInput, GeocodingProvider } from './index.js';

/**
 * Una dirección escrita a mano, separada en sus partes.
 *
 * Lo que la IA devuelve es **texto estructurado y nunca coordenadas**: un modelo de lenguaje no
 * tiene una base de calles y puede inventar una latitud con total seguridad, que es una entrega
 * en otro barrio. Las coordenadas salen siempre de un geocodificador; esto sólo le arma una
 * consulta limpia.
 */
export const NormalizedAddressSchema = z.object({
  /** Ciudad o localidad, si el texto la menciona. */
  city: z.string().nullable(),
  /** Depto/oficina/unidad ("A", "2B"). No va a la consulta: confunde al geocodificador. */
  unit: z.string().nullable(),
  /** Piso. Tampoco va a la consulta. */
  floor: z.string().nullable(),
  /** Barrio o zona, si el texto lo menciona. */
  neighborhood: z.string().nullable(),
  /** Indicaciones que no son dirección ("tocar timbre", "casa de rejas negras"). */
  notes: z.string().nullable(),
  /** El número de puerta. */
  number: z.string().nullable(),
  /**
   * La consulta lista para el geocodificador: calle, número, barrio y ciudad, sin piso ni depto
   * ni indicaciones.
   */
  query: z.string().min(3),
  /** La calle, sin número. */
  street: z.string().nullable(),
});
export type NormalizedAddress = z.infer<typeof NormalizedAddressSchema>;

/**
 * Quien convierte el texto en una consulta limpia. Es una interfaz para que el geocodificador no
 * conozca a la IA: hoy lo respalda Gemini, pero sirve cualquier cosa que devuelva esta forma
 * (otro modelo, o reglas fijas).
 */
export interface AddressNormalizer {
  normalize(input: { city?: string | undefined; text: string }): Promise<NormalizedAddress>;
}

/** La instrucción por defecto de la tarea de IA, que se puede reemplazar desde las plantillas. */
export const NORMALIZE_ADDRESS_SYSTEM_PROMPT = [
  'Sos un asistente que ordena direcciones postales de Argentina escritas a mano.',
  'Recibís el texto de una dirección y devolvés SOLO un objeto JSON con estas claves:',
  'street, number, floor, unit, neighborhood, city, notes, query.',
  '- "street": la calle, sin el número. "number": el número de puerta.',
  '- "floor": el piso. "unit": el departamento, oficina o unidad.',
  '- "neighborhood": el barrio si aparece. "city": la ciudad o localidad si aparece.',
  '- "notes": indicaciones que no son dirección (timbre, referencias).',
  '- "query": calle, número, barrio y ciudad, SIN piso, depto ni indicaciones, lista para buscar en un mapa.',
  'Reglas: no inventes datos que no estén en el texto; usá null cuando algo no aparezca;',
  'corregí abreviaturas y errores de tipeo evidentes ("Av." = Avenida, "Gral." = General), pero no',
  'cambies el nombre de la calle por otro; no devuelvas coordenadas ni explicaciones, solo el JSON.',
].join('\n');

/** Distancia entre dos puntos sobre la Tierra, en kilómetros. */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface AutoAcceptRules {
  /** Desde dónde se mide: el origen de la ciudad. Sin origen no se puede chequear y no se acepta sola. */
  origin: { latitude: number; longitude: number } | null;
  /** Radio máximo desde el origen. */
  radiusKm: number;
  /** Confianza mínima, de 0 a 1. */
  threshold: number;
}

export type AutoAcceptDecision =
  | {
      accept: false;
      reason: 'baja_confianza' | 'fuera_de_la_ciudad' | 'sin_candidatos' | 'sin_origen';
    }
  | { accept: true; candidate: GeocodingCandidate };

/**
 * Si el mejor candidato se puede aceptar sin que lo mire una persona.
 *
 * Dos condiciones, las dos necesarias: que el geocodificador esté seguro **y** que el punto caiga
 * dentro del área de la ciudad. La segunda es la que atrapa una "San Martín 500" de otra provincia
 * con confianza máxima, que es el error más caro: una parada a cientos de kilómetros.
 */
export function decideAutoAccept(
  candidates: readonly GeocodingCandidate[],
  rules: AutoAcceptRules,
): AutoAcceptDecision {
  const best = [...candidates].sort((a, b) => b.confidence - a.confidence)[0];
  if (!best) return { accept: false, reason: 'sin_candidatos' };
  if (best.confidence < rules.threshold) return { accept: false, reason: 'baja_confianza' };
  if (!rules.origin) return { accept: false, reason: 'sin_origen' };
  if (distanceKm(rules.origin, best) > rules.radiusKm) {
    return { accept: false, reason: 'fuera_de_la_ciudad' };
  }
  return { accept: true, candidate: best };
}

/**
 * Antes de geocodificar, ordena el texto.
 *
 * - Un enlace de ubicación manda: son coordenadas elegidas a mano y no hay nada que mejorar.
 * - Si el normalizador falla o no está configurado, se geocodifica el texto tal cual: la IA suma,
 *   pero la ubicación no puede depender de que haya una clave de IA.
 * - Si la consulta limpia no encuentra nada, se reintenta con el texto original, por si el
 *   normalizador "corrigió" de más.
 */
export class SanitizingGeocodingProvider implements GeocodingProvider {
  public readonly key: string;

  public constructor(
    private readonly base: GeocodingProvider,
    private readonly normalizer: AddressNormalizer | null,
  ) {
    this.key = `sanitizing:${base.key}`;
  }

  public async geocode(input: GeocodingInput): Promise<readonly GeocodingCandidate[]> {
    if (input.locationUrl || !this.normalizer || input.normalize === false) {
      return this.base.geocode(input);
    }

    let normalized: NormalizedAddress | null = null;
    try {
      normalized = await this.normalizer.normalize({
        city: input.cityHint,
        text: input.writtenAddress,
      });
    } catch {
      normalized = null;
    }

    if (normalized && normalized.query.trim() !== input.writtenAddress.trim()) {
      const candidates = await this.base.geocode({ ...input, writtenAddress: normalized.query });
      if (candidates.length > 0) return candidates;
    }
    return this.base.geocode(input);
  }
}
