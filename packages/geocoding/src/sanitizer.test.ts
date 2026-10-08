import { describe, expect, it, vi } from 'vitest';

import {
  decideAutoAccept,
  distanceKm,
  SanitizingGeocodingProvider,
  type AddressNormalizer,
  type GeocodingCandidate,
  type GeocodingInput,
  type GeocodingProvider,
} from './index.js';

const candidato = (
  latitude: number,
  longitude: number,
  confidence: number,
): GeocodingCandidate => ({
  confidence,
  formattedAddress: 'Algún lugar',
  latitude,
  longitude,
  providerCandidateId: `${String(latitude)},${String(longitude)}`,
});

const entrada = (extra: Partial<GeocodingInput> = {}): GeocodingInput => ({
  idempotencyKey: 'k',
  requestId: 'r',
  writtenAddress: 'Julián Álvarez 1010. 6 ° A, Villa Crespo',
  ...extra,
});

const normalizado = (query: string) => ({
  city: null,
  floor: '6',
  neighborhood: 'Villa Crespo',
  notes: null,
  number: '1010',
  query,
  street: 'Julián Álvarez',
  unit: 'A',
});

describe('distanceKm', () => {
  it('mide distancias reales', () => {
    // Plaza de Mayo a Obelisco: unos 1,3 km.
    const d = distanceKm(
      { latitude: -34.6083, longitude: -58.3712 },
      { latitude: -34.6037, longitude: -58.3816 },
    );
    expect(d).toBeGreaterThan(0.9);
    expect(d).toBeLessThan(1.6);
  });
});

describe('decideAutoAccept', () => {
  const origen = { latitude: -34.6037, longitude: -58.3816 };
  const reglas = { origin: origen, radiusKm: 40, threshold: 0.9 };

  it('acepta un candidato seguro y dentro de la ciudad', () => {
    const decision = decideAutoAccept([candidato(-34.59, -58.43, 1)], reglas);
    expect(decision.accept).toBe(true);
  });

  it('no acepta sola una confianza baja', () => {
    expect(decideAutoAccept([candidato(-34.59, -58.43, 0.6)], reglas)).toEqual({
      accept: false,
      reason: 'baja_confianza',
    });
  });

  // El error más caro: "San Martín 500" de otra provincia, con la confianza al máximo.
  it('descarta un punto seguro pero fuera de la ciudad', () => {
    expect(decideAutoAccept([candidato(-31.42, -64.18, 1)], reglas)).toEqual({
      accept: false,
      reason: 'fuera_de_la_ciudad',
    });
  });

  it('sin origen de la ciudad no puede verificar y no acepta sola', () => {
    expect(decideAutoAccept([candidato(-34.59, -58.43, 1)], { ...reglas, origin: null })).toEqual({
      accept: false,
      reason: 'sin_origen',
    });
  });

  it('sin candidatos no hay nada que aceptar', () => {
    expect(decideAutoAccept([], reglas)).toEqual({ accept: false, reason: 'sin_candidatos' });
  });

  it('elige el candidato más confiable aunque no venga primero', () => {
    const decision = decideAutoAccept(
      [candidato(-34.7, -58.4, 0.5), candidato(-34.59, -58.43, 1)],
      reglas,
    );
    expect(decision).toMatchObject({ accept: true, candidate: { confidence: 1 } });
  });
});

describe('SanitizingGeocodingProvider', () => {
  /** El proveedor de base y la lista de textos que recibió, para contar cuántas veces se lo llamó. */
  const base = (resultados: Record<string, GeocodingCandidate[]>) => {
    const calls: string[] = [];
    const provider: GeocodingProvider = {
      geocode: (input: GeocodingInput) => {
        calls.push(input.writtenAddress);
        return Promise.resolve(resultados[input.writtenAddress] ?? []);
      },
      key: 'base',
    };
    return { calls, provider };
  };

  it('geocodifica la consulta limpia en lugar del texto crudo', async () => {
    const { calls, provider: proveedor } = base({
      'Julián Álvarez 1010, Villa Crespo': [candidato(-34.6, -58.44, 1)],
    });
    const normalizer: AddressNormalizer = {
      normalize: () => Promise.resolve(normalizado('Julián Álvarez 1010, Villa Crespo')),
    };

    const resultado = await new SanitizingGeocodingProvider(proveedor, normalizer).geocode(
      entrada(),
    );

    expect(resultado).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('reintenta con el texto original si la consulta limpia no encuentra nada', async () => {
    const { calls, provider: proveedor } = base({
      'Julián Álvarez 1010. 6 ° A, Villa Crespo': [candidato(-34.6, -58.44, 0.8)],
    });
    const normalizer: AddressNormalizer = {
      normalize: () => Promise.resolve(normalizado('Otra cosa distinta')),
    };

    const resultado = await new SanitizingGeocodingProvider(proveedor, normalizer).geocode(
      entrada(),
    );

    expect(resultado).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  // La ubicación no puede depender de que haya una clave de IA.
  it('si el normalizador falla, geocodifica el texto tal cual', async () => {
    const { provider: proveedor } = base({
      'Julián Álvarez 1010. 6 ° A, Villa Crespo': [candidato(-34.6, -58.44, 0.8)],
    });
    const normalizer: AddressNormalizer = {
      normalize: () => Promise.reject(new Error('sin proveedor de IA')),
    };

    const resultado = await new SanitizingGeocodingProvider(proveedor, normalizer).geocode(
      entrada(),
    );

    expect(resultado).toHaveLength(1);
  });

  it('sin normalizador se comporta como el proveedor de base', async () => {
    const { provider: proveedor } = base({
      'Julián Álvarez 1010. 6 ° A, Villa Crespo': [candidato(-34.6, -58.44, 0.8)],
    });
    expect(await new SanitizingGeocodingProvider(proveedor, null).geocode(entrada())).toHaveLength(
      1,
    );
  });

  // Un enlace de ubicación son coordenadas elegidas a mano: nada que mejorar ni que pagar.
  it('con un enlace de ubicación no llama al normalizador', async () => {
    const { provider: proveedor } = base({
      'Julián Álvarez 1010. 6 ° A, Villa Crespo': [candidato(-34.6, -58.44, 1)],
    });
    const normalize = vi.fn();
    await new SanitizingGeocodingProvider(proveedor, { normalize }).geocode(
      entrada({ locationUrl: 'https://maps.google.com/?q=-34.6,-58.44' }),
    );
    expect(normalize).not.toHaveBeenCalled();
  });
});
