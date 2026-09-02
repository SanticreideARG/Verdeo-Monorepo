import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

/**
 * Third-party integration keys that are not AI providers (maps/geocoding today). Mirrors the AI
 * provider contract, minus the adapter/model/baseUrl fields an LLM needs and a maps key does not.
 *
 * The API key is write-only across this boundary on purpose: it goes in through the upsert request
 * and only ever comes back as `apiKeyMask`.
 */
export const IntegrationCredentialUpsertRequestSchema = z.object({
  apiKey: z.string().trim().min(8).max(2_000).optional(),
  displayName: z.string().trim().min(1).max(120),
  enabled: z.boolean().default(false),
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  provider: z.string().trim().min(1).max(80),
});

export const IntegrationCredentialSchema = z.object({
  apiKeyMask: z.string().nullable(),
  displayName: z.string(),
  enabled: z.boolean(),
  id: UuidSchema,
  key: z.string(),
  keyConfigured: z.boolean(),
  provider: z.string(),
  updatedAt: IsoDateTimeSchema,
});

export const IntegrationCredentialListResponseSchema = z.object({
  encryptionConfigured: z.boolean(),
  items: z.array(IntegrationCredentialSchema),
});

export type IntegrationCredentialUpsertRequest = z.infer<
  typeof IntegrationCredentialUpsertRequestSchema
>;
