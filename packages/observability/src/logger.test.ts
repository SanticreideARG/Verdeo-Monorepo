import type { DestinationStream } from 'pino';
import { describe, expect, it } from 'vitest';

import { createLogger, createRequestId } from './logger.js';

/** Junta lo que el logger escribe, ya parseado. */
function captured(): { lines: Record<string, unknown>[]; stream: DestinationStream } {
  const lines: Record<string, unknown>[] = [];
  return {
    lines,
    stream: {
      write: (chunk: string) => {
        lines.push(JSON.parse(chunk) as Record<string, unknown>);
      },
    },
  };
}

describe('createLogger', () => {
  it('firma cada línea con el nombre del servicio', () => {
    const { lines, stream } = captured();

    createLogger({ level: 'info', service: 'verdeo-api' }, stream).info('arrancó');

    expect(lines[0]).toMatchObject({ msg: 'arrancó', service: 'verdeo-api' });
  });

  it('tapa el header de autorización', () => {
    const { lines, stream } = captured();

    createLogger({ level: 'info', service: 'test' }, stream).info({
      req: { headers: { authorization: 'Bearer secreto-de-verdad' } },
    });

    const req = lines[0]?.req as { headers: { authorization: string } };
    expect(req.headers.authorization).toBe('[REDACTED]');
  });

  it('tapa credenciales sueltas en el objeto que se loguea', () => {
    const { lines, stream } = captured();

    /*
     * Esto es lo único de este archivo que puede terminar en un incidente. Un token en un log es un
     * token filtrado: queda en el proveedor, en las copias y en cualquiera que tenga acceso a
     * mirar, mucho después de que a nadie se le ocurra buscarlo ahí.
     */
    createLogger({ level: 'info', service: 'test' }, stream).info({
      payload: {
        accessToken: 'ya-fue',
        apiKey: 'AIza-lo-que-sea',
        password: 'verdeo123',
        secret: 'shhh',
        token: 'tampoco',
        userId: 'esto-sí-se-ve',
      },
    });

    expect(lines[0]?.payload).toEqual({
      accessToken: '[REDACTED]',
      apiKey: '[REDACTED]',
      password: '[REDACTED]',
      secret: '[REDACTED]',
      token: '[REDACTED]',
      userId: 'esto-sí-se-ve',
    });
  });

  it('no escribe lo que está por debajo del nivel configurado', () => {
    const { lines, stream } = captured();

    const logger = createLogger({ level: 'warn', service: 'test' }, stream);
    logger.info('esto no va');
    logger.warn('esto sí');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ msg: 'esto sí' });
  });
});

describe('createRequestId', () => {
  it('respeta el id que ya viene, para poder seguir un pedido entre servicios', () => {
    expect(createRequestId('req-de-afuera')).toBe('req-de-afuera');
  });

  it('le saca los espacios de los bordes', () => {
    expect(createRequestId('  req-1  ')).toBe('req-1');
  });

  it('genera uno cuando no viene ninguno', () => {
    const generated = createRequestId();
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('genera uno cuando lo que viene está vacío o son espacios', () => {
    expect(createRequestId('')).toMatch(/^[0-9a-f-]{36}$/);
    expect(createRequestId('   ')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('descarta un id desmedido en vez de repetirlo en cada línea', () => {
    // El id lo elige quien llama, mandando un header. Sin tope, cualquiera puede hacer que cada
    // línea de log de su request arrastre kilobytes suyos.
    const absurd = 'x'.repeat(129);

    const result = createRequestId(absurd);

    expect(result).not.toBe(absurd);
    expect(result).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('acepta uno de exactamente 128', () => {
    const limit = 'x'.repeat(128);
    expect(createRequestId(limit)).toBe(limit);
  });
});
