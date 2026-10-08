import { describe, expect, it } from 'vitest';

import {
  formatBytes,
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
