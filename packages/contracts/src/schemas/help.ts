import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

// Same free-text convention as message-template keys elsewhere: a permission key is never a
// hardcoded enum, so a new permission never requires a contract change to gate an article by it.
const ConfigurableKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z][a-zA-Z0-9_.-]*$/);

export const HelpArticleUpsertRequestSchema = z.object({
  active: z.boolean().default(true),
  body: z.string().trim().min(1).max(10_000),
  category: z.string().trim().min(1).max(80),
  key: ConfigurableKeySchema,
  ordinal: z.number().int().default(0),
  requiredPermission: ConfigurableKeySchema.nullable().optional(),
  title: z.string().trim().min(1).max(200),
});

export const HelpArticleSchema = HelpArticleUpsertRequestSchema.extend({
  createdAt: IsoDateTimeSchema,
  id: UuidSchema,
  requiredPermission: z.string().nullable(),
  updatedAt: IsoDateTimeSchema,
});

export const HelpArticleListResponseSchema = z.object({ items: z.array(HelpArticleSchema) });

export type HelpArticleUpsertRequest = z.infer<typeof HelpArticleUpsertRequestSchema>;
