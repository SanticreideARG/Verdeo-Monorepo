import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

export const SessionSummarySchema = z.object({
  createdAt: IsoDateTimeSchema,
  current: z.boolean(),
  expiresAt: IsoDateTimeSchema,
  id: UuidSchema,
  lastSeenAt: IsoDateTimeSchema,
  revokedAt: IsoDateTimeSchema.nullable(),
});

export const SessionListResponseSchema = z.object({
  items: z.array(SessionSummarySchema).readonly(),
});

export const SessionIdParamSchema = z.object({ id: UuidSchema });

export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;
