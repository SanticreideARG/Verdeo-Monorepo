import { randomUUID } from 'node:crypto';

import pino, { type Logger, type LoggerOptions } from 'pino';

export interface LoggerConfig {
  level: NonNullable<LoggerOptions['level']>;
  pretty?: boolean;
  service: string;
}

export function createLogger(config: LoggerConfig): Logger {
  return pino({
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
  });
}

export function createRequestId(incoming?: string): string {
  const normalized = incoming?.trim();
  return normalized && normalized.length <= 128 ? normalized : randomUUID();
}
