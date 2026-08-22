import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

export const UserListQuerySchema = z.object({
  cursor: UuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const UserDirectoryItemSchema = z.object({
  avatarUrl: z.string().nullable().optional(),
  createdAt: IsoDateTimeSchema,
  displayName: z.string().min(1),
  id: UuidSchema,
  status: z.string().min(1),
});

export const UserListResponseSchema = z.object({
  items: z.array(UserDirectoryItemSchema).readonly(),
  nextCursor: UuidSchema.nullable(),
});

export const RoleSummarySchema = z.object({
  active: z.boolean(),
  description: z.string().nullable(),
  id: UuidSchema,
  key: z.string(),
  name: z.string(),
});

export const RoleListResponseSchema = z.object({
  items: z.array(RoleSummarySchema),
});

export const PermissionCatalogEntrySchema = z.object({
  description: z.string(),
  group: z.string(),
  id: UuidSchema,
  key: z.string(),
});

export const PermissionCatalogResponseSchema = z.object({
  items: z.array(PermissionCatalogEntrySchema),
});

export const PermissionOverrideEntrySchema = z.object({
  effect: z.enum(['allow', 'deny']),
  permissionId: UuidSchema,
  permissionKey: z.string(),
  reason: z.string().nullable(),
});

export const UserAdminDetailSchema = z.object({
  avatarUrl: z.string().nullable(),
  displayName: z.string(),
  effectivePermissions: z.array(z.string()),
  email: z.string().nullable(),
  id: UuidSchema,
  overrides: z.array(PermissionOverrideEntrySchema),
  roles: z.array(RoleSummarySchema),
  status: z.string(),
});

export const UserStatusUpdateRequestSchema = z.object({
  active: z.boolean(),
});

export const UserRolesUpdateRequestSchema = z.object({
  roleIds: z.array(UuidSchema).max(20),
});

export const UserPermissionOverridesUpdateRequestSchema = z.object({
  overrides: z
    .array(
      z.object({
        effect: z.enum(['allow', 'deny']),
        permissionId: UuidSchema,
        reason: z.string().trim().max(300).optional(),
      }),
    )
    .max(200),
});

export type UserListQuery = z.infer<typeof UserListQuerySchema>;
export type UserListResponse = z.infer<typeof UserListResponseSchema>;
export type UserStatusUpdateRequest = z.infer<typeof UserStatusUpdateRequestSchema>;
export type UserRolesUpdateRequest = z.infer<typeof UserRolesUpdateRequestSchema>;
export type UserPermissionOverridesUpdateRequest = z.infer<
  typeof UserPermissionOverridesUpdateRequestSchema
>;
