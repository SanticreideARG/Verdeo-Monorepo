import { z } from 'zod';

const ProbeSchema = z.object({
  detail: z.string(),
  key: z.string(),
  label: z.string(),
  latencyMs: z.number().nullable(),
  ok: z.boolean(),
});

/** Una corrida del script de Gmail, como la guarda la API. */
export const InboundEmailRunSchema = z.object({
  duplicates: z.number().int(),
  durationMs: z.number().int(),
  error: z.string().nullable(),
  failed: z.number().int(),
  found: z.number().int(),
  /** Corridas sin novedades desde el reporte anterior: no se reportan una por una. */
  quietRuns: z.number().int(),
  ranAt: z.string(),
  scriptVersion: z.string(),
  sentNew: z.number().int(),
});

/** Lo que manda el script al terminar una corrida, firmado como los mails. */
export const InboundEmailRunReportSchema = z.object({
  duplicates: z.number().int().min(0).max(100_000),
  durationMs: z.number().int().min(0).max(3_600_000),
  error: z.string().max(1000).nullable(),
  failed: z.number().int().min(0).max(100_000),
  found: z.number().int().min(0).max(100_000),
  quietRuns: z.number().int().min(0).max(100_000),
  ranAt: z.iso.datetime({ offset: true }),
  scriptVersion: z.string().trim().min(1).max(40),
  sentNew: z.number().int().min(0).max(100_000),
});

export type InboundEmailRun = z.infer<typeof InboundEmailRunSchema>;

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
  /**
   * Correo entrante: cuándo llegó el último mail, cuántos esperan revisión, y el seguimiento del
   * script de Gmail (2026-11-11): sus últimas corridas, lo de las últimas 24 horas y los rechazos.
   */
  inbound: z
    .object({
      last24h: z.object({
        duplicates: z.number().int(),
        failed: z.number().int(),
        found: z.number().int(),
        reports: z.number().int(),
        sentNew: z.number().int(),
      }),
      lastReceivedAt: z.string().nullable(),
      pending: z.number().int(),
      rejections: z.array(
        z.object({ count: z.number().int(), lastAt: z.string(), reason: z.string() }),
      ),
      runs: z.array(InboundEmailRunSchema),
      toReview: z.number().int(),
    })
    .nullable(),
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
