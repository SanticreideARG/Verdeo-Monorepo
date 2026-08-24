import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

export const AuditEventSchema = z.object({
  action: z.string(),
  actorDisplayName: z.string().nullable(),
  actorType: z.enum(['user', 'system', 'webhook']),
  actorUserId: UuidSchema.nullable(),
  after: z.unknown().nullable(),
  before: z.unknown().nullable(),
  correlationId: z.string(),
  entityId: z.string(),
  entityType: z.string(),
  id: UuidSchema,
  metadata: z.unknown().nullable(),
  occurredAt: IsoDateTimeSchema,
  requestId: z.string(),
  source: z.string(),
});

export const AuditEventListResponseSchema = z.object({
  items: z.array(AuditEventSchema),
  nextBefore: z.string().nullable(),
});

export const AuditFacetsResponseSchema = z.object({
  actions: z.array(z.string()),
  entityTypes: z.array(z.string()),
});

export const AuditEventQuerySchema = z.object({
  action: z.string().trim().max(120).optional(),
  actorUserId: UuidSchema.optional(),
  before: z.iso.datetime({ offset: true }).optional(),
  entityId: z.string().trim().max(200).optional(),
  entityType: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type AuditEventQuery = z.infer<typeof AuditEventQuerySchema>;
