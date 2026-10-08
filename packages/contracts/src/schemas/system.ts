import { z } from 'zod';

const ProbeSchema = z.object({
  detail: z.string(),
  key: z.string(),
  label: z.string(),
  latencyMs: z.number().nullable(),
  ok: z.boolean(),
});

export const SystemStatusResponseSchema = z.object({
  api: z.object({
    latency: z.object({
      count: z.number().int(),
      max: z.number().nullable(),
      p50: z.number().nullable(),
      p95: z.number().nullable(),
    }),
    startedAt: z.string(),
    version: z.string(),
  }),
  errors: z.object({
    last24h: z.number().int(),
    recent: z.array(
      z.object({
        errorName: z.string(),
        id: z.string(),
        message: z.string(),
        method: z.string(),
        occurredAt: z.string(),
        path: z.string(),
        requestId: z.string(),
        status: z.number().int(),
      }),
    ),
  }),
  generatedAt: z.string(),
  mirror: z.object({
    detail: z.string(),
    lastMirroredAt: z.string().nullable(),
    ok: z.boolean(),
  }),
  probes: z.array(ProbeSchema),
});

export const SystemTableMapResponseSchema = z.object({
  items: z.array(
    z.object({
      references: z.array(z.string()),
      rows: z.number(),
      sizeBytes: z.number(),
      table: z.string(),
    }),
  ),
});

export type SystemStatusResponse = z.infer<typeof SystemStatusResponseSchema>;
export type SystemTableMapResponse = z.infer<typeof SystemTableMapResponseSchema>;
