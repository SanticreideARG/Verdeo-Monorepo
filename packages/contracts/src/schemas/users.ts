import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

export const UserListQuerySchema = z.object({
  cursor: UuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const UserDirectoryItemSchema = z.object({
  createdAt: IsoDateTimeSchema,
  displayName: z.string().min(1),
  id: UuidSchema,
  status: z.string().min(1),
});

export const UserListResponseSchema = z.object({
  items: z.array(UserDirectoryItemSchema).readonly(),
  nextCursor: UuidSchema.nullable(),
});

export type UserListQuery = z.infer<typeof UserListQuerySchema>;
export type UserListResponse = z.infer<typeof UserListResponseSchema>;
