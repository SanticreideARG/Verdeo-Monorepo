import { randomUUID } from 'node:crypto';

import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';

export interface LoggerConfig {
  level: NonNullable<LoggerOptions['level']>;
  pretty?: boolean;
  service: string;
}

/**
 * El logger de la aplicación, con las credenciales tapadas.
 *
 * `destination` existe para poder verificar eso último. Sin él, pino escribe directo al descriptor
 * 1 y lo que sale no se puede leer desde un test —ni espiando `process.stdout.write`—, así que la
 * redacción, que es lo único que este archivo tiene de riesgoso, quedaría sin comprobar. En
 * producción no se pasa: el destino por defecto es el de siempre.
 */
export function createLogger(config: LoggerConfig, destination?: DestinationStream): Logger {
  const options: LoggerOptions = {
    base: { service: config.service },
    level: config.level,
    redact: {
      paths: [
        'req.headers.authorization',
        'headers.authorization',
        '*.token',
        '*.accessToken',
        '*.apiKey',
        '*.secret',
        '*.password',
      ],
      censor: '[REDACTED]',
    },
    ...(config.pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, singleLine: true },
          },
        }
      : {}),
  };

  return destination ? pino(options, destination) : pino(options);
}

export function createRequestId(incoming?: string): string {
  const normalized = incoming?.trim();
  return normalized && normalized.length <= 128 ? normalized : randomUUID();
}
