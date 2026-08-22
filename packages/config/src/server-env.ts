import { z } from 'zod';

const optionalString = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const ServerEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    APP_URL: z.url().default('http://localhost:5173'),
    API_URL: z.url().default('http://localhost:3000'),
    AI_CONFIG_ENCRYPTION_KEY: optionalString(
      z.string().refine((value) => Buffer.from(value, 'base64').length === 32, {
        message: 'AI_CONFIG_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
      }),
    ),
    // Shared secret for scheduled jobs. Without it the retention endpoint refuses every caller,
    // which is the safe direction: a purge nobody can trigger beats one anybody can.
    CRON_SECRET: optionalString(z.string().min(16)),
    CHAT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
    DATABASE_URL: z.string().min(1),
    SESSION_SECRET: z.string().min(32),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(8),
    SESSION_COOKIE_SAME_SITE: z.enum(['Lax', 'None']).default('Lax'),
    SUPABASE_PUBLISHABLE_KEY: optionalString(z.string().min(20)),
    SUPABASE_URL: optionalString(z.url()),
    SYSTEM_TIMEZONE: z.string().min(1).default('America/Argentina/Buenos_Aires'),
    SYSTEM_CURRENCY: z.string().length(3).default('ARS'),
    SYSTEM_LOCALE: z.string().min(2).default('es-AR'),
    // Vercel Blob store for avatar uploads. Names match what Vercel injects when the store is
    // connected with the "VERDEO" env var prefix; without it, avatar upload just answers 503.
    VERDEO_READ_WRITE_TOKEN: optionalString(z.string().min(20)),
    VERDEO_STORE_ID: optionalString(z.string().min(1)),
  })
  .superRefine((value, context) => {
    if (Boolean(value.SUPABASE_URL) === Boolean(value.SUPABASE_PUBLISHABLE_KEY)) return;

    context.addIssue({
      code: 'custom',
      message: 'SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured together',
      path: [value.SUPABASE_URL ? 'SUPABASE_PUBLISHABLE_KEY' : 'SUPABASE_URL'],
    });
  });

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function parseServerEnv(input: NodeJS.ProcessEnv): ServerEnv {
  return ServerEnvSchema.parse(input);
}
