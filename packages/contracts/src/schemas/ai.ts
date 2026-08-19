import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

export const AIProviderConfigUpsertRequestSchema = z.object({
  adapterType: z.string().trim().min(1).max(80),
  apiKey: z.string().trim().min(8).max(2_000).optional(),
  baseUrl: z.url(),
  defaultModel: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(120),
  enabled: z.boolean().default(false),
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
});

export const AIProviderConfigSchema = z.object({
  adapterType: z.string(),
  apiKeyMask: z.string().nullable(),
  baseUrl: z.string(),
  defaultModel: z.string(),
  displayName: z.string(),
  enabled: z.boolean(),
  id: UuidSchema,
  key: z.string(),
  keyConfigured: z.boolean(),
  updatedAt: IsoDateTimeSchema,
});

export const AIProviderConfigListResponseSchema = z.object({
  encryptionConfigured: z.boolean(),
  items: z.array(AIProviderConfigSchema),
});

export type AIProviderConfigUpsertRequest = z.infer<typeof AIProviderConfigUpsertRequestSchema>;
