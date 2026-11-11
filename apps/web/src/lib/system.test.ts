import { describe, expect, it } from 'vitest';

import {
  formatBytes,
  inboundAdvice,
  inboundTone,
  type InboundTracking,
  groupTables,
  latencyPercent,
  overallTone,
  probeTone,
  type SystemTable,
} from './system.js';

describe('probeTone', () => {
  it('una sonda caída es mala sin importar la latencia', () => {
    expect(probeTone({ latencyMs: 5, ok: false })).toBe('mal');
  });

  // Responder lento es lo que el usuario siente como "anda lento", aunque `ok` sea verdadero.
  it('una sonda que responde pero tarda se marca lenta', () => {
    expect(probeTone({ latencyMs: 40, ok: true })).toBe('bien');
    expect(probeTone({ latencyMs: 900, ok: true })).toBe('lento');
  });

  it('sin latencia medida no inventa un estado', () => {
    expect(probeTone({ latencyMs: null, ok: true })).toBe('sin-dato');
  });
});

describe('overallTone', () => {
  it('toma el peor estado', () => {
    expect(
      overallTone([
        { latencyMs: 10, ok: true },
        { latencyMs: 900, ok: true },
      ]),
    ).toBe('lento');
    expect(
      overallTone([
        { latencyMs: 900, ok: true },
        { latencyMs: 10, ok: false },
      ]),
    ).toBe('mal');
  });

  it('sin sondas no dice que está todo bien', () => {
    expect(overallTone([])).toBe('sin-dato');
  });
});

describe('latencyPercent', () => {
  it('llena la barra a 1,5 segundos y no se pasa', () => {
    expect(latencyPercent(750)).toBe(50);
    expect(latencyPercent(9000)).toBe(100);
    expect(latencyPercent(null)).toBe(0);
  });
});

describe('formatBytes', () => {
  it('usa la unidad que corresponde, con coma decimal', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(8192)).toBe('8,0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5,0 MB');
  });
});

describe('groupTables', () => {
  const tabla = (table: string): SystemTable => ({ references: [], rows: 0, sizeBytes: 0, table });

  it('agrupa por tema y deja lo que no reconoce en "Otras"', () => {
    const grupos = groupTables([
      tabla('orders'),
      tabla('order_items'),
      tabla('customers'),
      tabla('audit_events'),
      tabla('cosa_rara'),
    ]);

    expect(grupos.map((grupo) => grupo.label)).toEqual(['Pedidos', 'Clientes', 'Sistema', 'Otras']);
    expect(grupos[0]?.tables.map((t) => t.table)).toEqual(['orders', 'order_items']);
  });

  it('no pierde ninguna tabla', () => {
    const entrada = ['orders', 'route_stops', 'users', 'xyz'].map(tabla);
    expect(groupTables(entrada).flatMap((grupo) => grupo.tables)).toHaveLength(4);
  });
});

describe('inboundTone: el semáforo del script de Gmail', () => {
  const now = new Date('2026-11-11T12:00:00.000Z');
  const run = (ranAt: string, extra: { error?: string; failed?: number } = {}) => ({
    duplicates: 0,
    durationMs: 800,
    error: extra.error ?? null,
    failed: extra.failed ?? 0,
    found: 0,
    quietRuns: 0,
    ranAt,
    scriptVersion: '2026-11-11',
    sentNew: 0,
  });
  const tracking = (
    runs: InboundTracking['runs'],
    rejections: InboundTracking['rejections'] = [],
  ): InboundTracking => ({
    last24h: { duplicates: 0, failed: 0, found: 0, reports: runs.length, sentNew: 0 },
    lastReceivedAt: null,
    pending: 0,
    rejections,
    runs,
    toReview: 0,
  });

  it('sin reportes nunca: falta el script nuevo', () => {
    expect(inboundTone(tracking([]), now)).toBe('sin-dato');
  });

  it('al día si reportó hace menos de 70 minutos sin errores', () => {
    const value = tracking([run('2026-11-11T11:30:00.000Z')]);
    expect(inboundTone(value, now)).toBe('bien');
    expect(inboundAdvice('bien', value, now)).toBe('');
  });

  it('sin señal pasados 70 minutos', () => {
    const value = tracking([run('2026-11-11T10:40:00.000Z')]);
    expect(inboundTone(value, now)).toBe('mal');
    expect(inboundAdvice('mal', value, now)).toContain('Activadores');
  });

  it('con errores si la última corrida falló algo', () => {
    const failed = tracking([run('2026-11-11T11:55:00.000Z', { failed: 1 })]);
    expect(inboundTone(failed, now)).toBe('lento');
    const value = tracking([run('2026-11-11T11:55:00.000Z', { error: 'Verdeo respondió 500' })]);
    expect(inboundAdvice(inboundTone(value, now), value, now)).toContain('Verdeo respondió 500');
  });

  it('una firma rechazada después de la última corrida es el secreto', () => {
    const value = tracking(
      [run('2026-11-11T11:40:00.000Z')],
      [{ count: 3, lastAt: '2026-11-11T11:50:00.000Z', reason: 'firma' }],
    );
    expect(inboundTone(value, now)).toBe('lento');
    expect(inboundAdvice('lento', value, now)).toContain('VERDEO_SECRET');
  });

  it('sin señal, pero con una firma rechazada recién, también dice que es el secreto', () => {
    const value = tracking(
      [run('2026-11-11T09:00:00.000Z')],
      [{ count: 9, lastAt: '2026-11-11T11:58:00.000Z', reason: 'firma' }],
    );
    expect(inboundTone(value, now)).toBe('mal');
    expect(inboundAdvice('mal', value, now)).toContain('VERDEO_SECRET');
  });
});
