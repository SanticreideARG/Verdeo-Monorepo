import { describe, expect, it } from 'vitest';

import { haversineDistanceKm, NearestNeighborRouteOptimizer } from './index.js';

describe('haversineDistanceKm', () => {
  it('is zero for the same point', () => {
    expect(
      haversineDistanceKm(
        { latitude: -38.95, longitude: -68.06 },
        { latitude: -38.95, longitude: -68.06 },
      ),
    ).toBe(0);
  });

  it('roughly matches a known distance (Neuquén to Cipolletti, ~15km)', () => {
    const distance = haversineDistanceKm(
      { latitude: -38.9516, longitude: -68.0591 },
      { latitude: -38.9339, longitude: -67.9856 },
    );
    expect(distance).toBeGreaterThan(5);
    expect(distance).toBeLessThan(20);
  });
});

describe('NearestNeighborRouteOptimizer', () => {
  const optimizer = new NearestNeighborRouteOptimizer();

  it('orders stops by proximity walking out from the origin', () => {
    const origin = { latitude: 0, longitude: 0 };
    const far = { id: 'far', latitude: 0, longitude: 3 };
    const near = { id: 'near', latitude: 0, longitude: 1 };
    const mid = { id: 'mid', latitude: 0, longitude: 2 };

    const sequence = optimizer.sequence(origin, [far, near, mid]);

    expect(sequence.map((stop) => stop.id)).toEqual(['near', 'mid', 'far']);
  });

  it('falls back to the first stop as origin when none is configured', () => {
    const a = { id: 'a', latitude: 0, longitude: 0 };
    const b = { id: 'b', latitude: 0, longitude: 1 };
    const c = { id: 'c', latitude: 0, longitude: 5 };

    const sequence = optimizer.sequence(null, [c, a, b]);

    expect(sequence[0]?.id).toBe('c');
  });

  it('returns an empty sequence for no stops', () => {
    expect(optimizer.sequence({ latitude: 0, longitude: 0 }, [])).toEqual([]);
  });

  it('handles a single stop', () => {
    const stop = { id: 'only', latitude: 1, longitude: 1 };
    expect(optimizer.sequence(null, [stop])).toEqual([stop]);
  });
});
