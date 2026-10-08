import { describe, expect, it } from 'vitest';

import { RequestStats } from './request-stats.js';

describe('RequestStats', () => {
  it('no inventa números sin muestras', () => {
    expect(new RequestStats().summary()).toEqual({ count: 0, max: null, p50: null, p95: null });
  });

  it('calcula la mediana y el percentil 95', () => {
    const stats = new RequestStats();
    for (let i = 1; i <= 100; i += 1) stats.record(i);
    expect(stats.summary()).toEqual({ count: 100, max: 100, p50: 51, p95: 96 });
  });

  it('descarta las muestras más viejas al llenarse', () => {
    const stats = new RequestStats(3);
    for (const value of [1, 2, 3, 100]) stats.record(value);
    expect(stats.summary().count).toBe(3);
    expect(stats.summary().max).toBe(100);
  });
});
