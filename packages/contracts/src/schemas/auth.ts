import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

export const MeResponseSchema = z.object({
  permissions: z.array(z.string()).readonly(),
  session: z.object({
    expiresAt: IsoDateTimeSchema,
    id: UuidSchema,
  }),
  user: z.object({
    id: UuidSchema,
  }),
});

export type MeResponse = z.infer<typeof MeResponseSchema>;
