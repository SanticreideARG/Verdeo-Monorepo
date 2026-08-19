import { z } from 'zod';

const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_URL: z.url().default('http://localhost:5173'),
  API_URL: z.url().default('http://localhost:3000'),
  AI_CONFIG_ENCRYPTION_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .refine((value) => Buffer.from(value, 'base64').length === 32, {
        message: 'AI_CONFIG_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
      })
      .optional(),
  ),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(8),
  SESSION_COOKIE_SAME_SITE: z.enum(['Lax', 'None']).default('Lax'),
  SYSTEM_TIMEZONE: z.string().min(1).default('America/Argentina/Buenos_Aires'),
  SYSTEM_CURRENCY: z.string().length(3).default('ARS'),
  SYSTEM_LOCALE: z.string().min(2).default('es-AR'),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function parseServerEnv(input: NodeJS.ProcessEnv): ServerEnv {
  return ServerEnvSchema.parse(input);
}
