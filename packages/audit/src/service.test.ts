import { describe, expect, it } from 'vitest';

import { AuditService } from './service.js';
import type { AuditEvent, AuditEventInput, AuditSink } from './types.js';

function recordingSink(): { appended: AuditEvent[]; sink: AuditSink } {
  const appended: AuditEvent[] = [];
  return {
    appended,
    sink: {
      append: (event) => {
        appended.push(event);
        return Promise.resolve();
      },
    },
  };
}

const input: AuditEventInput = {
  action: 'order.confirmed',
  actor: { type: 'user', userId: 'user-1' },
  after: { status: 'CONFIRMED' },
  before: { status: 'DRAFT' },
  correlationId: 'corr-1',
  entityId: 'order-1',
  entityType: 'order',
  requestId: 'req-1',
  source: 'api',
};

describe('AuditService', () => {
  it('escribe en el sink exactamente lo que devuelve', async () => {
    const { appended, sink } = recordingSink();

    const event = await new AuditService(sink).record(input);

    // Quien llama suele loguear o devolver lo que `record` entrega; si eso no fuera lo mismo que
    // quedó guardado, el rastro diría una cosa y la respuesta otra.
    expect(appended).toEqual([event]);
  });

  it('conserva el evento tal como se lo pasaron', async () => {
    const { appended, sink } = recordingSink();

    await new AuditService(sink).record(input);

    expect(appended[0]).toMatchObject(input);
  });

  it('le pone a cada evento su propio id y su momento', async () => {
    const { appended, sink } = recordingSink();
    const service = new AuditService(sink);
    const before = Date.now();

    await service.record(input);
    await service.record(input);

    const [first, second] = appended;
    expect(first?.id).not.toBe(second?.id);
    // Dos veces la misma acción son dos hechos distintos, no uno repetido.
    expect(first?.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(first?.occurredAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('no traga el fallo del sink', async () => {
    const sink: AuditSink = {
      append: () => Promise.reject(new Error('la base no responde')),
    };

    /*
     * Lo más importante de todo el paquete. `record` corre dentro de la transacción de quien
     * audita: si se tragara el error, la operación se daría por buena y el hecho no quedaría
     * registrado en ningún lado. Un rastro con agujeros silenciosos no es un rastro.
     */
    await expect(new AuditService(sink).record(input)).rejects.toThrow('la base no responde');
  });

  it('acepta un actor de sistema sin usuario', async () => {
    const { appended, sink } = recordingSink();

    // Los procesos automáticos (cron, webhooks) también auditan, y no tienen userId que poner.
    await new AuditService(sink).record({ ...input, actor: { type: 'system' } });

    expect(appended[0]?.actor).toEqual({ type: 'system' });
  });
});
