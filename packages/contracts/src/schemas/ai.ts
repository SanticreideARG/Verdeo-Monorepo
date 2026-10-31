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

export const AIPromptSummarySchema = z.object({
  configured: z.boolean(),
  description: z.string(),
  displayName: z.string(),
  hasActiveVersion: z.boolean(),
  taskKey: z.string(),
});

export const AIPromptSummaryListResponseSchema = z.object({
  items: z.array(AIPromptSummarySchema),
});

export const AIPromptVersionSchema = z.object({
  createdAt: IsoDateTimeSchema,
  createdByUserId: UuidSchema.nullable(),
  id: UuidSchema,
  maxTokens: z.number().int(),
  preferredProviderKey: z.string().nullable(),
  systemPrompt: z.string(),
  temperature: z.number(),
  version: z.number().int(),
});

export const AIPromptDetailSchema = z.object({
  activeVersionId: UuidSchema.nullable(),
  taskKey: z.string(),
  versions: z.array(AIPromptVersionSchema),
});

export const AIPromptVersionCreateRequestSchema = z.object({
  maxTokens: z.number().int().min(50).max(8_000),
  preferredProviderKey: z.string().trim().min(1).max(80).optional(),
  systemPrompt: z.string().trim().min(1).max(8_000),
  temperature: z.number().min(0).max(2),
});

export const AIPromptVersionActivateRequestSchema = z.object({
  versionId: UuidSchema,
});

export const AITaskRunRequestSchema = z.object({
  variables: z.record(z.string(), z.string().max(8_000)),
});

/** Una pregunta al búho del Workbench (BUHO_WORKBENCH_PLAN.md). */
export const AIAssistantMessageRequestSchema = z.object({
  cycleId: UuidSchema.optional(),
  /** Lo conversado antes, para seguir el hilo; el navegador lo guarda mientras dure la pestaña. */
  history: z
    .array(
      z.object({
        content: z.string().max(16_000),
        role: z.enum(['assistant', 'user']),
      }),
    )
    .max(40)
    .default([]),
  message: z.string().trim().min(1).max(16_000),
  mode: z.string().trim().min(1).max(80),
});

export const AIAssistantMessageResponseSchema = z.object({
  /** De qué período y ciudad son los datos que usó, para decirlo debajo de la respuesta. */
  context: z.object({
    cycleAlias: z.string().nullable(),
    omitted: z.array(z.string()),
    siteName: z.string().nullable(),
  }),
  model: z.string(),
  providerKey: z.string(),
  reply: z.string(),
});

export const AITaskRunResponseSchema = z.object({
  model: z.string(),
  output: z.unknown(),
  promptVersion: z.number().int(),
  providerKey: z.string(),
  usage: z.object({
    inputTokens: z.number().int().nullable(),
    outputTokens: z.number().int().nullable(),
  }),
});

export const AIExecutionSchema = z.object({
  createdAt: IsoDateTimeSchema,
  errorMessage: z.string().nullable(),
  id: UuidSchema,
  inputTokens: z.number().int().nullable(),
  latencyMs: z.number().int(),
  model: z.string(),
  outputText: z.string().nullable(),
  outputTokens: z.number().int().nullable(),
  providerKey: z.string(),
  status: z.enum(['completed', 'error']),
  taskKey: z.string(),
});

export const AIExecutionListResponseSchema = z.object({
  items: z.array(AIExecutionSchema),
});

export type AIPromptVersionCreateRequest = z.infer<typeof AIPromptVersionCreateRequestSchema>;
export type AIPromptVersionActivateRequest = z.infer<typeof AIPromptVersionActivateRequestSchema>;
export type AITaskRunRequest = z.infer<typeof AITaskRunRequestSchema>;
export type AIAssistantMessageRequest = z.infer<typeof AIAssistantMessageRequestSchema>;
export type AIAssistantMessageResponse = z.infer<typeof AIAssistantMessageResponseSchema>;

/** El resultado de probar un proveedor: anduvo o no, qué contestó y cuánto tardó. */
export const AIProviderTestResponseSchema = z.object({
  latencyMs: z.number().int(),
  model: z.string(),
  ok: z.boolean(),
  reply: z.string(),
});
