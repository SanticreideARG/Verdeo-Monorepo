import { describe, expect, it, vi } from 'vitest';

import { syncAuditMirror, type MirroredAuditEvent } from './audit-mirror.js';

const evento = (id: string): MirroredAuditEvent => ({
  action: 'order.created',
  actorType: 'user',
  actorUserId: null,
  correlationId: 'c',
  entityId: 'e',
  entityType: 'order',
  id,
  occurredAt: new Date('2026-10-01T10:00:00Z'),
  requestId: 'r',
  source: 'api',
});

describe('syncAuditMirror', () => {
  it('copia lo que pasó después de la última copia', async () => {
    const push = vi.fn().mockResolvedValue({ detail: 'HTTP 201', ok: true });
    const fetchEvents = vi.fn().mockResolvedValue([evento('a'), evento('b')]);
    const since = new Date('2026-09-30T00:00:00Z');

    const result = await syncAuditMirror({
      batchSize: 500,
      fetchEvents,
      lastMirroredAt: () => Promise.resolve({ at: since, detail: 'ok', ok: true }),
      push,
    });

    expect(fetchEvents).toHaveBeenCalledWith(new Date(since.getTime() + 1), 500);
    expect(push).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ copied: 2, ok: true });
  });

  it('no escribe nada cuando está al día', async () => {
    const push = vi.fn();
    const result = await syncAuditMirror({
      batchSize: 500,
      fetchEvents: () => Promise.resolve([]),
      lastMirroredAt: () => Promise.resolve({ at: null, detail: 'ok', ok: true }),
      push,
    });
    expect(push).not.toHaveBeenCalled();
    expect(result).toEqual({ copied: 0, detail: 'al día', ok: true });
  });

  // Si no se sabe hasta dónde se copió, empezar de cero y copiar todo otra vez sería adivinar.
  it('se detiene si no puede saber hasta dónde se copió', async () => {
    const fetchEvents = vi.fn();
    const result = await syncAuditMirror({
      batchSize: 500,
      fetchEvents,
      lastMirroredAt: () => Promise.resolve({ at: null, detail: 'HTTP 404 tabla', ok: false }),
      push: vi.fn(),
    });
    expect(fetchEvents).not.toHaveBeenCalled();
    expect(result).toEqual({ copied: 0, detail: 'HTTP 404 tabla', ok: false });
  });

  it('informa el fallo de la escritura sin dar los eventos por copiados', async () => {
    const result = await syncAuditMirror({
      batchSize: 500,
      fetchEvents: () => Promise.resolve([evento('a')]),
      lastMirroredAt: () => Promise.resolve({ at: null, detail: 'ok', ok: true }),
      push: () => Promise.resolve({ detail: 'HTTP 401', ok: false }),
    });
    expect(result).toEqual({ copied: 0, detail: 'HTTP 401', ok: false });
  });
});
