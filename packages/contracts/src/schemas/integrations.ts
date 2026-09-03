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
  // Non-secret configuration (sender address, reply-to). Unlike the key, this round-trips.
  settings: z.record(z.string().trim().max(60), z.string().trim().max(320)).optional(),
});

export const IntegrationCredentialSchema = z.object({
  apiKeyMask: z.string().nullable(),
  displayName: z.string(),
  enabled: z.boolean(),
  id: UuidSchema,
  key: z.string(),
  keyConfigured: z.boolean(),
  provider: z.string(),
  settings: z.record(z.string(), z.string()),
  updatedAt: IsoDateTimeSchema,
});

export const EmailTestRequestSchema = z.object({
  to: z.string().trim().email().max(320),
});

export const EmailTestResponseSchema = z.object({
  reason: z.string().nullable(),
  sent: z.boolean(),
});

export const IntegrationCredentialListResponseSchema = z.object({
  encryptionConfigured: z.boolean(),
  items: z.array(IntegrationCredentialSchema),
});

export type IntegrationCredentialUpsertRequest = z.infer<
  typeof IntegrationCredentialUpsertRequestSchema
>;
